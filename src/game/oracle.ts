import type { BridgeConfig, Cell } from "./types.ts";
import { cellKey } from "./types.ts";

export interface BridgeOracle {
  readonly discoveredMonsters: Map<number, number>;
  readonly usedMonsterColumns: Set<number>;
  readonly safeCells: Set<string>;
  readonly visitedCells: Set<string>;
  readonly blockedCells: Set<string>;
  markSafe(cell: Cell): void;
  revealIfMonster(cell: Cell): boolean | Promise<boolean>;
  isSafeVisual(cell: Cell): boolean;
  isMonsterVisual(cell: Cell): boolean;
  isMonsterAt(cell: Cell): boolean;
  dispose?(): void;
}

export class WorstCaseOracle {
  readonly discoveredMonsters = new Map<number, number>();
  readonly usedMonsterColumns = new Set<number>();
  readonly safeCells = new Set<string>();
  readonly visitedCells = new Set<string>();
  readonly blockedCells = new Set<string>();
  private readonly bridge: BridgeConfig;
  private readonly forcedMonsters = new Map<number, number>();

  constructor(bridge: BridgeConfig) {
    this.bridge = bridge;
    for (const monster of bridge.forcedMonsters ?? []) {
      this.forcedMonsters.set(monster.row, monster.col);
    }
    this.validate();
  }

  markSafe(cell: Cell): void {
    this.safeCells.add(cellKey(cell));
    this.visitedCells.add(cellKey(cell));
  }

  revealIfMonster(cell: Cell): boolean {
    const key = cellKey(cell);
    this.visitedCells.add(key);

    if (this.blockedCells.has(key)) {
      return false;
    }
    if (this.isTopOrBottom(cell)) {
      this.markSafe(cell);
      return false;
    }
    if (this.safeCells.has(key)) {
      return false;
    }
    if (this.discoveredMonsters.get(cell.row) === cell.col) {
      return true;
    }
    if (this.forcedMonsters.get(cell.row) === cell.col) {
      this.markMonster(cell);
      return true;
    }
    if (this.discoveredMonsters.has(cell.row) || this.usedMonsterColumns.has(cell.col)) {
      this.markSafe(cell);
      return false;
    }
    if (this.canExtendWithMonster(cell)) {
      this.markMonster(cell);
      return true;
    }
    this.markSafe(cell);
    this.validate();
    return false;
  }

  isSafeVisual(cell: Cell): boolean {
    return (
      this.isTopOrBottom(cell) ||
      this.safeCells.has(cellKey(cell)) ||
      this.discoveredMonsters.has(cell.row) ||
      this.usedMonsterColumns.has(cell.col)
    );
  }

  isMonsterVisual(cell: Cell): boolean {
    return this.blockedCells.has(cellKey(cell));
  }

  isMonsterAt(cell: Cell): boolean {
    return this.blockedCells.has(cellKey(cell));
  }

  canExtendWithMonster(cell: Cell): boolean {
    if (this.isTopOrBottom(cell) || this.safeCells.has(cellKey(cell))) {
      return false;
    }

    const forced = this.baseForcedMonsters();
    const existingCol = forced.get(cell.row);
    if (existingCol !== undefined && existingCol !== cell.col) {
      return false;
    }
    forced.set(cell.row, cell.col);
    return this.canMatchRemainingRows(forced, this.safeCells);
  }

  canExtendWithSafe(cell: Cell): boolean {
    const safeCells = new Set(this.safeCells);
    safeCells.add(cellKey(cell));
    return this.canMatchRemainingRows(this.baseForcedMonsters(), safeCells);
  }

  canExtendCurrentState(): boolean {
    return this.canMatchRemainingRows(this.baseForcedMonsters(), this.safeCells);
  }

  private markMonster(cell: Cell): void {
    this.discoveredMonsters.set(cell.row, cell.col);
    this.usedMonsterColumns.add(cell.col);
    this.blockedCells.add(cellKey(cell));
    this.visitedCells.add(cellKey(cell));
    this.validate();
  }

  private baseForcedMonsters(): Map<number, number> {
    return new Map([...this.forcedMonsters, ...this.discoveredMonsters]);
  }

  private canMatchRemainingRows(forced: Map<number, number>, safeCells: Set<string>): boolean {
    if (!this.forcedMonstersAreValid(forced, safeCells)) {
      return false;
    }

    const usedCols = new Set(forced.values());
    const availableCols = [...Array(this.bridge.width).keys()].filter((col) => !usedCols.has(col));
    const matches = new Map<number, number>();

    const canAssign = (row: number, seenCols: Set<number>): boolean => {
      for (const col of availableCols) {
        if (seenCols.has(col) || safeCells.has(cellKey({ row, col }))) {
          continue;
        }
        seenCols.add(col);
        const matchedRow = matches.get(col);
        if (matchedRow === undefined || canAssign(matchedRow, seenCols)) {
          matches.set(col, row);
          return true;
        }
      }
      return false;
    };

    return this.interiorRows()
      .filter((row) => !forced.has(row))
      .every((row) => canAssign(row, new Set()));
  }

  private forcedMonstersAreValid(forced: Map<number, number>, safeCells: Set<string>): boolean {
    const cols = new Set<number>();
    for (const [row, col] of forced) {
      if (row <= 0 || row >= this.bridge.height - 1) {
        return false;
      }
      if (col < 0 || col >= this.bridge.width || cols.has(col)) {
        return false;
      }
      if (safeCells.has(cellKey({ row, col }))) {
        return false;
      }
      cols.add(col);
    }
    return true;
  }

  private interiorRows(): number[] {
    return [...Array(Math.max(0, this.bridge.height - 2)).keys()].map((index) => index + 1);
  }

  private validate(): void {
    if (!this.canExtendCurrentState()) {
      throw new Error("Oracle reached an impossible bridge state.");
    }
  }

  private isTopOrBottom(cell: Cell): boolean {
    return cell.row === 0 || cell.row === this.bridge.height - 1;
  }
}

export class RandomOracle implements BridgeOracle {
  readonly discoveredMonsters = new Map<number, number>();
  readonly usedMonsterColumns = new Set<number>();
  readonly safeCells = new Set<string>();
  readonly visitedCells = new Set<string>();
  readonly blockedCells = new Set<string>();
  private readonly bridge: BridgeConfig;
  private readonly monsters: Map<number, number>;

  constructor(bridge: BridgeConfig) {
    this.bridge = bridge;
    this.monsters = this.generateMonsters();
  }

  markSafe(cell: Cell): void {
    this.safeCells.add(cellKey(cell));
    this.visitedCells.add(cellKey(cell));
  }

  revealIfMonster(cell: Cell): boolean {
    const key = cellKey(cell);
    this.visitedCells.add(key);

    if (this.blockedCells.has(key)) {
      return false;
    }
    if (cell.row === 0 || cell.row === this.bridge.height - 1) {
      this.markSafe(cell);
      return false;
    }
    if (this.monsters.get(cell.row) === cell.col) {
      this.discoveredMonsters.set(cell.row, cell.col);
      this.usedMonsterColumns.add(cell.col);
      this.blockedCells.add(key);
      return true;
    }
    this.markSafe(cell);
    return false;
  }

  isSafeVisual(cell: Cell): boolean {
    return (
      cell.row === 0 ||
      cell.row === this.bridge.height - 1 ||
      this.safeCells.has(cellKey(cell)) ||
      this.discoveredMonsters.has(cell.row) ||
      this.usedMonsterColumns.has(cell.col)
    );
  }

  isMonsterVisual(cell: Cell): boolean {
    return this.blockedCells.has(cellKey(cell));
  }

  isMonsterAt(cell: Cell): boolean {
    return this.monsters.get(cell.row) === cell.col;
  }

  private generateMonsters(): Map<number, number> {
    const interiorRows = this.bridge.height - 2;
    if (interiorRows <= 0 || this.bridge.width < interiorRows) {
      throw new Error("Random oracle cannot place one monster per interior row.");
    }
    this.validateForcedMonsters();

    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const candidate = this.generateDiagonalCandidate(interiorRows);
      if (candidate && this.matchesForcedMonsters(candidate)) {
        return candidate;
      }
    }
    throw new Error("Random oracle could not build a valid diagonal layout.");
  }

  private generateDiagonalCandidate(interiorRows: number): Map<number, number> | null {
    const lengths = randomDiagonalLengths(interiorRows);
    const unusedColumns = this.bridge.width - interiorRows;
    const gapSlots = [...Array(lengths.length + 1).keys()];
    shuffle(gapSlots);
    const gaps = new Set(gapSlots.slice(0, unusedColumns));
    const blocks: number[][] = [];
    let column = 0;

    for (let index = 0; index < lengths.length; index += 1) {
      if (gaps.has(index)) {
        column += 1;
      }
      const length = lengths[index];
      blocks.push([...Array(length).keys()].map((offset) => column + offset));
      column += length;
    }
    shuffle(blocks);

    const monsters = new Map<number, number>();
    let row = 1;
    let previousColumn: number | undefined;
    for (const block of blocks) {
      if (randomInt(2) === 1) {
        block.reverse();
      }
      if (previousColumn !== undefined && Math.abs(previousColumn - block[0]) === 1) {
        return null;
      }
      for (const monsterColumn of block) {
        monsters.set(row, monsterColumn);
        previousColumn = monsterColumn;
        row += 1;
      }
    }
    return monsters;
  }

  private validateForcedMonsters(): void {
    const rows = new Set<number>();
    const columns = new Set<number>();
    for (const monster of this.bridge.forcedMonsters ?? []) {
      if (
        monster.row <= 0 ||
        monster.row >= this.bridge.height - 1 ||
        monster.col < 0 ||
        monster.col >= this.bridge.width ||
        rows.has(monster.row) ||
        columns.has(monster.col)
      ) {
        throw new Error("Random oracle received an invalid forced monster.");
      }
      rows.add(monster.row);
      columns.add(monster.col);
    }
  }

  private matchesForcedMonsters(monsters: Map<number, number>): boolean {
    return (this.bridge.forcedMonsters ?? []).every((monster) => monsters.get(monster.row) === monster.col);
  }
}

const randomDiagonalLengths = (total: number): number[] => {
  const lengths: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const choices = [3, 4, 5].filter((length) => remaining === length || remaining - length >= 3);
    if (choices.length === 0) {
      throw new Error("Interior rows cannot be divided into diagonals of length 3 to 5.");
    }
    const length = choices[randomInt(choices.length)];
    lengths.push(length);
    remaining -= length;
  }
  return lengths;
};

const shuffle = <T>(values: T[]): void => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
};

const randomInt = (maxExclusive: number): number => {
  const range = 0x1_0000_0000;
  const limit = range - (range % maxExclusive);
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % maxExclusive;
};
