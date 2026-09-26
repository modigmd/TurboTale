import type { Cell } from "./types.ts";

export interface StrategicDecision { monster: boolean; masks: number[] }
export interface StrategicRequest { id: number; width: number; masks: number[]; cell: Cell; lastAttempt: boolean }
export type StrategicResponse = { id: number; decision: StrategicDecision } | { id: number; error: string };

/** Exact knowledge-state minimax for width columns and width+1 rows.
 * A row mask contains every still-possible monster column, not a chosen board.
 * The dummy row accounts for the one column without a monster.
 */
export class StrategicSolver {
  private cache = new Map<string, { masks: number[] | null; value?: number }>();
  readonly fullMask: number;

  constructor(readonly width: number) {
    if (width < 3 || width > 24) throw new Error("Unsupported strategic board width.");
    this.fullMask = (1 << width) - 1;
  }

  initial(): number[] { return Array(this.width - 1).fill(this.fullMask); }
  get cacheSize(): number { return this.cache.size; }

  private remember(key: string, entry: { masks: number[] | null; value?: number }): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, entry);
    if (this.cache.size > 4096) this.cache.delete(this.cache.keys().next().value!);
  }

  normalize(input: readonly number[]): number[] | null {
    if (input.length !== this.width - 1) throw new Error("Invalid strategic board height.");
    const key = input.join(",");
    const cached = this.cache.get(key);
    if (cached) return cached.masks;
    const n = this.width;
    const rows = [...input, this.fullMask];
    const owner = Array<number>(n).fill(-1);
    const assign = (r: number, seen: boolean[]): boolean => {
      for (let bits = rows[r]; bits; bits &= bits - 1) {
        const c = 31 - Math.clz32(bits & -bits);
        if (seen[c]) continue;
        seen[c] = true;
        if (owner[c] < 0 || assign(owner[c], seen)) { owner[c] = r; return true; }
      }
      return false;
    };
    for (let r = 0; r < n; r++) {
      if (!assign(r, Array(n).fill(false))) {
        this.remember(key, { masks: null }); return null;
      }
    }
    // Matched edges go column→row, other edges row→column.
    const graph: number[][] = Array.from({ length: 2 * n }, () => []);
    for (let r = 0; r < n; r++) for (let bits = rows[r]; bits; bits &= bits - 1) {
      const c = 31 - Math.clz32(bits & -bits);
      if (owner[c] === r) graph[n + c].push(r);
      else graph[r].push(n + c);
    }
    const index = Array(2 * n).fill(-1), low = Array(2 * n).fill(0), component = Array(2 * n).fill(-1);
    const stack: number[] = [], onStack = Array(2 * n).fill(false);
    let nextIndex = 0, nextComponent = 0;
    const visit = (v: number) => {
      index[v] = low[v] = nextIndex++;
      stack.push(v); onStack[v] = true;
      for (const u of graph[v]) {
        if (index[u] < 0) { visit(u); low[v] = Math.min(low[v], low[u]); }
        else if (onStack[u]) low[v] = Math.min(low[v], index[u]);
      }
      if (low[v] === index[v]) {
        let u: number;
        do { u = stack.pop()!; onStack[u] = false; component[u] = nextComponent; } while (u !== v);
        nextComponent++;
      }
    };
    for (let v = 0; v < 2 * n; v++) if (index[v] < 0) visit(v);
    const masks = input.map((mask, r) => {
      let result = 0;
      for (let bits = mask; bits; bits &= bits - 1) {
        const c = 31 - Math.clz32(bits & -bits);
        if (owner[c] === r || component[r] === component[n + c]) result |= 1 << c;
      }
      return result;
    });
    this.remember(key, { masks });
    return masks;
  }

  outcome(masks: readonly number[], cell: Cell, monster: boolean): number[] | null {
    const r = cell.row - 1, bit = 1 << cell.col;
    if (r < 0 || r >= masks.length) return monster ? null : [...masks];
    if (monster && !(masks[r] & bit)) return null;
    const next = [...masks];
    if (monster) {
      for (let i = 0; i < next.length; i++) next[i] = i === r ? bit : next[i] & ~bit;
    } else next[r] &= ~bit;
    return this.normalize(next);
  }

  /** Current position is connected to the top by the actual visited-safe trail. */
  private reach(masks: readonly number[]): { won: boolean; frontier: Cell[] } {
    const w = this.width, h = w + 1;
    const seen = new Uint8Array(w * h), frontier: Cell[] = [], queue: number[] = [];
    for (let c = 0; c < w; c++) { seen[c] = 1; queue.push(c); }
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head], r = Math.floor(id / w), c = id % w;
      if (r === h - 1) return { won: true, frontier: [] };
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (nr < 0 || nr >= h || nc < 0 || nc >= w || seen[nr * w + nc]) continue;
        seen[nr * w + nc] = 1;
        if (nr > 0 && nr < h - 1 && (masks[nr - 1] & (1 << nc))) frontier.push({ row: nr, col: nc });
        else queue.push(nr * w + nc);
      }
    }
    return { won: false, frontier };
  }

  value(input: readonly number[]): number {
    const initial = this.normalize(input);
    if (!initial) throw new Error("Impossible strategic state.");
    const key = initial.join(",");
    const cached = this.cache.get(key)?.value;
    if (cached !== undefined) return cached;
    let masks = initial;
    let result = 2;
    const first = this.reach(masks);
    if (first.won) result = 0;
    else {
      // A one-hit strategy may only probe cells whose monster answer leaves
      // an all-safe route. Simulating any admissible safe answer cannot hurt.
      for (;;) {
        const state = this.reach(masks);
        if (state.won) { result = 1; break; }
        const forcedCols = masks.filter(m => (m & (m - 1)) === 0).map(m => 31 - Math.clz32(m));
        const distance = (c: number) => forcedCols.length ? Math.min(...forcedCols.map(f => Math.abs(c - f))) : 0;
        state.frontier.sort((a, b) => b.row - a.row || distance(a.col) - distance(b.col) || a.col - b.col);
        let expanded = false;
        for (const cell of state.frontier) {
          const hit = this.outcome(masks, cell, true);
          if (!hit || !this.reach(hit).won) continue;
          const safe = this.outcome(masks, cell, false);
          if (!safe) { result = 1; break; }
          masks = safe; expanded = true; break;
        }
        if (result === 1 || !expanded) break;
      }
    }
    this.remember(key, { masks: initial, value: result });
    return result;
  }

  decide(input: readonly number[], cell: Cell, lastAttempt: boolean): StrategicDecision {
    const masks = this.normalize(input);
    if (!masks) throw new Error("Impossible strategic state.");
    const hit = this.outcome(masks, cell, true);
    const safe = this.outcome(masks, cell, false);
    if (!hit && !safe) throw new Error("No legal observation.");
    if (!hit) return { monster: false, masks: safe! };
    if (!safe || lastAttempt) return { monster: true, masks: hit };
    const monster = 1 + this.value(hit) > this.value(safe);
    return { monster, masks: monster ? hit : safe };
  }
}
