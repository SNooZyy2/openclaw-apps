// ─── Quiz Command Handlers ──────────────────────────────────────────────────────

const { saveHighscores } = require('./highscores');

let _getOrCreateRoom = null;
let _getHighscores = null;
let _sendBot = null;
let _getLastResultsMessage = null;
let _setLastResultsMessage = null;

function setDeps({ getOrCreateRoom, getHighscores, sendBot, getLastResultsMessage, setLastResultsMessage }) {
  _getOrCreateRoom = getOrCreateRoom;
  _getHighscores = getHighscores;
  _sendBot = sendBot;
  _getLastResultsMessage = getLastResultsMessage;
  _setLastResultsMessage = setLastResultsMessage;
}

const DEFAULT_QUESTION_COUNT = require('../config').DEFAULT_QUESTION_COUNT;

async function handleQuizCommand(chatId, topic, messageId, threadId) {
  // Delete previous game's results message
  const lastResults = _getLastResultsMessage();
  if (lastResults) {
    _sendBot('deleteMessage', {
      chat_id: lastResults.chatId,
      message_id: lastResults.messageId
    }).catch(() => {});
    _setLastResultsMessage(null);
  }

  const room = _getOrCreateRoom(topic, DEFAULT_QUESTION_COUNT);
  const joinUrl = `https://t.me/AtlasQuizBotBot/atlas_quiz?startapp=${room.code}`;

  const result = await _sendBot('sendMessage', {
    chat_id: chatId,
    text: `🎯 Atlas Quiz!\n\nTopic: ${topic}\n${room.questionCount} questions, 15 seconds each\n\nTap below to join!`,
    reply_markup: { inline_keyboard: [[{ text: '▶ Join Atlas Quiz', url: joinUrl }]] },
    reply_to_message_id: messageId,
    ...(threadId && { message_thread_id: threadId })
  });

  if (!result?.ok) {
    console.log(`[bot] sendMessage failed:`, JSON.stringify(result));
  }
  // Store the bot's message ID + chat ID + thread so we can post results to the right thread
  if (result?.ok && result.result?.message_id) {
    room.telegramMessage = { chatId, messageId: result.result.message_id, threadId };
  }

  console.log(`[bot] /quiz "${topic}" → room ${room.code} in chat ${chatId}`);
}

async function handleQuizReset(chatId, userId, messageId, threadId) {
  const OWNER_ID = 467473650;
  const thread = threadId ? { message_thread_id: threadId } : {};
  if (userId !== OWNER_ID) {
    await _sendBot('sendMessage', { chat_id: chatId, text: 'Only the owner can reset highscores.', reply_to_message_id: messageId, ...thread });
  } else {
    saveHighscores({ games: [], players: {} });
    await _sendBot('sendMessage', { chat_id: chatId, text: 'Highscores reset.', reply_to_message_id: messageId, ...thread });
    console.log('[bot] highscores reset by owner');
  }
}

async function handleQuizStop(chatId, userId, messageId, threadId) {
  const OWNER_ID = 467473650;
  const thread = threadId ? { message_thread_id: threadId } : {};
  if (userId !== OWNER_ID) {
    await _sendBot('sendMessage', { chat_id: chatId, text: 'Only the owner can stop games.', reply_to_message_id: messageId, ...thread });
  } else {
    const { rooms } = require('./game');
    let count = 0;
    for (const [code, room] of rooms) {
      room.broadcast({ type: 'error', message: 'Game stopped by admin.' });
      room.destroy();
      rooms.delete(code);
      count++;
    }
    await _sendBot('sendMessage', { chat_id: chatId, text: count > 0 ? `Stopped ${count} game(s).` : 'No active games.', reply_to_message_id: messageId, ...thread });
    console.log(`[bot] /quizstop — killed ${count} rooms`);
  }
}

module.exports = { handleQuizCommand, handleQuizReset, handleQuizStop, setDeps };
