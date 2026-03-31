# WP-1: QR Code Rendering Overhaul

**ADR**: [004 — QR Code Rendering Overhaul](../../adr/004-qr-code-rendering-overhaul.md)
**Status**: Completed (2026-03-31)

---

## What Was Done

### 1.1 — File Split

**Type**: Refactor | **Status**: Done

Split the monolithic `qr-render.js` (597 LOC) into three files:

| File | Lines | Responsibility |
|------|-------|----------------|
| `qr-encode.js` | 415 | QR Code Model 2 encoder — GF(256), Reed-Solomon, data encoding, matrix placement, masking |
| `qr-render.js` | 220 | ATLAS-themed PNG renderer — glow, modules, inset, logo compositing |
| `png-encode.js` | 163 | PNG encode + decode (RGBA), CRC32, pixel helpers |

All files under the 500-line project limit. The encoder has zero rendering dependencies; the renderer only needs `{ matrix, moduleCount }` from the encoder.

### 1.2 — Error Correction Level M → H

**Type**: Bug fix | **Status**: Done

Replaced all EC level M lookup tables with EC level H values (30% error recovery):

- `EC_CODEWORDS_PER_BLOCK` — H-level codewords per block, versions 1–10
- `DATA_CODEWORDS` — H-level data capacity, versions 1–10
- `NUM_BLOCKS` — H-level block counts, versions 1–10
- `FORMAT_STRINGS` — H-level format info bit patterns, masks 0–7

Source: ISO/IEC 18004:2015, Table 9. This is required because the center logo intentionally destroys QR modules — H allows up to 30% damage (vs M's 15%).

Trade-off: QR codes are slightly larger (higher version) for the same input. For typical URLs (30–80 bytes), this adds 4–8 modules per side — negligible at the current scale.

### 1.3 — Center Logo (Image Compositing)

**Type**: Feature | **Status**: Done

Replaced the pixel-art "AT/LAS" glyph rendering with full-color logo compositing:

- **Logo file**: `atlas-logo.png` — 152×152 RGBA PNG, cropped from the Atlas bot profile picture (globe + ring + "ATLAS" text)
- **PNG decoder**: Added `decodePngRgba()` to `png-encode.js` (~70 LOC) — supports 8-bit RGB and RGBA PNGs, all 5 PNG filter types (None, Sub, Up, Average, Paeth). Uses only `node:zlib` (inflateSync).
- **Bilinear scaling**: `sampleBilinear()` interpolates the logo to fit the inset area smoothly, avoiding blocky nearest-neighbor artifacts.
- **Alpha blending**: Properly composites semi-transparent logo pixels over the dark background.
- **Caching**: Logo PNG is decoded once and cached in memory (`_logoCached`).

The inset is rectangular (not square), sized to the logo's aspect ratio, capped at 25% of the QR module count per axis.

### 1.4 — Resolution Increase

**Type**: Enhancement | **Status**: Done

| Parameter | Before | After |
|-----------|--------|-------|
| `scale` | 16 | 48 |
| Image size (v3, 29 modules) | ~624×624px | ~1584×1584px |
| Margin (quiet zone) | 5 modules | 2 modules (spec minimum) |

At scale 48, each QR module is 48×48 pixels — sharp lines that survive Telegram's JPEG compression. The reduced margin (5→2) makes the QR code fill the frame instead of floating in a large black border.

### 1.5 — Visual Polish

**Type**: Enhancement | **Status**: Done

- **Inset border**: Replaced fuzzy glow border with a thin solid line (`borderThick = max(2, round(scale * 0.08))` = ~4px at scale 48)
- **Module glow**: Kept the neon glow on QR modules (reduced radius from `0.6×scale` to `0.45×scale` for cleaner look)
- **Finder pattern color**: Orange (`#ff6600`) distinct from data modules (`#ff4411`)

---

## Current File Layout

```
apps/trivia/
  qr-encode.js      — QR Code Model 2 encoder (EC-H), exports buildQrMatrix()
  qr-render.js      — ATLAS renderer, exports renderAtlasQrPng()
  png-encode.js      — PNG encode/decode, exports encodePngRgba/decodePngRgba/fillPixel
  atlas-logo.png     — 152×152 RGBA center logo (globe + ring + ATLAS text)
  quiz-bot.js        — Unchanged, imports renderAtlasQrPng from ./qr-render
```

## Runtime Characteristics

- **Memory**: ~9.5MB RGBA buffer for a version 3 QR at scale 48 (1584×1584 × 4 bytes)
- **Output size**: ~250–600KB PNG depending on QR version
- **Hot path**: Neon glow loop (`O(modules × glowRadius²)`) — ~200ms for a typical URL
- **Logo decode**: ~1ms (cached after first call)

## What Was NOT Changed

- `quiz-bot.js` — no changes needed, same `renderAtlasQrPng(input)` API
- QR encoder logic — matrix placement, masking, penalty scoring all unchanged
- The OpenClaw gateway extension (`extensions/qrcode/`) — still exists upstream, not touched
