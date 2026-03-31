# ADR-004: QR Code Rendering Overhaul

**Status**: Implemented
**Date**: 2026-03-31
**Author**: snoozyy

---

## Context

The `/qr` command generates ATLAS-branded QR codes via `qr-render.js` — a self-contained QR Code Model 2 encoder with a themed PNG renderer. Two critical problems exist:

### Problem 1: ATLAS Label Destroys Scannability

The center inset that holds the "ATLAS" text is far too wide. The label is rendered as a **single horizontal line** of 5 pixel-art glyphs (each 5×7), and the inset is sized to contain them all. For a typical URL:

- `labelPixelScale` = 6 (at scale 16)
- Label width = `(5 glyphs × 5px + 4 gaps × 2px) × 6` = **198px**
- With padding: **236px** → 15 modules wide
- A version 3 QR code (29 modules) loses **15 out of 29 modules** across its center row

This obliterates far more data modules than QR error correction level M (15% recovery) can handle. The QR code is **unscannable**.

### Problem 2: Low Resolution

Default `scale = 16` produces images around 600×600px. Telegram compresses photos aggressively. The resulting image has blurry, indistinct module boundaries — making scanner apps struggle even without the inset problem.

### Problem 3: File Size Violation

`qr-render.js` is **597 lines** — exceeding the project's 500-line limit (see CLAUDE.md conventions).

---

## Analysis of Current Architecture

The file contains three distinct responsibilities:

| Section | Lines | Purpose |
|---------|-------|---------|
| QR encoder (GF(256), Reed-Solomon, data encoding, matrix placement, masking) | 1–413 | Pure QR Code Model 2 implementation |
| Color constants + glyph bitmaps | 414–429 | ATLAS brand theme |
| PNG renderer (glow, modules, inset, label) | 430–596 | Visual output layer |

The QR encoder is correct and well-tested. The renderer is where all three problems live.

### Key Constants & Their Effects

```
scale = 16          → 16px per QR module (too low for Telegram)
marginModules = 5   → quiet zone
labelPixelScale     → derived: max(2, round(scale * 0.35))
insetModules        → derived from label dimensions, capped at 30% of moduleCount
EC level            → hardcoded M (15% error recovery)
```

The `isCenterInset()` function uses a **square** region (same width and height in modules). The label is wide, so the square is sized to the width — wasting vertical space and destroying more modules than needed.

---

## Decision

### 1. Two-Line ATLAS Label in Minimal Center Inset

Split "ATLAS" across two lines to drastically reduce inset width:

**Option A: "AT" / "LAS" (2+3 split)**
- Line 1 width: `(2×5 + 1×2) × ps` = 12 glyph-units
- Line 2 width: `(3×5 + 2×2) × ps` = 19 glyph-units
- Max width: 19 glyph-units (vs 33 today) → **42% reduction**

**Option B: "ATL" / "AS" (3+2 split)**
- Line 1 width: `(3×5 + 2×2) × ps` = 19 glyph-units
- Line 2 width: `(2×5 + 1×2) × ps` = 12 glyph-units
- Max width: 19 glyph-units — same as Option A, but top-heavy

**Option C: Center-aligned "ATLAS" stacked vertically**
- Each letter on its own row: 5 glyph-units wide × 5 rows
- Inset would be very tall (35+ rows × ps) — worse for scannability

**Recommendation: Option A ("AT" / "LAS")** — balanced visual weight, widest line (LAS) is only 19 units vs today's 33. The inset shrinks from ~15 modules to ~9 modules wide — within the ~30% error correction budget of EC level H.

### 2. Increase Resolution

| Scale | Image size (v3, 29 modules + 10 margin) | Notes |
|-------|----------------------------------------|-------|
| 16 | 624×624 | Current — blurry after Telegram compression |
| 24 | 936×936 | Better, still modest |
| 32 | 1248×1248 | Sharp, clear modules — **recommended** |
| 48 | 1872×1872 | Overkill, large buffer (14MB RGBA) |

**Recommendation: `scale = 32`** — crisp modules, reasonable memory (~6MB buffer), well within Telegram's 10MB photo limit after PNG compression.

### 3. Upgrade Error Correction to Level H

Currently using EC level M (15% recoverable). The center inset deliberately destroys modules — this is exactly the use case for EC level H (30% recoverable).

**Trade-off**: H uses more codewords for error correction → less data capacity per version → larger QR codes (higher version) for the same input. For typical URLs (30-80 bytes), this bumps version by 1-2 levels, adding 4-8 modules per side. At `scale = 32`, this is negligible visually but significantly improves scan reliability.

**This requires new lookup tables** for H-level parameters: `EC_CODEWORDS_PER_BLOCK`, `DATA_CODEWORDS`, `NUM_BLOCKS`, and `FORMAT_STRINGS` all need H-level values. The current tables only cover EC level M.

### 4. Split File Into Modules

```
qr-encode.js   — QR Code Model 2 encoder (GF(256), RS, data, matrix, masking)
                  ~410 lines, pure logic, no rendering, exports buildQrMatrix()
qr-render.js   — ATLAS-themed PNG renderer (glow, modules, inset, label)
                  ~190 lines, imports buildQrMatrix + png-encode
png-encode.js   — Unchanged (83 lines)
```

Both files stay well under 500 lines. The split is clean — the encoder has zero dependency on rendering, and the renderer only needs `{ matrix, moduleCount }` from the encoder.

---

## Open Questions

### Q1: Rectangular vs Square Inset?

Current `isCenterInset()` always uses a square. The two-line label is wider than it is tall. Options:

- **Square (current)**: simpler math, more modules destroyed than needed vertically
- **Rectangular**: tighter fit, saves modules, but needs separate width/height tracking in `isCenterInset()`

Recommendation: **Rectangular**. The extra complexity is minimal (two comparisons instead of one), and it preserves more data modules.

### Q2: Should the Inset Have a Visible Border?

Currently there's a subtle glow border around the inset. Options:

- Keep subtle glow (current)
- Add a thin solid border line (1-2px) for cleaner separation
- Add rounded corners for a more polished look

This is a visual polish decision, not a scannability concern.

### Q3: EC Level H — New Lookup Tables

Switching to EC-H requires replacing 4 arrays (10 entries each) with correct values from the QR spec (ISO 18004). These are well-documented but must be exact. Sources:

- [QR Code specification tables](https://www.thonky.com/qr-code-tutorial/error-correction-table)
- ISO/IEC 18004:2015, Table 9

Do we hardcode H-only (simpler), or make EC level configurable (more flexible)?

Recommendation: **Hardcode H-only** — we always want maximum error correction since we always have a center inset. Configurability adds complexity with no current use case.

### Q4: Maximum Inset Size as Percentage of QR Area?

QR spec says up to 30% of modules can be damaged with EC-H. But the center is where data density is highest. Safe targets:

- Conservative: 15% of module area → ~5×5 modules on a 29-module code
- Moderate: 20% of module area → ~7×7 modules
- Aggressive: 25% of module area → ~8×8 modules

Need empirical testing with real scanners (phone cameras, dedicated apps) to find the sweet spot.

### Q5: Glyph Design — Current 5×7 Bitmaps Good Enough?

The current `ATLAS_GLYPHS` are 5-wide × 7-tall 1-bit bitmaps. At higher scale (32), each glyph pixel becomes 11×11 display pixels (`labelPixelScale = max(2, round(32 * 0.35)) = 11`). This is chunky but readable.

Options:
- Keep 5×7 bitmaps (simple, retro-pixel aesthetic matches the brand)
- Design higher-res glyphs (8×12?) for smoother appearance
- Add anti-aliasing / sub-pixel rendering for the glow effect

Recommendation: **Keep 5×7** — the chunky pixel-art look is intentional branding. Higher scale makes them more visible, not worse.

### Q6: Memory/Performance at Higher Scale

At `scale = 32`, a version 5 QR code (37 modules + 10 margin = 47 modules):
- Image: 1504×1504 = 2.26M pixels × 4 bytes = **9MB RGBA buffer**
- The nested glow loop (`O(modules × glowRadius²)`) is already the hot path
- Doubling scale quadruples the glow pixel count

Mitigation: reduce `glowRadius` relative to scale, or skip glow for non-finder modules. Profile before optimizing.

---

## Implementation Plan

1. **Split `qr-render.js`** → `qr-encode.js` + `qr-render.js` (mechanical, no logic changes)
2. **Replace EC-M tables with EC-H tables** in the encoder
3. **Change `isCenterInset` to rectangular** (separate row/col bounds)
4. **Implement two-line label layout** ("AT" / "LAS"), centered in rectangular inset
5. **Bump `scale` to 32**, adjust derived constants
6. **Test with real scanners** — phone camera, Google Lens, dedicated QR apps
7. **Tune inset size** based on scan results

Steps 1-2 are independent. Steps 3-5 can be done together. Step 6-7 are empirical.

---

## Risks

- **EC-H table errors**: Wrong values = corrupt QR codes. Must validate against spec.
- **Over-sized images**: At scale 48+, PNG encoding gets slow and buffers get large. Stay at 32.
- **Scanner compatibility**: Center inset + EC-H is a well-known QR pattern (every branded QR code uses it), but exact tolerances vary by scanner implementation.
- **Breaking change**: Any QR codes previously generated and saved/printed would look different. This is fine — they were unscannable anyway.
