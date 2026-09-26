import { describe, expect, it } from "vitest";
import { BridgeRun } from "../src/game/bridgeRun.ts";
import { DialogueModel } from "../src/game/dialogue.ts";
import { MovementPacer } from "../src/systems/input.ts";
import { worldBlockAt, TREE_POINTS, STONE_POINTS, JURY_POINTS, SIGN_POINTS, CABIN_POINT, FAMILY_POINT, LANTERN_POINT, MONSTER_POINT, START_POINT, BRIDGE_ENTRIES, BRIDGE_EXITS } from "../src/game/world.ts";
describe("world obstacles", () => {
  it("blocks every visible solid prop and character", () => {
    for(const point of [...TREE_POINTS,...STONE_POINTS,...JURY_POINTS,...SIGN_POINTS,CABIN_POINT,FAMILY_POINT,LANTERN_POINT,MONSTER_POINT]) expect(worldBlockAt(point)).not.toBeNull();
  });
  it("covers tree canopies and the full cabin footprint", () => {
    expect(worldBlockAt({x:4,y:13})).toBe("solid");
    expect(worldBlockAt({x:6,y:14})).toBe("solid");
    for(let y=5;y<=8;y++) for(let x=25;x<=28;x++) expect(worldBlockAt({x,y})).toBe("solid");
    expect(CABIN_POINT.x).toBe(FAMILY_POINT.x);
    expect(CABIN_POINT.y).toBeLessThan(FAMILY_POINT.y);
  });
  it("distinguishes river and perimeter feedback from silent props", () => {
    expect(worldBlockAt({x:7,y:8})).toBe("water");
    for(const point of [{x:0,y:10},{x:29,y:10},{x:4,y:3},{x:4,y:17},{x:-1,y:10}]) expect(worldBlockAt(point)).toBe("edge");
    expect(worldBlockAt(JURY_POINTS[0])).toBe("solid");
    for(const point of [...BRIDGE_ENTRIES,...BRIDGE_EXITS,START_POINT]) expect(worldBlockAt(point)).toBeNull();
  });
  it("keeps the main crossing route open", () => {
    for(let x=START_POINT.x;x<=BRIDGE_EXITS[2].x;x++) expect(worldBlockAt({x,y:10})).toBeNull();
  });
});
describe("bridge endpoints and silent blocks", () => {
  it.each([0,1,2,12,23])("wins at final-row column %s", async col => {
    const run=new BridgeRun({id:"test",title:"Test",width:24,height:25,maxAttempts:3,intro:[],oracleMode:"random"});
    run.turbo={row:23,col};
    expect(await run.move("down")).toEqual({kind:"won",cell:{row:24,col}});
    expect(run.won).toBe(true);
  });
  it("an out-of-bounds move leaves the next valid move available", async () => {
    const run=new BridgeRun({id:"test",title:"Test",width:3,height:4,maxAttempts:3,intro:[]});
    expect(await run.move("up")).toMatchObject({kind:"blocked",reason:"bounds"});
    expect(await run.move("right")).toMatchObject({kind:"moved",cell:{row:0,col:2}});
    expect(run.attempt).toBe(1);
  });
});
describe("speaker-aware dialogue", () => {
  it("changes portrait identity together with each queued line", () => {
    const model=new DialogueModel(34);
    model.say([{speaker:"jury",text:"Three attempts."},{speaker:"turbo",text:"Only three?"},{speaker:"family",text:"You're home!"}]);
    expect(model.speaker).toBe("jury"); model.confirm(); expect(model.text).toBe("Three attempts.");
    model.confirm(); expect(model.speaker).toBe("turbo"); model.confirm(); expect(model.text).toBe("Only three?");
    model.confirm(); expect(model.speaker).toBe("family");
    model.clear(); expect(model.hasText).toBe(false); expect(model.confirm()).toBe("none");
  });
});
describe("movement pacing", () => {
  it("accepts one step every 180 ms with no delayed backlog", () => {
    const pace=new MovementPacer();
    expect(pace.accept(0)).toBe(true);
    for(const time of [10,20,100,179]) expect(pace.accept(time)).toBe(false);
    expect(pace.accept(180)).toBe(true); expect(pace.accept(200)).toBe(false);
    expect(pace.accept(1000)).toBe(true); expect(pace.accept(1001)).toBe(false);
  });
});
