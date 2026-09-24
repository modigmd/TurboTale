# TurboTale Credits

## Snowbound redesign

The current game uses six original image sheets generated with OpenAI's built-in ImageGen: terrain atlas, Turbo idle animation, snow-laden evergreen, timber cabin, prop sheet, and cast sheet. The user's snowy pixel-RPG reference guided palette and atmosphere. Turbo retains the existing airplane-shell snail identity. Other characters are original family, jury, and monster designs.

- Runtime and source images: `public/assets/generated/snowbound/`
- Handwritten generation prompts: `*.prompt.txt` alongside each source
- Corrected actor/prop extractions: `crops/` and `extraction-meta.json`
- Reproducible nearest-neighbor packing and alpha cleanup: `scripts/process-snowbound.py`
- Runtime frame dimensions, bounds, and edge-touch validation: `pipeline-meta.json`

Terrain and actors are separate runtime assets. Scenery and collision share placement data, including solid tree canopies, rocks, jury characters, and the cabin. Speaker portraits and endpoint stars are extracted from the existing generated sheets. No Undertale sprites, fonts, or audio are shipped by this redesign. Typography uses the system Courier New/monospace stack. Dialogue blips and encounter sounds are generated with Web Audio.

## Retained legacy assets

These earlier assets remain in the repository but are no longer loaded by the current scene:

- Snowy Wasteland by NonokaATM: https://nonokaatm.itch.io/snowy-wasteland-asset-pack-16x16-free
- Free Pixel Art Overworld Tileset by edermunizz: https://edermunizz.itch.io/free-pixel-art-overworld-tileset
- Tiny Dungeon by Kenney (CC0): https://kenney.nl/assets/tiny-dungeon
- Tiny Creatures by Clint Bellanger (CC0): https://opengameart.org/content/tiny-creatures
- Monster Sprites by Kemono (CC-BY-SA 3.0): https://opengameart.org/content/monster-sprites
- Earlier generated Turbo artwork: `public/assets/generated/turbo-plane-snail/`

Original source notices are retained in the vendor folders.
