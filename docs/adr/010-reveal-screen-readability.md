# ADR-010: Reveal Screen — More Time and Better Readability

**Status**: Implemented
**Date**: 2026-04-18
**Author**: snoozyy

---

## Context

The answer reveal screen shows a fun-fact sentence that adds context to the question just answered. Players report not having enough time to read it — the screen advances to the leaderboard after 5 seconds, which isn't enough when you're also processing your score, streak, and the correct answer highlight.

The fun-fact text also blends into the background. It uses `color: var(--text-dim)` (#888) at `0.9rem` on a low-contrast card, making it the least prominent element on a screen full of bold colors and animations.

## Decision

### 1. Increase reveal duration from 5 s → 8 s

`REVEAL_DURATION` in `config.js` changes from `5000` to `8000`. This gives players time to read the fun fact after the initial score/streak animation settles (~2 s), leaving ~6 s of comfortable reading time.

The leaderboard duration stays at 5 s — it's just a scoreboard glance.

### 2. Make the fun-fact text more prominent

Increase the fun-fact's visual weight so it reads as deliberate content rather than fine print:

- **Font size**: `0.9rem` → `0.95rem`
- **Color**: `var(--text-dim)` (#888) → `var(--text)` (#eee) — full contrast
- **Border accent**: add a left border like the commentary card for visual anchoring
- **Top margin**: `4px` → `10px` — more breathing room from the options above

## Consequences

- Total round time increases by 3 s per question (reveal 5→8 s). A 7-question game goes from ~3 min to ~3.5 min.
- The fun fact becomes a visible feature rather than an afterthought, which rewards the AI-generated context and gives the quiz more educational value.
