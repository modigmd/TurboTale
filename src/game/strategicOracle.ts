import type { BridgeOracle } from "./oracle.ts";
import { cellKey, type BridgeConfig, type Cell } from "./types.ts";
import type { StrategicDecision, StrategicRequest, StrategicResponse } from "./strategicSolver.ts";

export interface StrategyClient {
  decide(request: Omit<StrategicRequest, "id">): Promise<StrategicDecision>;
  dispose(): void;
}

export class WorkerStrategyClient implements StrategyClient {
  private worker?: Worker;
  private serial = 0;
  private pending?: { id: number; resolve: (decision: StrategicDecision) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

  // Load/compile the worker as the level opens, before the first unknown step.
  constructor() { this.ensureWorker(); }

  private fail(error: Error): void {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
    this.worker?.terminate(); this.worker = undefined;
  }

  private ensureWorker(): void {
    if (!this.worker) {
      this.worker = new Worker(new URL("./strategic.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<StrategicResponse>) => {
        const reply = event.data, pending = this.pending;
        if (!pending || reply.id !== pending.id) return;
        if ("error" in reply) { this.fail(new Error(reply.error)); return; }
        clearTimeout(pending.timer); this.pending = undefined; pending.resolve(reply.decision);
      };
      this.worker.onerror = event => { event.preventDefault(); this.fail(new Error("Strategy worker failed.")); };
      this.worker.onmessageerror = () => this.fail(new Error("Invalid strategy reply."));
    }
  }

  decide(request: Omit<StrategicRequest, "id">): Promise<StrategicDecision> {
    if (this.pending) return Promise.reject(new Error("A strategy decision is already pending."));
    this.ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      this.pending = { id, resolve, reject, timer: setTimeout(() => this.fail(new Error("Strategy decision timed out.")), 10000) };
      try { this.worker!.postMessage({ ...request, id }); }
      catch (error) { this.fail(error instanceof Error ? error : new Error("Strategy request failed.")); }
    });
  }

  dispose(): void { this.fail(new Error("Strategy run ended.")); }
}

/** Observation store for the independent worker evaluator; no pre-placed layout. */
export class StrategicOracle implements BridgeOracle {
  readonly discoveredMonsters = new Map<number, number>();
  readonly usedMonsterColumns = new Set<number>();
  readonly safeCells = new Set<string>();
  readonly visitedCells = new Set<string>();
  readonly blockedCells = new Set<string>();
  private masks: number[];
  private disposed = false;
  private pending = false;

  constructor(private bridge: BridgeConfig, private client: StrategyClient = new WorkerStrategyClient()) {
    if (bridge.height !== bridge.width + 1 || bridge.width < 3 || bridge.width > 24 || bridge.forcedMonsters?.length) {
      throw new Error("Strategic boards require width+1 rows and no fixed monsters.");
    }
    this.masks = Array(bridge.width - 1).fill((1 << bridge.width) - 1);
  }

  markSafe(cell: Cell): void {
    if (this.blockedCells.has(cellKey(cell))) throw new Error("Cannot change a discovered monster.");
    this.safeCells.add(cellKey(cell)); this.visitedCells.add(cellKey(cell));
  }

  async revealIfMonster(cell: Cell): Promise<boolean> {
    if (this.disposed) throw new Error("Strategy run ended.");
    if (this.pending) throw new Error("A strategy decision is already pending.");
    const key = cellKey(cell);
    if (this.blockedCells.has(key)) return false;
    if (cell.row === 0 || cell.row === this.bridge.height - 1 || this.safeCells.has(key) || !(this.masks[cell.row - 1] & (1 << cell.col))) {
      this.markSafe(cell); return false;
    }
    this.pending = true;
    try {
      const result = await this.client.decide({ width: this.bridge.width, masks: [...this.masks], cell: { ...cell }, lastAttempt: this.discoveredMonsters.size >= this.bridge.maxAttempts - 1 });
      if (this.disposed) throw new Error("Strategy run ended.");
      this.masks = result.masks;
      this.visitedCells.add(key);
      if (result.monster) {
        this.discoveredMonsters.set(cell.row, cell.col); this.usedMonsterColumns.add(cell.col); this.blockedCells.add(key);
      } else this.markSafe(cell);
      return result.monster;
    } finally { this.pending = false; }
  }

  isSafeVisual(cell: Cell): boolean { return cell.row === 0 || cell.row === this.bridge.height - 1 || this.safeCells.has(cellKey(cell)); }
  isMonsterVisual(cell: Cell): boolean { return this.blockedCells.has(cellKey(cell)); }
  isMonsterAt(cell: Cell): boolean { return this.blockedCells.has(cellKey(cell)); }
  dispose(): void { this.disposed = true; this.client.dispose(); }
}
