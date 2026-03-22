# WP-4: Sound & Stretch Goals

**ADR**: [002 — Frontend Design](../../adr/002-frontend-design-improvements.md)
**Priority**: P3 (stretch — do only if P0-P2 are solid)
**Effort**: Large — JS-heavy
**Files**: `client.js`, `style.css`

## Goal

Add sound effects and visual flourishes that push the game from "polished" to "impressive". These are nice-to-haves.

---

## Issues

### 4.1 — Web Audio sound effects

Generate short sound effects using Web Audio API (no audio files).

- **Timer tick**: sine wave beep, last 5 seconds, increasing pitch
- **Answer tap**: short click/pop
- **Correct**: ascending two-note chime (C5 → E5)
- **Wrong**: descending buzz (low sine + slight distortion)
- **Podium**: ascending arpeggio (C4 → E4 → G4 → C5)

All generated via `OscillatorNode` + `GainNode`. Mute toggle button in top-left corner (persist in localStorage).

**Acceptance**: Sound enhances the game without being annoying. Mute works.

---

### 4.2 — Animated dot grid background

Faint particle grid on lobby and podium screens (CSS-only or minimal JS).

- 20-30 small dots, absolute positioned, very low opacity (0.1-0.2)
- Slow drift animation (random direction, 20-40s cycle)
- Red/orange tint matching the accent color
- Only on lobby and podium — not during gameplay (distraction)

**Acceptance**: Background feels alive, not static. No performance impact.

---

### 4.3 — Answer button icon watermarks

Subtle shape icons inside each answer button (like Kahoot).

- Button 1: triangle
- Button 2: diamond
- Button 3: circle
- Button 4: square

Rendered as CSS pseudo-elements, very low opacity (0.1), centered behind the text.

**Acceptance**: Adds visual identity to each button beyond just color.

---

### 4.4 — Numeric countdown overlay

Large centered countdown number during the question phase.

- Shows seconds remaining: "15", "14", ... "1"
- Large, semi-transparent, behind the question text
- Pulses red in the last 5 seconds
- Complements the timer bar, doesn't replace it

**Acceptance**: Time pressure is visceral. Players feel the countdown.
