# Current Bot Configuration

## Models

| Purpose | Provider | Model | Cost |
|---------|----------|-------|------|
| Primary LLM | Google (direct) | gemini-2.5-flash | Free |
| Fallback 1 | OpenRouter | stepfun/step-3.5-flash:free | Free |
| Fallback 2 | OpenRouter | deepseek/deepseek-chat-v3-0324 | Paid (has credits) |
| Fallback 3 | OpenRouter | anthropic/claude-3.5-sonnet | Paid (has credits) |
| Image gen | Google (direct) | gemini-2.5-flash-image | Free |
| STT | Google (direct) | gemini-2.5-flash | Free |
| TTS | Microsoft Edge | de-DE-FlorianMultilingualNeural | Free |
| Memory embeddings | Google (direct) | Gemini embeddings | Free |

## API Keys

### OpenClaw Gateway (in container env)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | LLM, STT, image gen, memory embeddings |
| `OPENROUTER_API_KEY` | Fallback LLMs (has credits) |
| `TELEGRAM_BOT_TOKEN` | Bot `@SNooZyy_bot` |
| `PERPLEXITY_API_KEY` | Web search |

### Quiz Bot (in ~/openclaw/.env, loaded by systemd)

| Variable | Purpose |
|----------|---------|
| `QUIZ_BOT_TOKEN` | Bot `@AtlasQuizBotBot` (separate from main bot) |
| `GEMINI_API_KEY` | Question generation (Gemini 3 Flash Preview) |
| `PERPLEXITY_API_KEY` | Primary question generator (search-grounded) |
| `OPENROUTER_API_KEY` | Fallback LLM for questions |
| `PORT` | Game server port (default 8080) |

## Telegram Settings

### Main Bot (Atlas)
- **Bot name**: Atlas (`@SNooZyy_bot`)
- **Group**: `-1003889708134` ("Weltthemen, aber mit KI ! :D")
- **Group policy**: allowlist, requireMention (responds to "Atlas" or @mention)
- **DM policy**: pairing (unknown senders get approval code)
- **Owner ID**: `467473650`
- **Streaming**: partial
- **Config writes**: disabled

### Quiz Bot
- **Bot name**: `@AtlasQuizBotBot`
- **Process**: Separate from OpenClaw gateway, managed by systemd (`atlas-quiz-bot`)
- **Commands**: `/quiz`, `/qr`, `/costs`, `/quizstop`, `/quizreset`
- **Mini App**: `atlas_quiz` (Web App attached to the bot)

## Permissions

- **Elevated exec**: enabled, owner only (Telegram ID 467473650)
- **Tool deny list**: empty (all tools available)
- **Tool error suppression**: enabled
- **Heartbeat alerts**: disabled in chat

## Free Tier Limits (Google Gemini)

- 15 requests/minute
- 1,500 requests/day
- 1M tokens/minute
- Monitor at: https://aistudio.google.com/app/plan
