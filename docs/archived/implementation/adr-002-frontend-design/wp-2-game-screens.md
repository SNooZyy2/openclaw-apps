# WP-2: Game Screens

**ADR**: [002 — Frontend Design](../../adr/002-frontend-design-improvements.md)
**Priority**: P1
**Effort**: Medium — CSS + some JS
**Files**: `style.css`, `client.js`

## Goal

Redesign the lobby, reveal, leaderboard, and podium screens to feel polished and social.

---

## Issues

### 2.1 — Lobby avatar redesign

Replace vertical player list with horizontal wrapped avatar circles.

- Each avatar: 48px circle with a colored ring (cycle through a palette of 6 colors)
- Name below each avatar
- Pulsing border animation on avatars while waiting
- "(you)" badge on your own avatar

**Files**: `style.css`, `client.js` (update `updateLobby()`)
**Acceptance**: Lobby feels social — like seeing people's faces join.

---

### 2.2 — Room code badge

Style the room code as a tappable badge with a copy-to-clipboard action.

- Rounded pill shape, semi-transparent background, border
- Tap → copies to clipboard, brief "Copied!" flash
- Smaller text, less dominant than current 2rem

**Files**: `style.css`, `client.js`
**Acceptance**: Room code is shareable with one tap.

---

### 2.3 — Reveal screen effects

- Correct answer option: green glow pulse animation
- Your wrong answer: red flash overlay (brief, then settle to shake)
- Use the `scoreFloat` animation for the score popup (float upward and fade)
- Streak indicator: escalating warmth (orange text at 2, red at 4, fire emoji at 5+)

**Files**: `style.css`, `client.js` (update `showReveal()`)
**Acceptance**: Getting an answer right feels rewarding. Getting it wrong stings.

---

### 2.4 — Leaderboard score deltas

Show "+1,200" next to scores briefly after each round.

- Delta appears on the right, animated in, fades after 2s
- Your row has a stronger glow border (`box-shadow` instead of outline)
- Position change: row slides up/down to new position

**Files**: `style.css`, `client.js` (update `showLeaderboard()`, needs previous standings tracking)
**Acceptance**: Leaderboard feels dynamic, not static.

---

### 2.5 — Podium spring animation

- Bars grow upward from 0 height with a spring/overshoot ease
- Staggered: 3rd appears first, then 2nd, then 1st (build suspense)
- Winner avatar gets a gold glow ring
- Score numbers count up from 0 (odometer effect via JS interval)

**Files**: `style.css`, `client.js` (update `showPodium()`)
**Acceptance**: Podium reveal feels dramatic and earned.

---

### 2.6 — Better confetti

- 60 pieces (up from 40)
- Mix rectangles and circles
- Add slight horizontal drift (random `translateX` in keyframes)
- Varied opacity (0.6–1.0)

**Files**: `client.js` (update `spawnConfetti()`)
**Acceptance**: Confetti looks celebratory, not sparse.
