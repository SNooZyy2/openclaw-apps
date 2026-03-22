# Setup History

## Timeline — 2026-03-21

### Initial State
- OpenClaw gateway running in Docker, connected to Telegram bot `@SNooZyy_bot`
- Primary model: `openrouter/stepfun/step-3.5-flash:free` (hitting rate limits)
- Fallbacks: `openrouter/deepseek/deepseek-chat-v3-0324`, `openrouter/anthropic/claude-3.5-sonnet`
- STT: `google/gemini-2.0-flash`
- TTS: Microsoft Edge, `en-US-MichelleNeural` (English voice, broken for German)
- Bot only responded to @mentions in groups

### Changes Made

#### Model Migration
- **Primary LLM** → `google/gemini-2.5-flash` (free, direct Google API, best free Flash model)
- **Fallbacks** → kept OpenRouter models as backup (account has credits)
- **Image gen** → `google/gemini-2.5-flash-image` (free), patched to prevent agent from overriding to paid Nano Banana 2 model
- **STT** → upgraded to `google/gemini-2.5-flash`
- **Rationale**: Google Gemini API free tier is more reliable than OpenRouter free models, avoids rate limit spam

#### Anti-Spam Fixes
- Fixed invalid `mentionPatterns` config key on group (was causing `debounce flush failed` errors)
- Disabled `configWrites` for Telegram (bot was re-adding invalid keys)
- Set `messages.suppressToolErrors: true`
- Disabled heartbeat alerts in chat (`channels.defaults.heartbeat.showOk/showAlerts: false`)
- Increased `auth.cooldowns.billingBackoffHours` to 12

#### Identity & Triggers
- Set agent identity name to "Atlas" via `agents.list[0].identity.name`
- This auto-derives mention pattern `\b@?Atlas\b` (case-insensitive)
- Group still has `requireMention: true` — bot responds to "Atlas" or @mention, not every message
- Removed manual `messages.groupChat.mentionPatterns` (identity-derived is the proper OpenClaw way)

#### TTS Fix
- Changed from `en-US-MichelleNeural` (English female) to `de-DE-FlorianMultilingualNeural` (German male, multilingual)
- Supports both German and English pronunciation

#### Exec Permissions
- Enabled `tools.elevated` for owner Telegram ID only (`467473650`)
- Allows code execution from Telegram for demos (charts, games, scripts)

#### Image Generation Patch
- Patched `/app/dist/auth-profiles-DXyJppZ2.js` line 109166 inside container
- Forces `model = undefined` so agent can't override configured image gen model
- Without patch, Gemini 2.5 Flash always specifies `google/gemini-3.1-flash-image-preview` (Nano Banana 2, paid)
- Patch is lost on container rebuild — must be re-applied

#### Known Remaining Issues
- **Duplicate images**: `image_generate` tool result sends image, then agent's final reply sends it again via `MEDIA:` token. Workaround via TOOLS.md instruction (unreliable). Root cause: no dedup between tool result media and final reply media in OpenClaw.
- **STT quality**: Some voice notes return "[No speech]" — unclear if model issue or audio quality
