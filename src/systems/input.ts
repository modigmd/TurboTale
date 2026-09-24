import type { Direction, InputAction } from "../game/types.ts";

type Listener = (action: InputAction) => void;

/** Drop rapid repeated steps instead of queuing movement after the player stops. */
export class MovementPacer {
  private lastStep = -Infinity;
  accept(now: number): boolean {
    if (now - this.lastStep < 180) return false;
    this.lastStep = now;
    return true;
  }
}

const KEY_ACTIONS = new Map<string, InputAction>([
  ["ArrowUp", "up"],
  ["w", "up"],
  ["W", "up"],
  ["ArrowDown", "down"],
  ["s", "down"],
  ["S", "down"],
  ["ArrowLeft", "left"],
  ["a", "left"],
  ["A", "left"],
  ["ArrowRight", "right"],
  ["d", "right"],
  ["D", "right"],
  ["Enter", "confirm"],
  [" ", "confirm"],
  ["Escape", "back"],
  ["r", "reveal"],
  ["R", "reveal"]
]);

export class InputRouter {
  private listeners = new Set<Listener>();

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const action = actionFromDomKey(event.key);
      if (!action) {
        return;
      }
      event.preventDefault();
      this.emit(action);
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(action: InputAction): void {
    for (const listener of this.listeners) {
      listener(action);
    }
  }
}

type GesturePoint = { id: number; x: number; y: number; time: number };
type GestureTarget = "playfield" | "counter";

/** CSS-pixel gesture state, independent of Phaser's resolution and camera. */
export class GestureRecognizer {
  private active: (GesturePoint & { target: GestureTarget; travel: number; consumed: boolean }) | null = null;

  begin(point: GesturePoint, target: GestureTarget = "playfield"): boolean {
    if (this.active) { this.cancel(); return false; }
    this.active = { ...point, target, travel: 0, consumed: false };
    return true;
  }

  move(point: GesturePoint): void {
    if (!this.active || point.id !== this.active.id) return;
    this.active.travel = Math.max(this.active.travel, Math.hypot(point.x - this.active.x, point.y - this.active.y));
  }

  hold(time: number): InputAction | null {
    const a = this.active;
    if (!a || a.consumed || a.travel > 10 || time - a.time < 600) return null;
    a.consumed = true;
    return a.target === "counter" ? "reveal" : "back";
  }

  end(point: GesturePoint): InputAction | null {
    const a = this.active;
    if (!a || a.id !== point.id) return null;
    this.move(point);
    const held = this.hold(point.time);
    this.active = null;
    if (held) return held;
    if (a.consumed) return null;
    const direction = directionFromSwipe(a, point, 32);
    if (direction) return direction;
    return a.travel <= 10 ? "confirm" : null;
  }

  cancel(): void { this.active = null; }
}

export function canRevealMonsters(mode: string, oracleMode?: string): boolean {
  return mode === "bridge" && oracleMode === "random";
}

/** One listener surface covers canvas, title, and dialogue without click duplicates. */
export function bindTouchInput(surface: HTMLElement, emit: (action: InputAction) => void): () => void {
  const gesture = new GestureRecognizer();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const point = (event: PointerEvent): GesturePoint => ({ id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() });
  const cancel = () => { clearTimeout(timer); gesture.cancel(); };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element && event.target.closest("[data-status]") ? "counter" : "playfield";
    clearTimeout(timer);
    if (!gesture.begin(point(event), target)) return;
    surface.setPointerCapture(event.pointerId);
    timer = setTimeout(() => { const action = gesture.hold(performance.now()); if (action) emit(action); }, 610);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => gesture.move(point(event));
  const up = (event: PointerEvent) => {
    clearTimeout(timer);
    const bounds = surface.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      cancel();
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      return;
    }
    const action = gesture.end(point(event));
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    if (action) emit(action);
  };
  const context = (event: Event) => event.preventDefault();
  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", cancel);
  surface.addEventListener("lostpointercapture", cancel);
  surface.addEventListener("contextmenu", context);
  window.addEventListener("blur", cancel);
  window.addEventListener("resize", cancel);
  return () => {
    cancel();
    surface.removeEventListener("pointerdown", down);
    surface.removeEventListener("pointermove", move);
    surface.removeEventListener("pointerup", up);
    surface.removeEventListener("pointercancel", cancel);
    surface.removeEventListener("lostpointercapture", cancel);
    surface.removeEventListener("contextmenu", context);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("resize", cancel);
  };
}

export function actionFromDomKey(key: string): InputAction | null {
  return KEY_ACTIONS.get(key) ?? null;
}

export function directionFromSwipe(
  start: { x: number; y: number },
  end: { x: number; y: number },
  minimumDistance = 40
): Direction | null {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < minimumDistance) {
    return null;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "down" : "up";
}
