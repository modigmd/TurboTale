import type { BridgeConfig } from "../game/types.ts";
export const BRIDGES: BridgeConfig[] = [
  { id: "tiny", title: "Tiny Bridge", width: 3, height: 4, maxAttempts: 3,
    intro: [
      { speaker: "jury", text: "2 hidden monsters. 3 attempts." },
      { speaker: "jury", text: "Reach any large star on the far side." }
    ] },
  { id: "middle", title: "Second Bridge", width: 4, height: 5, maxAttempts: 4,
    intro: [{ speaker: "jury", text: "3 hidden monsters. 4 attempts." }] },
  { id: "final", title: "Final Bridge", width: 24, height: 25, maxAttempts: 3, oracleMode: "random",
    intro: [
      { speaker: "jury", text: "23 hidden monsters. 3 attempts." },
      { speaker: "turbo", text: "Only three?" },
      { speaker: "jury", text: "Three. Reach any large star." }
    ] }
];
export const FINAL_EDGE_BRIDGE: BridgeConfig = {
  id: "final-edge", title: "Final Bridge", width: 24, height: 25, maxAttempts: 3, oracleMode: "strategic",
  intro: [{ speaker: "jury", text: "One more bridge. You have 3 attempts." }]
};
