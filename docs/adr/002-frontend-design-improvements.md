# ADR-002: Atlas Quiz Frontend Design Improvements

**Status**: Proposed
**Date**: 2026-03-22

---

## Context

The Atlas Quiz has a functional UI but it was built fast — utility-first CSS, flat colors, minimal polish. It works, but it doesn't have the visual punch that makes people want to share it or keep playing. The group profile picture (red/orange glowing rings, dark background, circuit aesthetic) sets a visual standard the game doesn't match yet.

### Current State

- **Color palette**: Flat CSS variables (`#1a1a2e` bg, `#e94560` accent, Kahoot RGBY answer colors)
- **Typography**: System font stack, no hierarchy beyond size/weight
- **Animations**: Basic CSS keyframes (fadeIn, slideUp, popIn, shake) — functional but generic
- **Layout**: Flexbox-centered screens, works on mobile but feels like a prototype
- **Logo**: Inline SVG with glowing rings — the only element with real design effort
- **Branding**: Minimal — "Atlas Quiz" text, red accent color, that's it
- **No visual depth**: No gradients on backgrounds, no glass effects, no shadows, no texture

### What Works (Keep)

- Single-file inline architecture (no build step, no CDN)
- Dark theme as default (matches Telegram dark mode)
- Kahoot-style 4-color answer grid (universally recognized)
- SVG logo with circuit/ring aesthetic
- Mobile-first responsive layout

---

## Decision

Redesign the visual layer while preserving the single-file HTML architecture and all existing functionality.

---

## Design Direction

### Visual Identity: "Neon Terminal"

Inspired by the group profile picture — dark backgrounds with glowing accents, circuit-board patterns, tech aesthetic. Not cyberpunk-flashy, but polished-dark with selective glow effects.

**Reference**: The existing SVG logo already nails this — extend that language to the entire UI.

### Specific Improvements

#### 1. Background & Depth

**Current**: Flat `#1a1a2e` solid color.

**Proposed**:
- Subtle radial gradient background (dark center, slightly lighter edges) — adds depth without distraction
- Very faint circuit-line pattern as a CSS background (using `linear-gradient` tricks, no images)
- Cards/panels get a subtle glass effect: `backdrop-filter: blur` + semi-transparent background + thin border
- Consider a faint animated particle/dot grid in the background (CSS-only, very low opacity) for the lobby/podium screens only

#### 2. Answer Buttons

**Current**: Flat solid colors, basic `border-radius: 12px`.

**Proposed**:
- Internal gradient on each button (e.g., red button goes from `#e74c3c` top to `#c0392b` bottom)
- Subtle inner shadow or highlight for 3D depth
- Selected state: add a glow effect (`box-shadow: 0 0 20px rgba(color, 0.4)`) instead of just a white outline
- Locked (after answering): dim with a smooth transition, keep the selected one glowing
- Icon shapes inside each button (triangle, diamond, circle, square — like Kahoot) as subtle watermarks

#### 3. Timer Bar

**Current**: Thin 6px bar that shrinks. Color changes green → yellow → red.

**Proposed**:
- Make it 10-12px with rounded ends
- Add a glow/shadow that matches the current color (`box-shadow: 0 0 10px currentColor`)
- Pulsing glow animation when critical (< 20%)
- Optional: add a numeric countdown next to or below the bar ("7s")

#### 4. Typography & Hierarchy

**Current**: System font, size-only hierarchy.

**Proposed**:
- Consider a display font for headings only (loaded inline as base64 woff2 to stay single-file, or use a well-supported system font like `'SF Pro Display'` with generous fallbacks)
- Question text: slightly larger, more line-height, centered with max-width
- Score popup: add a text-shadow glow effect matching the color
- Counter/labels: use letter-spacing and uppercase for a "HUD" feel

#### 5. Lobby Screen

**Current**: Logo, room code, player list, start button — stacked vertically.

**Proposed**:
- Player avatars in a horizontal wrap instead of a vertical list (more social feel, like "who's here")
- Each avatar gets a colored ring (randomly assigned from a palette)
- Pulsing "waiting" animation on avatars
- Room code styled as a "badge" with a copy-to-clipboard tap
- "Players joined" as a live counter with animation on increment

#### 6. Reveal Screen

**Current**: Score popup, options list, fun fact box, commentary.

**Proposed**:
- Correct answer gets a celebratory green glow pulse
- Wrong answer shakes (already exists) but add a brief red flash overlay
- Score popup: large, centered, with a "+1,350" that floats upward and fades (scoreFloat animation exists but isn't used)
- Streak indicator: flame icon or visual escalation (bigger text, warmer color per streak level)

#### 7. Podium Screen

**Current**: 2nd-1st-3rd layout with colored bars, confetti.

**Proposed**:
- Staggered entrance: bars grow upward with a spring animation (not just slideUp)
- Winner avatar gets a crown/glow effect
- Better confetti: more pieces, varied shapes (rectangles + circles), slight horizontal drift
- Background: subtle spotlight/radial gradient behind the podium
- Score numbers animate counting up from 0 (odometer effect)

#### 8. Leaderboard Screen

**Current**: Flat cards with gold/silver/bronze gradients for top 3.

**Proposed**:
- Position change arrows animate (slide the whole row up/down to its new position)
- Score delta: show "+1,200" next to the score briefly
- Highlight your own row more prominently (glow border, not just outline)

#### 9. Transitions Between Screens

**Current**: Instant swap with a fadeIn animation.

**Proposed**:
- Screen exit animation (fadeOut/slideDown) before the new screen enters
- Brief black flash or blur between question → reveal (creates tension)
- Leaderboard → next question: slide left (feels like progression)

#### 10. Sound & Haptics

**Current**: Haptic feedback via Telegram WebApp API (when available).

**Proposed** (stretch):
- Sound effects using Web Audio API (short, generated tones — no audio files needed)
  - Tick sound on timer (last 5 seconds)
  - Correct/wrong chime
  - Podium fanfare
- Keep this optional and behind a mute toggle
- Sounds must be generated inline (no external audio files — stays single-file)

---

## Constraints

| Constraint | Reason |
|-----------|--------|
| Single HTML file | No build step, served directly by game server |
| No external assets | No CDN, no font files, no images, no audio files |
| CSS-only animations preferred | JS animations only where CSS can't do it |
| Must work on low-end Android | Avoid `backdrop-filter` overuse, test performance |
| Must work in Telegram WebView AND mobile browser | Can't rely on cutting-edge CSS |
| Total file size < 50KB | Keep page load instant on mobile data |
| Dark theme only | Matches Telegram and the brand |

---

## Implementation Priority

| Priority | Items | Effort |
|----------|-------|--------|
| P0 | Background gradient, answer button depth, timer glow, score popup animation | Small |
| P1 | Lobby avatar redesign, reveal screen effects, podium animations | Medium |
| P2 | Screen transitions, leaderboard animations, typography upgrade | Medium |
| P3 | Sound effects, particle backgrounds, icon watermarks on buttons | Large |

P0 can be done in one pass — it's all CSS changes. P1-P2 need some JS. P3 is stretch.

---

## Anti-Goals

- **Not a redesign of functionality** — all screens, flows, and features stay exactly the same
- **Not a framework migration** — stays vanilla HTML/CSS/JS
- **Not mobile-app-native feel** — it's a web game in a chat app, it should feel snappy and light, not heavy
- **No external dependencies** — if it can't be inlined, we don't use it
