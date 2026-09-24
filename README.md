# TurboTale

A snowy pixel-art puzzle adventure about Turbo, an airplane-shell snail crossing three rivers to reach his family.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

## Play

- **Phone/tablet:** landscape recommended. Swipe anywhere on the game to move one cell.
- **Start/dialogue:** tap the title or playfield. Tap dialogue to finish revealing it or continue.
- **Hint:** hold the playfield for 600 ms.
- **Reveal helper:** hold the attempt counter for 600 ms on either large final bridge; hold again to hide monsters.
- **Keyboard:** WASD/arrows move, Enter/Space confirm, Escape shows a hint, R toggles the eligible reveal helper. A focused attempt counter also supports Enter/Space.
- No visible movement, confirm, back, or reveal buttons. Portrait remains playable and suggests rotating.
- A cancelled gesture, a second simultaneous touch, or a release outside the game does not move Turbo.

## Gameplay

Bridge progression remains: 3×4 (3 attempts), 4×5 (4 attempts), 24×25 (3 attempts), then the special 24×25 final bridge and family ending. Every first-row cell has a star, and reaching any large star in the last row wins. All boards use the same closed boxes for unknown cells. Monster encounters consume attempts; discovered hazards remain known. Only walked cells and the first/final rows look safe; inferred safety stays hidden. Saves continue using `turbotale-progress-v1`.

## Art and layout

Original ImageGen terrain, trees, cabin, props, characters, and four-frame Turbo idle sprites share a snowy blue/amber palette. Runtime assets, original sheets, prompts, extraction metadata, and validation metadata are in `public/assets/generated/snowbound/`. Deterministic cropping/packing is in `scripts/process-snowbound.py` (Python, Pillow, NumPy).

A 960×540 landscape stage uses nearest-neighbor pixels, separate scenery and collision, and a vertically following view on large boards. Trees, rocks, the jury, and structures have solid footprints shared with their scenery positions. The cabin sits above the family. Dialogue shows the current speaker’s portrait and name inside the fitted viewport. A direction clears dialogue and moves in the same action; movement is limited to one step per 180 ms with no queued spam. Water and forest-edge notices never interrupt movement. Reduced motion stops decorative snowfall and sprite animation.

## Check

```powershell
npm.cmd test
npm.cmd run build
```

The unit suite covers the puzzle oracles and touch gestures. Browser validation includes touch-only progression through every bridge, encounters/retries/game over, hidden reveal, rotation, and the ending at 667×375 and 844×390.

Sites hosting is configured in `.openai/hosting.json`; deployment serves the Vite `dist` output. See `CREDITS.md` for art provenance.
