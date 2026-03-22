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
  return res.json();
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

// getOrCreateRoom and getHighscores are injected to avoid circular deps
let _getOrCreateRoom = null;
let _getHighscores = null;

function setDeps({ getOrCreateRoom, getHighscores }) {
  _getOrCreateRoom = getOrCreateRoom;
  _getHighscores = getHighscores;
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
  await sendQuizBot('setMyCommands', {
    commands: [
      { command: 'quiz', description: 'Start an Atlas Quiz — add a topic after the command' },
      { command: 'quizreset', description: 'Reset all highscores (owner only)' }
    ]
  });

  const me = await sendQuizBot('getMe');
  console.log(`[quiz-bot] @${me.result?.username} ready — /quiz command active`);

  // Long-poll loop
  while (true) {
    await pollQuizBot();
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
