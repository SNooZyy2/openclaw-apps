# WP-6: Polish & Demo

**Depends on**: WP-3, WP-4, WP-5 (full game playable end-to-end)
**Enables**: Demo day

## Goal

Harden edge cases, add visual polish, and run the full end-to-end demo: Atlas creates a game in Telegram → real players join on their phones → play a full round → results posted in chat. Fix everything that breaks.

---

## Issues

### 6.1 — Edge case hardening

**Type**: Bug fix / Hardening
**Effort**: Medium

Find and fix everything that breaks under real conditions.

**Test scenarios**:
- Player joins mid-game (after LOBBY) — should get a "game in progress" message, not crash
- Player closes WebView mid-game — should be marked disconnected, scores preserved
- Player reopens WebView — should reconnect and see current state
- All players disconnect — room should auto-cleanup
- Two games created back-to-back — old room cleanup doesn't interfere with new room
- Gemini API timeout during question generation — fallback bank kicks in, no delay for players
- Gemini returns partial JSON — parser recovers or falls back
- WebSocket message flood (rapid tapping) — server doesn't crash, duplicate answers ignored
- 20 players join — UI and server handle it without lag

**Acceptance criteria**:
- All scenarios above tested and handled without crashes or hung states
- No unhandled promise rejections or uncaught exceptions in server logs

**Deliverables**:
- Bug fixes in `server.js` and `index.html`

---

### 6.2 — Visual polish & animations

**Type**: Enhancement
**Effort**: Medium

Make it feel like a real game, not a prototype.

**Targets**:
- Answer button tap: ripple/press effect
- Correct answer: green pulse + checkmark animation
- Wrong answer: red shake + X animation
- Score popup: "+1350" floats up and fades
- Leaderboard: position changes animate (slide up/down)
- Podium entrance: staggered reveal (3rd → 2nd → 1st) with scale animation
- Confetti on podium: CSS-only particles (20-30 divs with random keyframes)
- Countdown bar: smooth color transition (green → yellow → red)
- Screen transitions: fade or slide (not instant swap)

**Constraints**:
- CSS transitions/keyframes only — no JS animation libraries
- All inline in `index.html`
- Must not degrade performance on low-end Android phones

**Acceptance criteria**:
- Animations feel responsive and polished
- No jank or frame drops on mid-range devices
- Total CSS size stays under 10KB

**Deliverables**:
- Animation CSS + minor JS triggers in `index.html`

---

### 6.3 — Telegram WebView compatibility testing

**Type**: Testing
**Effort**: Medium

Test the game in actual Telegram WebView on real devices.

**Test matrix**:
- Android Telegram (latest) — primary target
- iOS Telegram (latest) — secondary target
- Telegram Desktop (macOS/Windows) — nice to have
- Chrome mobile (for debugging without Telegram)

**Check**:
- WebSocket connects through Tailscale Funnel (wss://)
- Telegram WebApp API loads and provides user identity
- Theme colors apply correctly in dark and light mode
- Haptic feedback fires
- Full game loop completes without errors
- UI doesn't overflow or require scrolling during questions
- "Close" button returns to chat

**Acceptance criteria**:
- Game works on Android Telegram and iOS Telegram without layout breaks or connection failures
- Known issues documented with workarounds

**Deliverables**:
- Bug fixes from testing
- Compatibility notes in README

---

### 6.4 — End-to-end demo run

**Type**: Task
**Effort**: Small

Run the full demo with 3+ real people in the Telegram group.

**Steps**:
1. Start game server and Tailscale Funnel
2. In the Telegram group, ask Atlas to start a trivia game
3. Atlas creates room, sends Web App button
4. 3+ people tap the button and join
5. Play through 7 questions
6. Atlas posts results to chat

**Acceptance criteria**:
- Full loop completes without manual intervention (no SSH fixes mid-game)
- Game takes under 5 minutes end-to-end
- Results are posted to chat with AI-generated summary
- At least one person is impressed

**Deliverables**:
- Screenshot/recording of the demo
- Post-demo bug list (if any) as new issues
