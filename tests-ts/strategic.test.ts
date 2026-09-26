import { describe, expect, it, vi } from "vitest";
import { StrategicSolver, type StrategicRequest } from "../src/game/strategicSolver.ts";
import { StrategicOracle, WorkerStrategyClient, type StrategyClient } from "../src/game/strategicOracle.ts";
import { BridgeRun } from "../src/game/bridgeRun.ts";
import { BRIDGES, FINAL_EDGE_BRIDGE } from "../src/data/bridges.ts";
import { cellKey, type Cell, type Direction } from "../src/game/types.ts";
import { canRevealMonsters } from "../src/systems/input.ts";

const directions: [Direction, number, number][] = [["down",1,0],["left",0,-1],["right",0,1],["up",-1,0]];
const inlineClient = (solver = new StrategicSolver(24)): StrategyClient => ({
  async decide({ masks, cell, lastAttempt }) { return solver.decide(masks, cell, lastAttempt); }, dispose() {}
});
const createRun = () => new BridgeRun(FINAL_EDGE_BRIDGE, new StrategicOracle(FINAL_EDGE_BRIDGE, inlineClient()));

/** Independent enumeration over complete boards, not matching or SCCs. */
function enumerate(width: number): number[][] {
  const boards: number[][] = [];
  const add = (cols: number[]) => {
    if (cols.length === width - 1) { boards.push(cols); return; }
    for (let c = 0; c < width; c++) if (!cols.includes(c)) add([...cols, c]);
  };
  add([]); return boards;
}

function exhaustive(width: number) {
  const boards = enumerate(width), all = (1 << boards.length) - 1;
  const hits = Array.from({ length: width - 1 }, (_, r) => Array.from({ length: width }, (_, c) =>
    boards.reduce((mask, board, i) => board[r] === c ? mask | (1 << i) : mask, 0)));
  const memo = new Map<number, number>();
  const solve = (belief: number): number => {
    const cached = memo.get(belief); if (cached !== undefined) return cached;
    const queue: Cell[] = Array.from({length: width}, (_, col) => ({ row: 0, col }));
    const seen = new Set(queue.map(cellKey)), frontier: number[] = [];
    for (let i = 0; i < queue.length; i++) {
      const {row,col} = queue[i];
      if (row === width) { memo.set(belief,0); return 0; }
      for (const [,dr,dc] of directions) {
        const q={row:row+dr,col:col+dc}, key=cellKey(q);
        if(q.row<0||q.row>width||q.col<0||q.col>=width||seen.has(key)) continue;
        seen.add(key);
        const hit=q.row>0&&q.row<width ? belief&hits[q.row-1][q.col] : 0;
        if(!hit) queue.push(q);
        else if(hit!==belief) frontier.push(hit);
      }
    }
    let best=Infinity;
    for(const hit of frontier) best=Math.min(best,Math.max(1+solve(hit),solve(belief&~hit)));
    memo.set(belief,best); return best;
  };
  const observations=new Set([all]), queue=[all];
  for(let i=0;i<queue.length;i++) for(const row of hits) for(const hitMask of row) {
    for(const child of [queue[i]&hitMask,queue[i]&~hitMask]) if(child&&!observations.has(child)) { observations.add(child); queue.push(child); }
  }
  return {boards,hits,all,solve,observations};
}

describe("exact strategic evaluation", () => {
  it("agrees with independent exhaustive minimax on all 1,415 small-board observation states", () => {
    const reference=exhaustive(4), solver=new StrategicSolver(4);
    expect(reference.observations.size).toBe(1415);
    for(const belief of reference.observations) {
      const masks=reference.hits.map(row=>row.reduce((mask,hit,c)=>belief&hit ? mask|(1<<c) : mask,0));
      expect(solver.normalize(masks)).toEqual(masks);
      expect(solver.value(masks)).toBe(reference.solve(belief));
      for(let r=1;r<4;r++) for(let c=0;c<4;c++) {
        const hit=belief&reference.hits[r-1][c], safe=belief&~reference.hits[r-1][c];
        const decision=solver.decide(masks,{row:r,col:c},false);
        const expected=!!hit&&(!safe||1+reference.solve(hit)>reference.solve(safe));
        expect(decision.monster).toBe(expected);
      }
    }
  });

  it("rejects globally impossible placements despite local row/column uniqueness", () => {
    const solver=new StrategicSolver(4);
    const masks=[0b0011,0b0011,0b1111];
    expect(solver.outcome(masks,{row:3,col:0},true)).toBeNull();
    expect(solver.decide(masks,{row:3,col:0},true).monster).toBe(false);
  });

  it("does not volunteer monsters in the first two rows", () => {
    const solver=new StrategicSolver(24);
    let masks=solver.initial();
    for(const cell of [{row:1,col:12},{row:2,col:12},{row:1,col:13},{row:2,col:13}]) {
      const decision=solver.decide(masks,cell,false);
      expect(decision.monster).toBe(false); masks=decision.masks;
    }
    expect(solver.decide(masks,{row:3,col:13},false).monster).toBe(true);
  });

  it("takes legal monster opportunities on the last attempt", () => {
    const solver=new StrategicSolver(24);
    expect(solver.decide(solver.initial(),{row:1,col:12},true).monster).toBe(true);
  });

  it("bounds its state cache at 4,096 entries", () => {
    const solver=new StrategicSolver(6);
    for(let i=0;i<5000;i++) solver.normalize([i&63,(i>>>6)&63,(i>>>12)&63,63,63]);
    expect(solver.cacheSize).toBe(4096);
  });
});

async function step(run: BridgeRun, direction: Direction) {
  const safe=new Set(run.oracle.safeCells), monsters=new Map(run.oracle.discoveredMonsters);
  const result=await run.move(direction);
  for(const key of safe) { expect(run.oracle.safeCells.has(key)).toBe(true); expect(run.oracle.blockedCells.has(key)).toBe(false); }
  for(const [row,col] of monsters) expect(run.oracle.discoveredMonsters.get(row)).toBe(col);
  // Independent full-completion check through the exported matching analyzer.
  const solver=new StrategicSolver(run.bridge.width), masks=solver.initial();
  for(const key of run.oracle.safeCells) {
    const [row,col]=key.split(",").map(Number);
    if(row>0&&row<run.bridge.height-1) masks[row-1]&=~(1<<col);
  }
  for(const [row,col] of run.oracle.discoveredMonsters) {
    for(let r=0;r<masks.length;r++) masks[r]=r===row-1 ? 1<<col : masks[r]&~(1<<col);
  }
  expect(solver.normalize(masks)).not.toBeNull();
  return result;
}

async function topColumn(run: BridgeRun, col: number) {
  expect(run.turbo.row).toBe(0);
  while(run.turbo.col!==col) await step(run,run.turbo.col<col?"right":"left");
}

function knownRoute(run: BridgeRun): Direction[] | null {
  const queue=[{cell:run.turbo,path:[] as Direction[]}], seen=new Set([cellKey(run.turbo)]);
  for(let i=0;i<queue.length;i++) {
    const {cell,path}=queue[i];
    if(cell.row===run.bridge.height-1) return path;
    for(const [direction,dr,dc] of directions) {
      const q={row:cell.row+dr,col:cell.col+dc}, key=cellKey(q);
      if(q.row<0||q.row>=run.bridge.height||q.col<0||q.col>=run.bridge.width||seen.has(key)||run.oracle.blockedCells.has(key)) continue;
      const safe=q.row===0||q.row===run.bridge.height-1||run.oracle.safeCells.has(key)||run.oracle.discoveredMonsters.has(q.row)||run.oracle.usedMonsterColumns.has(q.col);
      if(safe) { seen.add(key); queue.push({cell:q,path:[...path,direction]}); }
    }
  }
  return null;
}

describe("strategic bridge runs", () => {
  it("changes only the last board and its reveal availability", () => {
    expect(FINAL_EDGE_BRIDGE.oracleMode).toBe("strategic"); expect(FINAL_EDGE_BRIDGE.forcedMonsters).toBeUndefined();
    expect(BRIDGES.map(b=>b.oracleMode)).toEqual([undefined,undefined,"random"]);
    expect(canRevealMonsters("bridge",FINAL_EDGE_BRIDGE.oracleMode)).toBe(false);
    expect(canRevealMonsters("bridge",BRIDGES[2].oracleMode)).toBe(true);
  });

  it.each(Array.from({length:24},(_,i)=>i))("wins with the IMO strategy starting at column %i", async start => {
    const run=createRun();
    const order=[...Array.from({length:start+1},(_,i)=>start-i),...Array.from({length:23-start},(_,i)=>start+1+i)];
    for(const col of order) {
      await topColumn(run,col);
      const result=await step(run,"down");
      if(result.kind==="monster") break;
      await step(run,"up");
    }
    expect(run.attempt).toBe(2);
    const c=run.oracle.discoveredMonsters.get(1)!;
    if(c>0&&c<23) {
      await topColumn(run,c-1); await step(run,"down"); await step(run,"down");
    } else {
      const mirror=c===23, inward: Direction=mirror?"left":"right";
      await topColumn(run,mirror?22:1); await step(run,"down");
      for(let r=1;r<=22&&run.attempt===2;r++) {
        await step(run,inward);
        if(run.attempt===2) await step(run,"down");
      }
      while(run.attempt===2&&!run.won) await step(run,"down");
    }
    expect(run.attempt).toBe(3);
    const route=knownRoute(run); expect(route).not.toBeNull();
    for(const direction of route!) await step(run,direction);
    expect(run.won).toBe(true); expect(run.lost).toBe(false); run.dispose();
  });

  it("can defeat repeated straight-column guesses", async () => {
    const run=createRun();
    for(const col of [12,13,14]) {
      await topColumn(run,col);
      const attempt=run.attempt;
      for(let count=0;count<25&&run.attempt===attempt&&!run.won;count++) await step(run,"down");
    }
    expect(run.lost).toBe(true); expect(run.won).toBe(false);
  });

  it.each([0,23])("preserves the full mirrored edge strategy with a known edge monster at %i", async edge => {
    const solver=new StrategicSolver(24);
    let setup=true;
    const client: StrategyClient={async decide(q){
      if(setup) { setup=false; return {monster:true,masks:solver.outcome(q.masks,q.cell,true)!}; }
      return solver.decide(q.masks,q.cell,q.lastAttempt);
    },dispose(){}};
    // Seed one legal observation, then use exact strategic responses throughout.
    const run=new BridgeRun(FINAL_EDGE_BRIDGE,new StrategicOracle(FINAL_EDGE_BRIDGE,client));
    await topColumn(run,edge); await step(run,"down");
    await topColumn(run,edge===0?1:22); await step(run,"down");
    for(let r=1;r<=22&&run.attempt===2;r++) {
      await step(run,edge===0?"right":"left");
      if(run.attempt===2) await step(run,"down");
    }
    while(run.attempt===2&&!run.won) await step(run,"down");
    expect(run.attempt).toBe(3);
    const route=knownRoute(run); expect(route).not.toBeNull();
    for(const direction of route!) await step(run,direction);
    expect(run.won).toBe(true);
  });

  it("visual queries never decide cells or expose inferred safety", async () => {
    let calls=0;
    const client=inlineClient(), oracle=new StrategicOracle(FINAL_EDGE_BRIDGE,{...client,async decide(q){calls++;return client.decide(q);}});
    for(let row=0;row<25;row++) for(let col=0;col<24;col++) {
      oracle.isMonsterAt({row,col}); oracle.isMonsterVisual({row,col}); oracle.isSafeVisual({row,col});
    }
    expect(calls).toBe(0); expect(oracle.visitedCells.size).toBe(0);
    expect(oracle.isSafeVisual({row:1,col:12})).toBe(false);
  });
});

describe("worker transport",()=>{
  it("ignores wrong and duplicate reply IDs",async()=>{
    let worker: {onmessage?: (e: {data: unknown})=>void; postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn>};
    class FakeWorker { onmessage?: (e:{data:unknown})=>void; postMessage=vi.fn(); terminate=vi.fn(); constructor(){worker=this;} }
    vi.stubGlobal("Worker",FakeWorker);
    const client=new WorkerStrategyClient();
    try {
      const q={width:24,masks:Array(23).fill((1<<24)-1),cell:{row:1,col:12},lastAttempt:false};
      const pending=client.decide(q); let settled=false; void pending.then(()=>{settled=true;});
      worker!.onmessage!({data:{id:999,decision:{monster:true,masks:[]}}}); await Promise.resolve(); expect(settled).toBe(false);
      const id=worker!.postMessage.mock.calls[0][0].id;
      const expected={monster:false,masks:q.masks};
      worker!.onmessage!({data:{id,decision:expected}}); expect(await pending).toEqual(expected);
      worker!.onmessage!({data:{id,decision:{monster:true,masks:[]}}});
      const next=client.decide(q), cancelled=expect(next).rejects.toThrow("ended");
      client.dispose(); await cancelled; expect(worker!.terminate).toHaveBeenCalledOnce();
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
});

describe("asynchronous step lifecycle", () => {
  const deferred = () => {
    let resolve!: (decision: ReturnType<StrategicSolver["decide"]>)=>void;
    let reject!: (error: Error)=>void;
    let request!: Omit<StrategicRequest,"id">;
    const client: StrategyClient={decide(q){request=q;return new Promise((yes,no)=>{resolve=yes;reject=no;});},dispose(){}};
    const run=new BridgeRun(FINAL_EDGE_BRIDGE,new StrategicOracle(FINAL_EDGE_BRIDGE,client));
    return {run,resolve:()=>resolve(new StrategicSolver(24).decide(request.masks,request.cell,request.lastAttempt)),reject:()=>reject(new Error("test failure"))};
  };
  it("drops duplicate steps while a decision is pending",async()=>{
    const d=deferred(), first=d.run.move("down");
    expect(await d.run.move("right")).toMatchObject({kind:"blocked",reason:"pending"});
    d.resolve(); expect((await first).kind).toBe("moved");
    expect(d.run.turbo).toEqual({row:1,col:12}); expect(d.run.attempt).toBe(1);
  });
  it("discards a late reply after disposal and leaves a replacement run untouched",async()=>{
    const d=deferred(), pending=d.run.move("down");
    const rejected=expect(pending).rejects.toThrow("ended");
    d.run.dispose(); const replacement=createRun(); d.resolve(); await rejected;
    expect(d.run.oracle.visitedCells.size).toBe(1); expect(d.run.turbo.row).toBe(0);
    expect(replacement.oracle.discoveredMonsters.size).toBe(0); expect(replacement.attempt).toBe(1);
  });
  it("failed evaluation changes nothing and the next tap can retry",async()=>{
    const d=deferred(), pending=d.run.move("down"), failed=expect(pending).rejects.toThrow("test failure");
    d.reject(); await failed;
    expect(d.run.turbo).toEqual({row:0,col:12}); expect(d.run.attempt).toBe(1);
    expect(d.run.oracle.visitedCells.size).toBe(1);
    const retry=d.run.move("down"); d.resolve(); expect((await retry).kind).toBe("moved");
  });
});
