import { describe, expect, it } from "vitest";
import { actionFromDomKey, canRevealMonsters, GestureRecognizer } from "../src/systems/input.ts";
const p = (x=100,y=100,time=0,id=1) => ({x,y,time,id});
describe("touch gesture session", () => {
  it("emits exactly one direction at the CSS-pixel threshold", () => {
    const g=new GestureRecognizer(); g.begin(p());
    expect(g.end(p(132,105,200))).toBe("right");
    expect(g.end(p(132,105,210))).toBeNull();
  });
  it("taps confirm but intermediate travel does not", () => {
    const g=new GestureRecognizer(); g.begin(p()); expect(g.end(p(109,100,150))).toBe("confirm");
    g.begin(p()); expect(g.end(p(125,100,200))).toBeNull();
  });
  it("does not mistake a drag returning to its origin for a tap", () => {
    const g=new GestureRecognizer(); g.begin(p()); g.move(p(140,100,100));
    expect(g.end(p(100,100,200))).toBeNull();
  });
  it("holds trigger once and never also emit confirm on release", () => {
    const g=new GestureRecognizer(); g.begin(p());
    expect(g.hold(599)).toBeNull(); expect(g.hold(600)).toBe("back"); expect(g.hold(900)).toBeNull();
    expect(g.end(p(100,100,1000))).toBeNull();
  });
  it("recognizes a hold when the timer is delayed", () => {
    const g=new GestureRecognizer(); g.begin(p(), "counter");
    expect(g.end(p(100,100,700))).toBe("reveal");
  });
  it("cancels a hold after movement", () => {
    const g=new GestureRecognizer(); g.begin(p()); g.move(p(120,100,500));
    expect(g.hold(700)).toBeNull(); expect(g.end(p(150,100,800))).toBe("right");
  });
  it("cancellation produces no release action", () => {
    const g=new GestureRecognizer(); g.begin(p()); g.cancel();
    expect(g.end(p(180,100,800))).toBeNull(); expect(g.hold(900)).toBeNull();
  });
  it("a second pointer cancels the gesture", () => {
    const g=new GestureRecognizer(); g.begin(p());
    expect(g.begin(p(100,100,20,2))).toBe(false);
    expect(g.end(p(140,100,800,1))).toBeNull();
    expect(g.end(p(140,100,810,2))).toBeNull();
  });
  it("ignores moves and releases from another pointer", () => {
    const g=new GestureRecognizer(); g.begin(p()); g.move(p(300,100,100,2));
    expect(g.end(p(300,100,200,2))).toBeNull();
    expect(g.end(p(100,100,250,1))).toBe("confirm");
  });
});
describe("hidden reveal", () => {
  it("is restricted to active random-oracle bridges", () => {
    expect(canRevealMonsters("bridge","random")).toBe(true);
    for(const mode of ["title","overworld","story","encounter","ended"]) expect(canRevealMonsters(mode,"random")).toBe(false);
    expect(canRevealMonsters("bridge")).toBe(false);
    expect(canRevealMonsters("bridge","worst-case")).toBe(false);
  });
  it("preserves existing keyboard controls and adds R", () => {
    for(const key of ["r","R"]) expect(actionFromDomKey(key)).toBe("reveal");
    expect(actionFromDomKey("ArrowLeft")).toBe("left"); expect(actionFromDomKey(" ")).toBe("confirm"); expect(actionFromDomKey("Escape")).toBe("back");
  });
});
