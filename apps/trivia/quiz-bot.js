// ─── Telegram Quiz Bot ──────────────────────────────────────────────────────────
// Separate bot token (QUIZ_BOT_TOKEN) that ONLY handles /quiz commands.
// This avoids conflicts with OpenClaw's main bot polling.

const { BASE_URL, DEFAULT_QUESTION_COUNT } = require('./config');
const { saveHighscores } = require('./highscores');

const QUIZ_BOT_TOKEN = process.env.QUIZ_BOT_TOKEN || '';
let quizBotOffset = 0;
let lastResultsMessage = null; // { chatId, messageId } — deleted when next game starts

async function sendQuizBot(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${QUIZ_BOT_TOKEN}/${method}`, {
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

function getQuizBotToken() {
  return QUIZ_BOT_TOKEN;
}

// getOrCreateRoom, getHighscores, readAtlasUsage are injected to avoid circular deps
let _getOrCreateRoom = null;
let _getHighscores = null;
let _readAtlasUsage = null;

function setDeps({ getOrCreateRoom, getHighscores, readAtlasUsage }) {
  _getOrCreateRoom = getOrCreateRoom;
  _getHighscores = getHighscores;
  _readAtlasUsage = readAtlasUsage;
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

    await sendQuizBot('sendMessage', {
      chat_id: chatId,
      text: lines.join('\n'),
      reply_to_message_id: messageId
    });
  } catch (err) {
    await sendQuizBot('sendMessage', {
      chat_id: chatId,
      text: `Could not read usage data: ${err.message}`,
      reply_to_message_id: messageId
    });
  }
  console.log(`[quiz-bot] /costs in chat ${chatId}`);
}

async function handleQuizCommand(chatId, topic, messageId) {
  // Delete previous game's results message
  if (lastResultsMessage) {
    sendQuizBot('deleteMessage', {
      chat_id: lastResultsMessage.chatId,
      message_id: lastResultsMessage.messageId
    }).catch(() => {});
    lastResultsMessage = null;
  }

  const room = _getOrCreateRoom(topic, DEFAULT_QUESTION_COUNT);
  const joinUrl = `${BASE_URL}/game?room=${room.code}`;

  const result = await sendQuizBot('sendMessage', {
    chat_id: chatId,
    text: `🎯 Atlas Quiz!\n\nTopic: ${topic}\n${room.questionCount} questions, 15 seconds each\n\nTap below to join!`,
    reply_markup: { inline_keyboard: [[{ text: '▶ Join Atlas Quiz', url: joinUrl }]] },
    reply_to_message_id: messageId
  });

  if (!result?.ok) {
    console.log(`[quiz-bot] sendMessage failed:`, JSON.stringify(result));
  }
  // Store the bot's message ID + chat ID so we can delete it when the game ends
  if (result?.ok && result.result?.message_id) {
    room.telegramMessage = { chatId, messageId: result.result.message_id };
  }

  console.log(`[quiz-bot] /quiz "${topic}" → room ${room.code} in chat ${chatId}`);
}

async function pollQuizBot() {
  try {
    const data = await sendQuizBot('getUpdates', {
      offset: quizBotOffset,
      timeout: 30,
      allowed_updates: ['message']
    });
    if (!data?.ok || !data.result) return;

    for (const update of data.result) {
      quizBotOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text) continue;

      // /cost or /costs — show Atlas API costs
      const costsMatch = msg.text.match(/^\/costs?(?:@\S+)?$/i);
      if (costsMatch) {
        await handleCostsCommand(msg.chat.id, msg.message_id);
        continue;
      }

      // /reset — owner only, wipes highscores
      const resetMatch = msg.text.match(/^\/quiz[-_]?reset(?:@\S+)?$/i);
      if (resetMatch) {
        const OWNER_ID = 467473650;
        if (msg.from?.id !== OWNER_ID) {
          await sendQuizBot('sendMessage', { chat_id: msg.chat.id, text: 'Only the owner can reset highscores.', reply_to_message_id: msg.message_id });
        } else {
          saveHighscores({ games: [], players: {} });
          await sendQuizBot('sendMessage', { chat_id: msg.chat.id, text: 'Highscores reset.', reply_to_message_id: msg.message_id });
          console.log('[quiz-bot] highscores reset by owner');
        }
        continue;
      }

      // /quizstop — kill all active rooms
      const stopMatch = msg.text.match(/^\/quiz[-_]?stop(?:@\S+)?$/i);
      if (stopMatch) {
        const OWNER_ID = 467473650;
        if (msg.from?.id !== OWNER_ID) {
          await sendQuizBot('sendMessage', { chat_id: msg.chat.id, text: 'Only the owner can stop games.', reply_to_message_id: msg.message_id });
        } else {
          const { rooms } = require('./game');
          let count = 0;
          for (const [code, room] of rooms) {
            room.broadcast({ type: 'error', message: 'Game stopped by admin.' });
            room.destroy();
            rooms.delete(code);
            count++;
          }
          await sendQuizBot('sendMessage', { chat_id: msg.chat.id, text: count > 0 ? `Stopped ${count} game(s).` : 'No active games.', reply_to_message_id: msg.message_id });
          console.log(`[quiz-bot] /quizstop — killed ${count} rooms`);
        }
        continue;
      }

      const match = msg.text.match(/^\/quiz(?:@\S+)?\s*(.*)/i);
      if (!match) {
        const startMatch = msg.text.match(/^\/start\s*(.*)/i);
        if (startMatch) {
          const topic = startMatch[1].trim() || 'General Knowledge';
          await handleQuizCommand(msg.chat.id, topic, msg.message_id);
        }
        continue;
      }
      const topic = match[1].trim() || 'General Knowledge';
      await handleQuizCommand(msg.chat.id, topic, msg.message_id);
    }
  } catch (err) {
    if (!String(err).includes('abort')) {
      console.error('[quiz-bot] poll error:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function startQuizBot() {
  if (!QUIZ_BOT_TOKEN) {
    console.log('[quiz-bot] QUIZ_BOT_TOKEN not set — /quiz command disabled');
    console.log('[quiz-bot] Create a bot via @BotFather, get the token, and set QUIZ_BOT_TOKEN in openclaw/.env');
    return;
  }

  // Register commands in the bot menu
  try {
    await sendQuizBot('setMyCommands', {
      commands: [
        { command: 'quiz', description: 'Start an Atlas Quiz — add a topic after the command' },
        { command: 'quizstop', description: 'Stop all active games (owner only)' },
        { command: 'cost', description: 'Show Atlas API usage & costs' },
        { command: 'quizreset', description: 'Reset all highscores (owner only)' }
      ]
    });
    const me = await sendQuizBot('getMe');
    console.log(`[quiz-bot] @${me?.result?.username} ready — /quiz command active`);
  } catch (err) {
    console.error(`[quiz-bot] init failed: ${err.message}, starting poll loop anyway`);
  }

  // Long-poll loop
  while (true) {
    try {
      await pollQuizBot();
    } catch (err) {
      console.error(`[quiz-bot] fatal poll error: ${err.message}, resuming in 5s`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

module.exports = {
  sendQuizBot,
  startQuizBot,
  QUIZ_BOT_TOKEN,
  getLastResultsMessage,
  setLastResultsMessage,
  getQuizBotToken,
  setDeps
};
