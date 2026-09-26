# TurboTale

A snowy pixel-art puzzle adventure about Turbo, an airplane-shell snail crossing three rivers to reach his family.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

## Play

- **Phone/tablet:** landscape recommended. Tap the left or right quarter of the game to move left or right. In the middle half, tap above center to move up and below center to move down. These four invisible regions never overlap. Each tap moves one cell on release; swipes also remain supported. Tap dialogue itself to continue it.
- **Start/dialogue:** tap the title or playfield. Tap dialogue to finish revealing it or continue.
- **Hint:** hold the playfield for 600 ms.
- **Reveal helper:** hold the attempt counter for 600 ms on the first large (random) bridge; hold again to hide monsters. Reveal is disabled on the very last adaptive board, including the R shortcut.
- **Keyboard:** WASD/arrows move, Enter/Space confirm, Escape shows a hint, R toggles the eligible reveal helper. A focused attempt counter also supports Enter/Space.
- No visible movement, confirm, back, or reveal buttons. Portrait remains playable and suggests rotating.
- A cancelled gesture, a second simultaneous touch, or a release outside the game does not move Turbo.

## Gameplay

Bridge progression remains: 3×4 (3 attempts), 4×5 (4 attempts), 24×25 (3 attempts), then the special 24×25 final bridge and family ending. Every first-row cell has a star, and reaching any large star in the last row wins. All boards use the same closed boxes for unknown cells. Monster encounters consume attempts; discovered hazards remain known. Only walked cells and the first/final rows look safe; inferred safety stays hidden. Saves continue using `turbotale-progress-v1`.

## Strategic final challenge

Only the last 24×25 board uses the new `StrategicOracle`, with no preselected monsters. It compares legal safe/monster answers by the number of further hits a perfect player would need, counting an immediate hit. It chooses the harder continuation and keeps a cell safe on ties. On the final attempt it takes any legal monster opportunity. The earlier large board keeps its random layout; the old greedy oracle remains on the small boards.

Matching and alternating-graph analysis keep every answer consistent with one fixed legal board: one monster per interior row, at most one per column. Earlier observations never change across attempts. Inferred safety stays visually unknown. Rendering does not decide cells. Restarting clears the observations. Evaluation runs in a Web Worker, with one pending step and bounded caching, so it does not block rendering or queue repeated taps.

The [official IMO 2024 solution, C4 / Problem 5](https://www.imo-official.org/assets/documents/problems/2024/IMO2024SL.pdf) guarantees that correct play can win within three attempts. That is not an automatic third-attempt win: poor choices can still lose. The legacy ID `final-edge` is retained, but there is no fixed edge monster. See [the strategy design and proof](docs/strategic-adversary.md) for the independent solver, Bebras references, and validation.

## Art and layout

Original ImageGen terrain, trees, cabin, props, characters, and four-frame Turbo idle sprites share a snowy blue/amber palette. Runtime assets, original sheets, prompts, extraction metadata, and validation metadata are in `public/assets/generated/snowbound/`. Deterministic cropping/packing is in `scripts/process-snowbound.py` (Python, Pillow, NumPy).

A 960×540 landscape stage uses nearest-neighbor pixels, separate scenery and collision, and a vertically following view on large boards. Trees, rocks, the jury, and structures have solid footprints shared with their scenery positions. The cabin sits above the family. Dialogue shows the current speaker’s portrait and name inside the fitted viewport. A direction clears dialogue and moves in the same action; movement is limited to one step per 180 ms with no queued spam. Water and forest-edge notices never interrupt movement. Reduced motion stops decorative snowfall and sprite animation.

## Check

```powershell
npm.cmd test
npm.cmd run build
```

The unit suite covers the puzzle oracles, exhaustive small-board minimax comparison, all 24 starting columns, worker lifecycle, and touch gestures. Browser validation includes touch-only progression through every bridge, encounters/retries/game over, hidden reveal, rotation, and the ending at 667×375 and 844×390.

Sites hosting is configured in `.openai/hosting.json`; deployment serves the Vite `dist` output. See `CREDITS.md` for art provenance.
