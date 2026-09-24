import { describe, expect, it } from "vitest";
import { BridgeRun } from "../src/game/bridgeRun.ts";
import { RandomOracle, WorstCaseOracle } from "../src/game/oracle.ts";
import type { BridgeConfig } from "../src/game/types.ts";
import { cellKey } from "../src/game/types.ts";

const bridge = (width: number, height: number, maxAttempts = 3): BridgeConfig => ({
  id: `${width}x${height}`,
  title: "Test Bridge",
  width,
  height,
  maxAttempts,
  intro: []
});

describe("bridge dimensions", () => {
  it("use width x height so monster rows match the story", () => {
    expect(bridge(3, 4).height - 2).toBe(2);
    expect(bridge(4, 5).height - 2).toBe(3);
    expect(bridge(24, 25).height - 2).toBe(23);
  });
});

describe("worst-case oracle", () => {
  it("reveals an entered unknown cell when a full board can still extend", () => {
    const oracle = new WorstCaseOracle(bridge(4, 5));

    expect(oracle.revealIfMonster({ row: 1, col: 2 })).toBe(true);
    expect(oracle.discoveredMonsters.get(1)).toBe(2);
    expect(oracle.usedMonsterColumns.has(2)).toBe(true);
    expect(oracle.blockedCells.has(cellKey({ row: 1, col: 2 }))).toBe(true);
    expect(oracle.canExtendCurrentState()).toBe(true);
  });

  it("marks cells safe when row or column already has a discovered monster", () => {
    const oracle = new WorstCaseOracle(bridge(4, 5));

    expect(oracle.revealIfMonster({ row: 1, col: 1 })).toBe(true);
    expect(oracle.revealIfMonster({ row: 1, col: 3 })).toBe(false);
    expect(oracle.revealIfMonster({ row: 2, col: 1 })).toBe(false);
    expect(oracle.safeCells.has(cellKey({ row: 1, col: 3 }))).toBe(true);
    expect(oracle.safeCells.has(cellKey({ row: 2, col: 1 }))).toBe(true);
  });

  it("can prove a safe mark would make a tiny board impossible", () => {
    const oracle = new WorstCaseOracle(bridge(2, 4));
    oracle.safeCells.add(cellKey({ row: 1, col: 0 }));
    oracle.safeCells.add(cellKey({ row: 2, col: 0 }));

    expect(oracle.canExtendWithSafe({ row: 2, col: 1 })).toBe(false);
  });

  it("keeps forced monsters hidden until their cell is entered", () => {
    const oracle = new WorstCaseOracle({
      ...bridge(4, 5),
      forcedMonsters: [{ row: 1, col: 0 }]
    });

    expect(oracle.isMonsterVisual({ row: 1, col: 0 })).toBe(false);
    expect(oracle.revealIfMonster({ row: 1, col: 1 })).toBe(false);
    expect(oracle.revealIfMonster({ row: 2, col: 0 })).toBe(false);
    expect(oracle.revealIfMonster({ row: 1, col: 0 })).toBe(true);
    expect(oracle.isMonsterVisual({ row: 1, col: 0 })).toBe(true);
  });
});

describe("random oracle", () => {
  it("places every monster in diagonal runs of length 3 to 5 with unique rows and columns", () => {
    for (let iteration = 0; iteration < 30; iteration += 1) {
      const oracle = new RandomOracle({
        ...bridge(24, 25),
        oracleMode: "random"
      });
      const monsters: { row: number; col: number }[] = [];

      for (let row = 1; row < 24; row += 1) {
        for (let col = 0; col < 24; col += 1) {
          if (oracle.isMonsterAt({ row, col })) {
            monsters.push({ row, col });
          }
        }
      }

      expect(monsters).toHaveLength(23);
      expect(new Set(monsters.map(({ row }) => row)).size).toBe(23);
      expect(new Set(monsters.map(({ col }) => col)).size).toBe(23);

      const runLengths: number[] = [];
      let runLength = 1;
      for (let index = 1; index < monsters.length; index += 1) {
        if (Math.abs(monsters[index].col - monsters[index - 1].col) === 1) {
          runLength += 1;
        } else {
          runLengths.push(runLength);
          runLength = 1;
        }
      }
      runLengths.push(runLength);
      expect(runLengths.every((length) => length >= 3 && length <= 5)).toBe(true);
    }
  });

  it("keeps forced monsters while randomizing the remaining valid positions", () => {
    const oracle = new RandomOracle({
      ...bridge(24, 25),
      oracleMode: "random",
      forcedMonsters: [{ row: 1, col: 0 }]
    });

    expect(oracle.revealIfMonster({ row: 1, col: 0 })).toBe(true);
    for (let row = 2; row < 24; row += 1) {
      expect(oracle.revealIfMonster({ row, col: 0 })).toBe(false);
    }

    const columns = [...Array(23).keys()].map((index) => {
      const row = index + 1;
      return [...Array(24).keys()].find((col) => oracle.isMonsterAt({ row, col }));
    });
    const runLengths: number[] = [];
    let runLength = 1;
    for (let index = 1; index < columns.length; index += 1) {
      if (Math.abs(columns[index]! - columns[index - 1]!) === 1) {
        runLength += 1;
      } else {
        runLengths.push(runLength);
        runLength = 1;
      }
    }
    runLengths.push(runLength);
    expect(runLengths.every((length) => length >= 3 && length <= 5)).toBe(true);
  });

  it("does not permanently leave the rightmost column empty on the forced-edge board", () => {
    let usedRightmostColumn = false;

    for (let iteration = 0; iteration < 20; iteration += 1) {
      const oracle = new RandomOracle({
        ...bridge(24, 25),
        oracleMode: "random",
        forcedMonsters: [{ row: 1, col: 0 }]
      });
      usedRightmostColumn ||= [...Array(23).keys()].some((index) =>
        oracle.isMonsterAt({ row: index + 1, col: 23 })
      );
    }

    expect(usedRightmostColumn).toBe(true);
  });
});

describe("bridge run", () => {
  it("blocks revealed monster cells on later attempts", () => {
    const run = new BridgeRun(bridge(3, 4));
    const first = run.move("down");
    expect(first.kind).toBe("monster");

    const blocked = run.move("down");
    expect(blocked.kind).toBe("blocked");
    if (blocked.kind === "blocked") {
      expect(blocked.message).toContain("already knows");
    }
  });

  it("uses the middle top and bottom cells as start and final", () => {
    const run = new BridgeRun(bridge(24, 25));

    expect(run.startCell()).toEqual({ row: 0, col: 12 });
    expect(run.finalCell()).toEqual({ row: 24, col: 12 });
  });

  it("uses randomness only when the bridge requests it", () => {
    expect(new BridgeRun(bridge(4, 5)).oracle).toBeInstanceOf(WorstCaseOracle);
    expect(
      new BridgeRun({
        ...bridge(24, 25),
        oracleMode: "random"
      }).oracle
    ).toBeInstanceOf(RandomOracle);
  });
});
