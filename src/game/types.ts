export type Direction = "up" | "down" | "left" | "right";
export type InputAction = Direction | "confirm" | "back" | "reveal";

export interface Cell {
  row: number;
  col: number;
}

export interface BridgeConfig {
  id: string;
  title: string;
  width: number;
  height: number;
  maxAttempts: number;
  intro: string[];
  oracleMode?: "worst-case" | "random";
  forcedMonsters?: Cell[];
}

export type MoveResult =
  | { kind: "moved"; cell: Cell }
  | { kind: "blocked"; cell: Cell; message: string }
  | { kind: "monster"; cell: Cell; attemptsLeft: number }
  | { kind: "gameOver"; cell: Cell }
  | { kind: "won"; cell: Cell };

export const cellKey = (cell: Cell): string => `${cell.row},${cell.col}`;

export const sameCell = (a: Cell, b: Cell): boolean => a.row === b.row && a.col === b.col;
