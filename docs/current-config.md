# Current Bot Configuration

## Models

| Purpose | Provider | Model | Cost |
|---------|----------|-------|------|
| Primary LLM | Google (direct) | gemini-2.5-flash-lite | Free |
| Fallback 1 | OpenRouter | stepfun/step-3.5-flash:free | Free |
| Fallback 2 | OpenRouter | deepseek/deepseek-chat-v3-0324 | Paid (has credits) |
| Fallback 3 | OpenRouter | anthropic/claude-3.5-sonnet | Paid (has credits) |
| Image gen | Google (direct) | gemini-2.5-flash-image | Free |
| STT | Google (direct) | gemini-2.5-flash | Free |
| TTS | Microsoft Edge | de-DE-FlorianMultilingualNeural | Free |
| Memory embeddings | Google (direct) | Gemini embeddings | Free |

## API Keys (in container env)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | LLM, STT, image gen, memory embeddings |
| `OPENROUTER_API_KEY` | Fallback LLMs (has credits) |
| `TELEGRAM_BOT_TOKEN` | Bot `@SNooZyy_bot` |
| `PERPLEXITY_API_KEY` | Web search |

## Telegram Settings

- **Bot name**: Atlas (`@SNooZyy_bot`)
- **Group**: `-1003889708134` ("Weltthemen, aber mit KI ! :D")
- **Group policy**: allowlist, requireMention (responds to "Atlas" or @mention)
- **DM policy**: pairing (unknown senders get approval code)
- **Owner ID**: `467473650`
- **Streaming**: partial
- **Config writes**: disabled

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
