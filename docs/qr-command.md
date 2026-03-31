# /qr Command — ATLAS-Branded QR Code Generator

## Overview

The `/qr` command generates ATLAS-branded QR code images directly in Telegram. It runs inside the quiz bot process (`@AtlasQuizBotBot`), completely independent of the OpenClaw gateway.

## Usage

| Command | Result |
|---------|--------|
| `/qr https://example.com` | QR code PNG with caption |
| `/qr Hello World` | QR code encoding arbitrary text |
| `/qr` (no args) | Usage hint |

## Architecture

```
@AtlasQuizBotBot (quiz-bot.js)
├── /quiz  — trivia game
├── /qr    — QR code generator    ← runs here
├── /costs — API usage stats
├── /quizstop, /quizreset — admin
```

The QR code is generated entirely in-process (no external APIs, no shell commands, no temp files). The pipeline is:

```
input text → qr-render.js (QR matrix + ATLAS branding) → png-encode.js (raw PNG) → sendPhoto (Telegram API)
```

## File Map

| File | Lines | Purpose |
|------|-------|---------|
| `qr-encode.js` | ~415 | QR Code Model 2 encoder (GF(256), Reed-Solomon, byte mode, EC level H, versions 1-10) |
| `qr-render.js` | ~220 | ATLAS neon-glow PNG renderer with logo compositing |
| `png-encode.js` | ~163 | PNG encode + decode (RGBA, all 5 filter types) using only `node:zlib` |
| `atlas-logo.png` | — | 152×152 RGBA center logo (globe + ring + ATLAS text) |
| `quiz-bot.js` | ~298 | Telegram polling loop — `handleQrCommand()` + `sendQuizBotPhoto()` |

## Technical Details

### QR Encoding
- QR Code Model 2, auto version selection (1-10)
- Byte mode encoding, error correction level H (30% recovery)
- Full from-scratch implementation: Galois Field GF(256), Reed-Solomon error correction, data interleaving, 8-mask evaluation
- Scale 48 (each module = 48×48px), margin 2 modules — sharp on Telegram
- Max input: ~152 bytes (version 10, EC-H). Longer input is clamped and may not scan.

### ATLAS Branding
- Dark background (`#06060a`) with neon orange modules (`#ff4411`)
- Finder patterns in accent orange (`#ff6600`)
- Per-module glow effect (radial falloff, drawn behind solid modules)
- Center inset with `atlas-logo.png` composited via bilinear scaling + alpha blending
- Logo decoded once at startup and cached; inset capped at ~25% of QR area

### Photo Upload
- Uses Node 22 built-in `FormData` + `Blob` (no npm packages)
- Sends PNG buffer directly to Telegram `sendPhoto` API
- No temp files written to disk

### Dependencies
- **Zero npm dependencies** for QR/PNG. Only uses `node:zlib` (deflateSync).
- The quiz bot itself depends on `ws` (WebSocket) for the game server, but QR doesn't use it.

## Origin

The QR renderer was originally an OpenClaw gateway plugin (`extensions/qrcode/`). It was extracted and ported to standalone CommonJS on 2026-03-31 because:

1. **Failure isolation** — `/qr` and `/quiz` now survive gateway crashes/restarts
2. **Simpler deployment** — no plugin system, no SDK imports, no build step
3. **Single process** — quiz bot already runs 24/7 under systemd; adding `/qr` is free

### What was ported

| OpenClaw source | Quiz bot target | Changes |
|-----------------|-----------------|---------|
| `src/media/png-encode.ts` | `png-encode.js` | Strip types, ESM→CJS, added `decodePngRgba()` for logo loading |
| `extensions/qrcode/src/qr-render.ts` | `qr-encode.js` + `qr-render.js` | Split encoder/renderer, EC M→H, pixel-art label→logo compositing, scale 16→48 |
| `extensions/qrcode/index.ts` | `quiz-bot.js` (handler) | Only the `/qr` slash command; the `generate_qr_code` tool was dropped |

### What was NOT ported

- The `generate_qr_code` agent tool (AI-callable tool for generating QR codes in conversation). Not needed — `/qr` is a direct user command.
- The OpenClaw plugin SDK wiring (`openclaw.plugin.json`, lifecycle hooks, tool registration).

### Cleanup done in OpenClaw repo

- Removed `generate_qr_code` from the trusted tools list in `src/agents/pi-embedded-subscribe.tools.ts`
- The `extensions/qrcode/` directory remains in the OpenClaw repo (upstream code) but is not loaded locally

## Troubleshooting

**`/qr` not responding:**
- Check bot is running: `sudo systemctl status atlas-quiz-bot`
- Check logs: `tail -20 ~/openclaw-apps/apps/trivia/server.log`
- Look for `[quiz-bot] /qr` log lines

**QR code doesn't scan:**
- Input may be too long (>152 bytes at EC-H). Try shorter text.
- The center logo inset covers ~25% of modules — EC-H can correct up to 30% errors. Very dense QR codes near the version-10 limit may not scan reliably.

**sendPhoto fails:**
- Check `QUIZ_BOT_TOKEN` is set in `.env`
- Look for `[quiz-bot] /qr sendPhoto failed:` in logs
- Telegram has a 10MB photo limit; QR PNGs are typically 20-40KB.
