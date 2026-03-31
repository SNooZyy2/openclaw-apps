# WP-3: Animations & Transitions

**ADR**: [002 — Frontend Design](../../adr/002-frontend-design-improvements.md)
**Priority**: P2
**Effort**: Medium — CSS + JS
**Files**: `style.css`, `client.js`

## Goal

Add screen transitions and micro-animations that make the game feel fluid and polished.

---

## Issues

### 3.1 — Screen exit animations

Add fadeOut/slideDown on the outgoing screen before the incoming screen fades in.

- `showScreen()` in `client.js`: add `.exiting` class to current screen, wait 200ms, then swap
- CSS: `.screen.exiting { animation: fadeOut 0.2s ease forwards; }`
- `@keyframes fadeOut { to { opacity: 0; transform: translateY(10px); } }`

**Acceptance**: Screens feel like they transition, not teleport.

---

### 3.2 — Question → Reveal tension beat

Brief 300ms dark flash between question and reveal.

- After timer expires / all answered, flash a dark overlay before showing reveal
- CSS overlay: `position: fixed; inset: 0; background: black; z-index: 200;`
- Animate: `opacity: 0 → 0.6 → 0` over 300ms

**Acceptance**: Creates a "drumroll" moment before the answer reveal.

---

### 3.3 — Pregame countdown polish

- Numbers scale up and fade simultaneously (not just pulse)
- Add a radial burst behind each number (CSS pseudo-element, scale up and fade)
- "GO!" text instead of disappearing at 0

**Files**: `style.css`, `client.js` (update `startPregameCountdown()`)
**Acceptance**: Countdown feels exciting, not clinical.

---

### 3.4 — Button press ripple

Replace the current `::after` pseudo-element with a proper radial ripple from the touch point.

- On click, create a span at the touch coordinates
- Animate: scale from 0 to 2x with opacity fade
- Remove after animation ends

**Files**: `client.js` (add ripple handler to `.option-btn`)
**Acceptance**: Buttons feel physically responsive.

---

### 3.5 — Player pip entrance animation

When a new player joins (lobby) or answers (question), animate the pip.

- Lobby: new avatar bounces in with `popIn`
- Question strip: answered pip glows and briefly scales 1.2x (already exists, verify it works)

**Acceptance**: Multiplayer activity is visually noticeable.
