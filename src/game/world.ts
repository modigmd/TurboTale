export type MapPoint = { x: number; y: number };
export type WorldBlock = "edge" | "water" | "solid" | null;
export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 20;
export const BRIDGE_ENTRIES = [{ x: 7, y: 10 }, { x: 15, y: 10 }, { x: 23, y: 10 }];
export const BRIDGE_EXITS = [{ x: 9, y: 10 }, { x: 17, y: 10 }, { x: 25, y: 10 }];
export const START_POINT = { x: 2, y: 10 };
export const FAMILY_POINT = { x: 27, y: 10 };
export const CABIN_POINT = { x: 27, y: 8 };
export const LANTERN_POINT = { x: 28, y: 11 };
export const TREE_POINTS = [{x:1,y:2},{x:3,y:4},{x:5,y:15},{x:9,y:3},{x:10,y:16},{x:12,y:2},{x:18,y:4},{x:19,y:16},{x:25,y:15},{x:28,y:3}];
export const STONE_POINTS = [{x:4,y:13},{x:11,y:6},{x:18,y:14},{x:26,y:5}];
export const SIGN_POINTS = [{x:5,y:8},{x:13,y:8},{x:21,y:8}];
export const JURY_POINTS = [{x:6,y:9},{x:14,y:9},{x:21,y:9},{x:22,y:11}];
export const MONSTER_POINT = {x:22,y:12};

/** Solid footprints share the same placement data used by the renderer. */
export function worldBlockAt(point: MapPoint): WorldBlock {
  const {x,y}=point;
  if(x<=0 || x>=MAP_WIDTH-1 || y<4 || y>=17) return "edge";
  if([7,8,15,16,23,24].includes(x) && y!==9 && y!==10) return "water";
  if(TREE_POINTS.some(p=>Math.abs(x-p.x)<=1 && y>=p.y-2 && y<=p.y)) return "solid";
  if(x>=CABIN_POINT.x-2 && x<=CABIN_POINT.x+2 && y>=CABIN_POINT.y-3 && y<=CABIN_POINT.y) return "solid";
  if([...STONE_POINTS,...SIGN_POINTS,...JURY_POINTS,FAMILY_POINT,LANTERN_POINT,MONSTER_POINT].some(p=>p.x===x && p.y===y)) return "solid";
  return null;
}
