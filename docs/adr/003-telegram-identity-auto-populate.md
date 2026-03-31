# ADR-003: Server-Side Telegram Identity Verification

**Status**: Implemented
**Date**: 2026-03-26

---

## Context

Players join Atlas Quiz via an invite link sent by `@AtlasQuizBotBot` in a Telegram group. Telegram opens the link as a WebApp, injecting identity data. Currently, the client reads `tg.initDataUnsafe.user` and sends the name/ID to the server — but this data is unverified. The server blindly trusts whatever the client provides.

All players are members of the Telegram group. Browser access without Telegram context is not a supported use case.

### Problems

- **Names are unverified**: The server trusts client-provided identity. Verification is available but unused.
- **No profile photos rendered**: `photo_url` exists client-side but is never displayed.
- **Highscores aren't tied to real identities**: Scores use unverified IDs that could theoretically change between sessions.

---

## Decision

Validate Telegram identity **server-side** using `initData` HMAC signature verification. Auto-populate player names from verified data. Reject joins without valid `initData` — Telegram WebApp is the only supported entry point.

---

## Design

### 1. Server-Side `initData` Validation

Telegram Web Apps provide `initData` — a query string signed with an HMAC using the bot token.

**Verification steps** (from Telegram docs):
1. Parse `initData` as a query string
2. Extract the `hash` parameter
3. Sort remaining parameters alphabetically, join as `key=value\n`
4. Compute `secret_key = HMAC-SHA256("WebAppData", bot_token)` — "WebAppData" is the **key**, bot_token is the **data**
5. Compute `HMAC-SHA256(secret_key, data_check_string)`
6. Compare with extracted `hash`

**What this gives us**: A verified `user` object containing `id`, `first_name`, `last_name`, `username`, `language_code`, and `is_premium`. Note: `photo_url` is **not** in the signed payload — see Section 3.

**Which bot token**: The invite link is sent by `@AtlasQuizBotBot` (`QUIZ_BOT_TOKEN`), so `initData` is signed with that token. The verifier takes the token as a parameter in case this changes.

**Where to implement**: New `auth.js` module with `verifyTelegramInitData(initData, botToken)`. Called during the WebSocket `join` flow.

### 2. Modified Join Flow

**Current flow**:
```
Client: tgUser = tg.initDataUnsafe.user  (unverified)
Client → Server: { type: 'join', roomCode, player: { id, name, photo } }
Server: trusts client-provided id/name/photo
```

**New flow**:
```
Client → Server: { type: 'join', roomCode, initData: tg.initData, photo: tg.initDataUnsafe.user.photo_url }
Server: verifyTelegramInitData(initData, QUIZ_BOT_TOKEN)
Server: extracts verified { id, first_name, last_name }
Server: creates/reconnects player with verified identity
Server → Client: { type: 'joined', you: id, name: verifiedName, ... }
```

**If verification fails**: Reject the join with an error message. Since all players come through Telegram, a verification failure means something is actually wrong (stale session, token mismatch) — not a legitimate browser user.

**Name input**: Remove entirely. All players get their Telegram name. The `rename` WebSocket message is removed — names come from Telegram and aren't editable.

### 3. Profile Photos

`photo_url` is **not** in the signed `initData` payload. Two options:

- **Option A**: Bot API `getUserProfilePhotos` call per join — adds latency, two API calls (get file ID, then get URL).
- **Option B**: Client sends `photo_url` from `initDataUnsafe` alongside `initData`. Unverified but low-risk in a trusted group — the worst case is someone shows a different photo to friends.

**Decision**: Option B. Accept client-provided `photo_url` for display after identity is verified via `initData`.

**Rendering**: Replace initial-letter avatar with `<img>` + `onerror` fallback to the letter circle. Photo URLs may expire — use for current session only.

### 4. `initData` Expiry / `auth_date`

`initData` includes `auth_date` (Unix timestamp of when the WebApp opened). Telegram doesn't enforce a TTL — we do it server-side.

- **TTL**: 30 minutes. A trivia game takes ~3 minutes, lobby wait is typically under 10 minutes. 30 minutes is generous enough to cover slow joiners while limiting stale sessions.
- **Reconnection**: The client auto-reconnects on WebSocket close and resends the same `initData`. The TTL is only enforced on **initial join** (player ID not yet in the room's `players` Map). On reconnection (player ID already exists in this room), skip the TTL check — the identity was already verified on first join.
- **Clock skew**: Accept `auth_date` up to 60 seconds ahead of server time.

### 5. ID Type Normalization

Telegram user IDs are numbers. The current code uses them as Map keys and compares with `==` in the client. When extracting from verified `initData`, normalize to string: `String(user.id)`. This makes Map lookups and client comparisons explicit rather than relying on coercion.

### 6. Highscores Migration

Existing `highscores.json` contains scores tied to unverified IDs. Since the old data has no integrity guarantee:

**Decision**: Wipe `highscores.json` on deploy. Start fresh with verified-only scores. This is a small friend group — nobody will miss historical scores enough to justify a migration.

### 7. Impact on Existing Features

| Feature | Impact |
|---|---|
| Ready-up lobby | No change |
| Reconnection | **Improved** — Telegram ID is stable across tabs/sessions |
| Highscores | **Reset and improved** — tied to verified Telegram IDs |
| Name input | **Removed** — names come from Telegram |
| Rename | **Removed** — not needed |
| Player avatars | **Enhanced** — profile photos from client |
| Leave/disconnect | No change |
| Quiz bot invite | No change — URL is the same |

---

## Implementation Plan

### WP-1: Server-Side Verification & Auth Module
- Create `auth.js` with `verifyTelegramInitData(initData, botToken)`
- HMAC: `HMAC-SHA256("WebAppData", bot_token)` as secret key
- `auth_date` TTL: 30 minutes, skipped for reconnecting players (check per-room `players` Map)
- Normalize user ID to string
- Test with a real `initData` captured from a Telegram session with `@AtlasQuizBotBot` — Telegram does not publish test vectors with known bot tokens, so the test fixture must be generated from the actual bot

### WP-2: Join Flow & Client Changes
- Modify WebSocket `join` handler to require `initData`
- Verify on server, extract user data, reject on failure
- Accept client-provided `photo_url` alongside `initData`
- Client: send `tg.initData` + `photo_url` instead of building player object from `initDataUnsafe`
- Remove name input HTML/CSS/JS
- Remove `rename` WebSocket message handler
- Wipe `highscores.json`

### WP-3: Profile Photo Rendering
- Render `photo_url` in lobby avatar circles with `<img>` + `onerror` fallback
- Render in player strip during game
- Add CSS for circular photo avatars

---

## Alternatives Considered

### 1. Keep Using `initDataUnsafe` (Status Quo)
- Pros: Simple, already works
- Cons: Identity unverified, names could drift between sessions
- **Rejected**: Verification is straightforward and available — no reason not to use it

### 2. Custom Auth Token via Bot API
- Bot generates a one-time token at invite time, embeds in URL
- Pros: Works even if Telegram WebApp API changes
- Cons: Token management, doesn't give user profile data
- **Rejected**: `initData` verification is simpler and purpose-built

### 3. OAuth via Telegram Login Widget
- Pros: Full OAuth flow
- Cons: Redirect dance, terrible UX for a quick trivia game
- **Rejected**: Way too heavy

---

## Rollback Plan

If verification breaks in production (bot token rotation, Telegram API changes):

1. Revert the `join` handler to accept client-provided `player` data without verification. The only code change is bypassing `verifyTelegramInitData` — the rest of the pipeline (player creation, game flow) is identity-source-agnostic.
2. Monitor: log all verification failures server-side. A sudden spike indicates a systemic issue.
