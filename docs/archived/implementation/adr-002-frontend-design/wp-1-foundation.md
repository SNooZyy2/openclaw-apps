# WP-1: Foundation & Depth

**ADR**: [002 — Frontend Design](../../adr/002-frontend-design-improvements.md)
**Priority**: P0 (do first)
**Effort**: Small — pure CSS, no JS changes
**Files**: `style.css`

## Goal

Replace flat backgrounds and solid-color elements with depth, gradients, and glow. After this WP, the app looks premium instead of prototype-y.

---

## Issues

### 1.1 — Background gradient

Replace flat `#1a1a2e` body background with a subtle radial gradient.

```css
body {
  background: radial-gradient(ellipse at 50% 30%, #1f2548 0%, #1a1a2e 50%, #111122 100%);
}
```

**Acceptance**: Background has visible depth. No performance impact.

---

### 1.2 — Card glass effect

Add glassmorphism to all card-like elements: `.player-item`, `.standing-item`, `.reveal-opt`, `.fun-fact`, `.summary-text`.

```css
background: rgba(22, 33, 62, 0.7);
border: 1px solid rgba(255, 255, 255, 0.06);
```

Skip `backdrop-filter: blur` — too expensive on low-end Android. Fake it with semi-transparency.

**Acceptance**: Cards feel layered on top of the background, not flat.

---

### 1.3 — Answer button gradients & glow

Replace flat button colors with top-to-bottom gradients and add glow on selection.

- Each button: `linear-gradient(to bottom, color, darkerColor)`
- Selected: `box-shadow: 0 0 20px rgba(color, 0.4); outline: none;`
- Locked/dimmed: `opacity: 0.4; filter: saturate(0.5);`

**Acceptance**: Buttons feel tactile. Selected answer glows.

---

### 1.4 — Timer bar glow

Increase bar height to 10px, add matching glow shadow.

```css
.timer-bar { height: 10px; box-shadow: 0 0 12px currentColor; }
.timer-bar.critical { animation: timerPulse 0.4s ease infinite; }
```

**Acceptance**: Timer is more visible and pulses urgently in the last 20%.

---

### 1.5 — Score popup glow

Add text-shadow to `.score-popup` matching the color (green for correct, red for zero).

```css
.score-popup { text-shadow: 0 0 20px currentColor; }
```

**Acceptance**: Score feels impactful, not plain text.

---

### 1.6 — HUD-style labels

Add letter-spacing and uppercase to counters/labels for a tech HUD feel.

- `.q-counter`: `text-transform: uppercase; letter-spacing: 2px;`
- `.ps-counter`: same treatment
- `.subtitle`: same treatment

**Acceptance**: UI feels more like a game, less like a web form.
