export const TILE_SIZE = 32;
export const TextureKeys = {
  terrain: "snowbound-terrain", tree: "snowbound-tree", cabin: "snowbound-cabin",
  props: "snowbound-props", actors: "snowbound-actors", turbo: "snowbound-turbo"
} as const;
const root = "/assets/generated/snowbound/";
export const AssetPaths = {
  terrain: root + "terrain.png", tree: root + "tree.png", cabin: root + "cabin.png",
  props: root + "props.png", actors: root + "actors.png", turbo: root + "turbo.png"
} as const;
export const TerrainFrames = { overworldBridge: 0, snow: 1, path: 2, bankLeft: 3, bridge: 4, walked: 5, start: 6, goal: 7, water: 8, bankRight: 12, shade: 13, darkBridge: 14 } as const;
// Logical terrain IDs are deliberately independent of the replacement atlas.
export const TileIds = { snow: 0, darkSnow: 2, path: 322, water: 815, bridge: 322, tree: 406, sign: 774, stone: 762, house: 726, lantern: 517 } as const;
