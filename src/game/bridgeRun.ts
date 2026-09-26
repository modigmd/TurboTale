import type { BridgeConfig, Cell, Direction, MoveResult } from "./types.ts";
import { cellKey } from "./types.ts";
import { RandomOracle, WorstCaseOracle, type BridgeOracle } from "./oracle.ts";
import { StrategicOracle } from "./strategicOracle.ts";

const DELTAS: Record<Direction, Cell> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 }
};

export class BridgeRun {
  readonly oracle: BridgeOracle;
  readonly bridge: BridgeConfig;
  turbo: Cell;
  attempt = 1;
  won = false;
  lost = false;
  private disposed = false;
  private pending = false;

  constructor(bridge: BridgeConfig, oracle?: BridgeOracle) {
    this.bridge = bridge;
    this.oracle = oracle ?? (bridge.oracleMode === "strategic" ? new StrategicOracle(bridge) : bridge.oracleMode === "random" ? new RandomOracle(bridge) : new WorstCaseOracle(bridge));
    this.turbo = this.startCell();
    this.oracle.markSafe(this.turbo);
  }

  startCell(): Cell {
    return { row: 0, col: Math.floor(this.bridge.width / 2) };
  }

  finalCell(): Cell {
    return { row: this.bridge.height - 1, col: Math.floor(this.bridge.width / 2) };
  }

  async move(direction: Direction): Promise<MoveResult> {
    if (this.disposed || this.won || this.lost) {
      return { kind: "blocked", cell: this.turbo, reason: "finished" };
    }
    if (this.pending) return { kind: "blocked", cell: this.turbo, reason: "pending" };

    const delta = DELTAS[direction];
    const target = { row: this.turbo.row + delta.row, col: this.turbo.col + delta.col };
    if (!this.inBounds(target)) {
      return { kind: "blocked", cell: target, reason: "bounds" };
    }
    if (this.oracle.blockedCells.has(cellKey(target))) {
      return { kind: "blocked", cell: target, reason: "monster" };
    }

    this.pending = true;
    let hitMonster: boolean;
    try { hitMonster = await this.oracle.revealIfMonster(target); }
    finally { this.pending = false; }
    if (this.disposed) return { kind: "blocked", cell: this.turbo, reason: "finished" };
    if (hitMonster) {
      this.attempt += 1;
      const attemptsLeft = Math.max(0, this.bridge.maxAttempts - this.attempt + 1);
      if (this.attempt > this.bridge.maxAttempts) {
        this.lost = true;
        return { kind: "gameOver", cell: target };
      }
      this.turbo = this.startCell();
      this.oracle.markSafe(this.turbo);
      return { kind: "monster", cell: target, attemptsLeft };
    }

    this.turbo = target;
    this.oracle.markSafe(target);
    if (target.row === this.bridge.height - 1) {
      this.won = true;
      return { kind: "won", cell: target };
    }
    return { kind: "moved", cell: target };
  }

  private inBounds(cell: Cell): boolean {
    return cell.row >= 0 && cell.row < this.bridge.height && cell.col >= 0 && cell.col < this.bridge.width;
  }

  dispose(): void { this.disposed = true; this.oracle.dispose?.(); }
}
