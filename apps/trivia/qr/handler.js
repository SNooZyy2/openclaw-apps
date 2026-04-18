// ─── QR Command Handler ─────────────────────────────────────────────────────────

const { renderAtlasQrPng } = require('./qr-render');

let _sendBot = null;
let _botToken = '';

function setDeps({ sendBot, botToken }) {
  _sendBot = sendBot;
  _botToken = botToken;
}

async function sendBotPhoto(chatId, pngBuffer, caption, replyToMessageId) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'qr.png');
  if (caption) form.append('caption', caption);
  if (replyToMessageId) form.append('reply_to_message_id', String(replyToMessageId));

  const res = await fetch(`https://api.telegram.org/bot${_botToken}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  try { return await res.json(); } catch { return null; }
}

async function handleQrCommand(chatId, input, messageId) {
  if (!input) {
    await _sendBot('sendMessage', {
      chat_id: chatId,
      text: 'Usage: /qr <text or URL>\nExample: /qr https://example.com',
      reply_to_message_id: messageId
    });
    return;
  }

  try {
    const png = renderAtlasQrPng(input);
    const result = await sendBotPhoto(chatId, png, `QR code for: ${input}`, messageId);
    if (!result?.ok) {
      console.log(`[bot] /qr sendPhoto failed:`, JSON.stringify(result));
      await _sendBot('sendMessage', {
        chat_id: chatId,
        text: 'Failed to send QR code image.',
        reply_to_message_id: messageId
      });
    }
  } catch (err) {
    console.error(`[bot] /qr error:`, err.message);
    await _sendBot('sendMessage', {
      chat_id: chatId,
      text: `Failed to generate QR code: ${err.message}`,
      reply_to_message_id: messageId
    });
  }
  console.log(`[bot] /qr "${input.slice(0, 40)}" in chat ${chatId}`);
}

module.exports = { handleQrCommand, setDeps };
