# Implementation Plans

Work packages organized by ADR.

## ADR-001: Multiplayer Trivia Game

[Work packages](../archived/implementation/adr-001-trivia-game/) — **Completed**. Game is live. (Archived)

## ADR-002: Frontend Design Improvements

[Work packages](../archived/implementation/adr-002-frontend-design/) — **Completed**. Visual polish applied. (Archived)

All P0–P3 items implemented: background depth, button gradients, timer glow, lobby avatars, reveal effects, screen transitions, sound effects, confetti, animated dot grid.

## ADR-003: Telegram Identity Verification

No separate work packages — implemented directly. Server-side `initData` HMAC verification via `auth.js`.

## ADR-004: QR Code Rendering Overhaul

[Work packages](adr-004-qr-overhaul/) — **Completed**. File split, EC-H, logo compositing, hi-res output.

| # | Package | Effort | Status |
|---|---------|--------|--------|
| 1 | [Full Overhaul](adr-004-qr-overhaul/wp-1-completed.md) | Medium | Done |

## ADR-005: Module Separation — Quiz and QR

[Work packages](adr-005-module-separation/) — **Pending**. Subdirectory split into quiz/, qr/, web/.

| # | Package | Effort | Status |
|---|---------|--------|--------|
| 1 | [Directory Structure](adr-005-module-separation/wp-1-directory-structure.md) | Small | Pending |
| 2 | [Extract Handlers](adr-005-module-separation/wp-2-extract-handlers.md) | Medium | Pending |
| 3 | [Update Paths](adr-005-module-separation/wp-3-update-paths.md) | Small | Pending |
| 4 | [Smoke Test](adr-005-module-separation/wp-4-smoke-test.md) | Small | Pending |
| 5 | [Update Docs](adr-005-module-separation/wp-5-update-docs.md) | Small | Pending |
