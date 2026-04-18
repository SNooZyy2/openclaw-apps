// ─── Telegram Bot — Polling Loop & Command Router ───────────────────────────────
// Thin router: parse command, delegate to quiz/handler or qr/handler.
// Shared utilities (sendBot, costs) stay here.

const qrHandler = require('./qr/handler');
const quizHandler = require('./quiz/handler');

const BOT_TOKEN = process.env.QUIZ_BOT_TOKEN || '';
let botOffset = 0;
let lastResultsMessage = null; // { chatId, messageId } — deleted when next game starts

async function sendBot(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  try { return await res.json(); } catch { return null; }
}

function getLastResultsMessage() {
  return lastResultsMessage;
}

function setLastResultsMessage(val) {
  lastResultsMessage = val;
}

function getBotToken() {
  return BOT_TOKEN;
}

// readAtlasUsage is injected to avoid circular deps
let _readAtlasUsage = null;

function setDeps({ getOrCreateRoom, getHighscores, readAtlasUsage }) {
  _readAtlasUsage = readAtlasUsage;

  // Forward dependencies to feature handlers
  quizHandler.setDeps({
    getOrCreateRoom,
    getHighscores,
    sendBot,
    getLastResultsMessage,
    setLastResultsMessage
  });
  qrHandler.setDeps({ sendBot, botToken: BOT_TOKEN });
}

async function handleCostsCommand(chatId, messageId) {
  try {
    if (!_readAtlasUsage) throw new Error('Usage data not available');
    const usage = _readAtlasUsage();
    const costEur = (usage.estimatedCostUsd * 0.92);
    const fmtTokens = (n) => n > 1_000_000
      ? (n / 1_000_000).toFixed(1) + 'M'
      : Math.round(n / 1000) + 'K';

    const lines = [
      '📊 Atlas API Costs',
      '',
      `Input: ${fmtTokens(usage.totalInputTokens)} tokens`,
      `Output: ${fmtTokens(usage.totalOutputTokens)} tokens`,
      `Total: ${fmtTokens(usage.totalTokens)} tokens`,
      '',
      `Cost: ~€${costEur.toFixed(2)} (~$${usage.estimatedCostUsd.toFixed(2)})`,
      `Sessions: ${usage.sessions}`,
      '',
      `Pricing: Gemini 2.5 Flash`,
      `$0.15/1M input, $0.60/1M output`
    ];

    await sendBot('sendMessage', {
      chat_id: chatId,
      text: lines.join('\n'),
      reply_to_message_id: messageId
    });
  } catch (err) {
    await sendBot('sendMessage', {
      chat_id: chatId,
      text: `Could not read usage data: ${err.message}`,
      reply_to_message_id: messageId
    });
  }
  console.log(`[bot] /costs in chat ${chatId}`);
}

async function pollBot() {
  try {
    const data = await sendBot('getUpdates', {
      offset: botOffset,
      timeout: 30,
      allowed_updates: ['message']
    });
    if (!data?.ok || !data.result) return;

    for (const update of data.result) {
      botOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text) continue;

      // /qr with no args — show usage
      const qrBareMatch = msg.text.match(/^\/qr(?:@\S+)?\s*$/i);
      if (qrBareMatch) {
        await sendBot('sendMessage', {
          chat_id: msg.chat.id,
          text: 'Usage: /qr <text or URL>\nExample: /qr https://example.com',
          reply_to_message_id: msg.message_id
        });
        continue;
      }

      // /qr <text> — generate ATLAS-branded QR code
      const qrMatch = msg.text.match(/^\/qr(?:@\S+)?\s+(.*)/i);
      if (qrMatch) {
        await qrHandler.handleQrCommand(msg.chat.id, qrMatch[1].trim(), msg.message_id);
        continue;
      }

      // /cost or /costs — show Atlas API costs
      const costsMatch = msg.text.match(/^\/costs?(?:@\S+)?$/i);
      if (costsMatch) {
        await handleCostsCommand(msg.chat.id, msg.message_id);
        continue;
      }

      // /reset — owner only, wipes highscores
      const resetMatch = msg.text.match(/^\/quiz[-_]?reset(?:@\S+)?$/i);
      if (resetMatch) {
        await quizHandler.handleQuizReset(msg.chat.id, msg.from?.id, msg.message_id);
        continue;
      }

      // /quizstop — kill all active rooms
      const stopMatch = msg.text.match(/^\/quiz[-_]?stop(?:@\S+)?$/i);
      if (stopMatch) {
        await quizHandler.handleQuizStop(msg.chat.id, msg.from?.id, msg.message_id);
        continue;
      }

      const match = msg.text.match(/^\/quiz(?:@\S+)?\s*(.*)/i);
      if (!match) {
        const startMatch = msg.text.match(/^\/start\s*(.*)/i);
        if (startMatch) {
          const topic = startMatch[1].trim() || 'General Knowledge';
          await quizHandler.handleQuizCommand(msg.chat.id, topic, msg.message_id);
        }
        continue;
      }
      const topic = match[1].trim() || 'General Knowledge';
      await quizHandler.handleQuizCommand(msg.chat.id, topic, msg.message_id);
    }
  } catch (err) {
    if (!String(err).includes('abort')) {
      console.error('[bot] poll error:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function startBot() {
  if (!BOT_TOKEN) {
    console.log('[bot] QUIZ_BOT_TOKEN not set — bot disabled');
    console.log('[bot] Create a bot via @BotFather, get the token, and set QUIZ_BOT_TOKEN in openclaw/.env');
    return;
  }

  // Register commands in the bot menu
  try {
    await sendBot('setMyCommands', {
      commands: [
        { command: 'quiz', description: 'Start an Atlas Quiz — add a topic after the command' },
        { command: 'qr', description: 'Generate an ATLAS-branded QR code from text or a URL' },
        { command: 'quizstop', description: 'Stop all active games (owner only)' },
        { command: 'cost', description: 'Show Atlas API usage & costs' },
        { command: 'quizreset', description: 'Reset all highscores (owner only)' }
      ]
    });
    const me = await sendBot('getMe');
    console.log(`[bot] @${me?.result?.username} ready`);
  } catch (err) {
    console.error(`[bot] init failed: ${err.message}, starting poll loop anyway`);
  }

  // Long-poll loop
  while (true) {
    try {
      await pollBot();
    } catch (err) {
      console.error(`[bot] fatal poll error: ${err.message}, resuming in 5s`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

module.exports = {
  sendBot,
  startBot,
  getLastResultsMessage,
  setLastResultsMessage,
  getBotToken,
  setDeps
};
