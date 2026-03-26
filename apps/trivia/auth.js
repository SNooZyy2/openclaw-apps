// ─── Telegram initData Verification ─────────────────────────────────────────────
// Validates the HMAC signature on Telegram WebApp initData to verify user identity.
// See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLOCK_SKEW_MS = 60 * 1000;       // 60 seconds

/**
 * Verify Telegram WebApp initData and extract the authenticated user.
 *
 * @param {string} initData  — raw query string from tg.initData
 * @param {string} botToken  — the bot token that signed this WebApp session
 * @param {object} [opts]
 * @param {number} [opts.ttlMs]       — max age of auth_date (default 30 min, 0 = skip)
 * @param {boolean} [opts.skipTtl]    — skip TTL check entirely (for reconnecting players)
 * @returns {{ id: string, firstName: string, lastName: string, username: string }}
 * @throws {Error} on any verification failure
 */
function verifyTelegramInitData(initData, botToken, opts = {}) {
  if (!initData || typeof initData !== 'string') {
    throw new Error('initData is empty or not a string');
  }
  if (!botToken || typeof botToken !== 'string') {
    throw new Error('botToken is empty or not a string');
  }

  // 1. Parse query string
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new Error('initData missing hash parameter');
  }

  // 2. Build data_check_string: sort remaining params alphabetically, join with \n
  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  // 3. Compute secret key: HMAC-SHA256("WebAppData", bot_token)
  //    "WebAppData" is the key, bot_token is the data
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // 4. Compute HMAC-SHA256(secret_key, data_check_string)
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // 5. Compare (length check prevents timingSafeEqual RangeError on malformed hash)
  const computedBuf = Buffer.from(computedHash, 'hex');
  const providedBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(computedBuf, providedBuf)) {
    throw new Error('initData hash mismatch — signature invalid');
  }

  // 6. Check auth_date TTL
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  if (!opts.skipTtl && ttlMs > 0) {
    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      throw new Error('initData missing auth_date');
    }
    const authDateMs = parseInt(authDateStr, 10) * 1000;
    if (Number.isNaN(authDateMs)) {
      throw new Error('initData auth_date is not a valid number');
    }
    const now = Date.now();
    if (authDateMs > now + CLOCK_SKEW_MS) {
      throw new Error('initData auth_date is in the future');
    }
    if (now - authDateMs > ttlMs) {
      throw new Error(`initData expired (auth_date ${Math.round((now - authDateMs) / 1000)}s ago, TTL ${ttlMs / 1000}s)`);
    }
  }

  // 7. Extract user
  const userStr = params.get('user');
  if (!userStr) {
    throw new Error('initData missing user parameter');
  }
  let user;
  try {
    user = JSON.parse(userStr);
  } catch {
    throw new Error('initData user parameter is not valid JSON');
  }

  if (!user.id) {
    throw new Error('initData user missing id');
  }

  return {
    id: String(user.id),
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || ''
  };
}

module.exports = { verifyTelegramInitData };
