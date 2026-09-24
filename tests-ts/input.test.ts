import { describe, expect, it } from "vitest";

import { directionFromSwipe } from "../src/systems/input.ts";

describe("directionFromSwipe", () => {
  it.each([
    [{ x: 10, y: 10 }, { x: 70, y: 20 }, "right"],
    [{ x: 70, y: 10 }, { x: 10, y: 20 }, "left"],
    [{ x: 10, y: 70 }, { x: 20, y: 10 }, "up"],
    [{ x: 10, y: 10 }, { x: 20, y: 70 }, "down"]
  ] as const)("maps a dominant swipe to %s", (start, end, expected) => {
    expect(directionFromSwipe(start, end)).toBe(expected);
  });

  it("ignores short gestures", () => {
    expect(directionFromSwipe({ x: 10, y: 10 }, { x: 35, y: 20 })).toBeNull();
  });
});
