import type { BridgeConfig } from "../game/types.ts";

export const BRIDGES: BridgeConfig[] = [
  {
    id: "tiny",
    title: "Tiny Bridge",
    width: 3,
    height: 4,
    maxAttempts: 3,
    intro: [
      "Not so fast, Turbo.",
      "To cross, survive the bridge."
    ]
  },
  {
    id: "middle",
    title: "Second Bridge",
    width: 4,
    height: 5,
    maxAttempts: 4,
    intro: [
      "The second river waited quietly.",
      "This bridge was 4x5, with 3 monsters and 4 attempts.",
      "Turbo started to relax."
    ]
  },
  {
    id: "final",
    title: "Final Bridge",
    width: 24,
    height: 25,
    maxAttempts: 3,
    oracleMode: "random",
    intro: [
      "Then Turbo saw the final bridge: 24x25.",
      "There were 23 monsters hiding inside.",
      "Turbo: \"So I get 23 attempts, right?\"",
      "IMO Jury: \"Nope. Only 3.\"",
      "Monsters: \"HAHAHAHAHA.\""
    ]
  }
];

export const FINAL_EDGE_BRIDGE: BridgeConfig = {
  id: "final-edge",
  title: "Final Bridge",
  width: 24,
  height: 25,
  maxAttempts: 3,
  oracleMode: "random",
  intro: [
    "IMO Jury: \"Hmmm. Not so fast. How about this?\"",
    "Monsters: \"HAHAHAHAHA.\""
  ],
  forcedMonsters: [{ row: 1, col: 0 }]
};
