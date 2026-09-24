import Phaser from "phaser";
import { AssetPaths, TextureKeys, TerrainFrames, TileIds, TILE_SIZE } from "../assets/manifest.ts";
import { BRIDGES, FINAL_EDGE_BRIDGE } from "../data/bridges.ts";
import { BridgeRun } from "../game/bridgeRun.ts";
import { DialogueModel } from "../game/dialogue.ts";
import { cellKey, type Cell, type Direction, type InputAction } from "../game/types.ts";
import { loadProgress, saveProgress, type SavedProgress } from "../game/progress.ts";
import { bindTouchInput, canRevealMonsters, InputRouter } from "../systems/input.ts";
import { RetroAudio } from "../systems/retroAudio.ts";
import { DomHud } from "../ui/domHud.ts";

type Mode = "title" | "overworld" | "story" | "bridge" | "encounter" | "ended";
type MapPoint = { x: number; y: number };
const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;
const BRIDGE_ENTRIES = [{ x: 7, y: 10 }, { x: 15, y: 10 }, { x: 23, y: 10 }];
const BRIDGE_EXITS = [{ x: 9, y: 10 }, { x: 17, y: 10 }, { x: 25, y: 10 }];
const START_POINT = { x: 2, y: 10 };
const FAMILY_POINT = { x: 28, y: 10 };
const BLOCKING_TILES = new Set<number>([TileIds.water, TileIds.tree, TileIds.stone, TileIds.house]);

export class GameScene extends Phaser.Scene {
  private progress!: SavedProgress;
  private inputRouter!: InputRouter;
  private hud!: DomHud;
  private audio!: RetroAudio;
  private dialogue!: DialogueModel;
  private run: BridgeRun | null = null;
  private mode: Mode = "title";
  private nextAfterDialogue: (() => void) | null = null;
  private boardLayer!: Phaser.GameObjects.Container;
  private encounterLayer!: Phaser.GameObjects.Container;
  private turbo!: Phaser.GameObjects.Sprite;
  private overworldTurbo: MapPoint = { ...START_POINT };
  private currentMapTiles: number[][] = [];
  private revealMonsterPlaces = false;
  private view: "overworld" | "bridge" | "ending" = "overworld";
  private boardHeight = 640;
  private bridgeOriginY = 0;
  private flakes: Phaser.GameObjects.Rectangle[] = [];
  private props: Phaser.GameObjects.Image[] = [];
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor() { super("game"); }

  preload(): void {
    this.load.spritesheet(TextureKeys.terrain, AssetPaths.terrain, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet(TextureKeys.props, AssetPaths.props, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet(TextureKeys.actors, AssetPaths.actors, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet(TextureKeys.turbo, AssetPaths.turbo, { frameWidth: 64, frameHeight: 64 });
    this.load.image(TextureKeys.tree, AssetPaths.tree);
    this.load.image(TextureKeys.cabin, AssetPaths.cabin);
  }

  create(): void {
    this.progress = loadProgress();
    this.audio = new RetroAudio();
    this.audio.setEnabled(this.progress.audioEnabled);
    this.dialogue = new DialogueModel(this.progress.textSpeed);
    this.inputRouter = new InputRouter();
    this.inputRouter.on(action => this.handleAction(action));
    const unbind = bindTouchInput(document.getElementById("game-shell")!, action => this.inputRouter.emit(action));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unbind);
    const resizeObserver = new ResizeObserver(() => {
      this.scale.getParentBounds();
      this.scale.refresh();
    });
    resizeObserver.observe(document.getElementById("game-shell")!);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => resizeObserver.disconnect());
    this.hud = new DomHud(() => this.toggleMonsterReveal());
    this.boardLayer = this.add.container(0, 0);
    this.encounterLayer = this.add.container(0, 0).setDepth(100).setVisible(false);
    this.cameras.main.roundPixels = true;
    this.anims.create({ key: "river-flow", frames: this.anims.generateFrameNumbers(TextureKeys.terrain, { start: 8, end: 11 }), frameRate: 3, repeat: -1 });
    this.anims.create({ key: "turbo-idle", frames: [{key:TextureKeys.turbo,frame:0,duration:1800},{key:TextureKeys.turbo,frame:1,duration:120},{key:TextureKeys.turbo,frame:2,duration:120},{key:TextureKeys.turbo,frame:3,duration:900}], frameRate: 5, repeat: -1 });
    for (let i=0; i<32; i++) {
      this.flakes.push(this.add.rectangle((i*137)%960, (i*89)%540, i%3 ? 2 : 3, 2, 0xe7efff, .45).setDepth(200));
    }
    this.drawOverworld();
    this.updateHud();
  }

  update(_time: number, deltaMs: number): void {
    this.dialogue.update(deltaMs / 1000, this.audio);
    this.updateHud();
    this.layoutView();
    this.anims.globalTimeScale = this.reducedMotion.matches ? 0 : 1;
    for (let i=0; i<this.flakes.length; i++) {
      const flake=this.flakes[i];
      flake.setVisible(this.mode!=="encounter" && !this.reducedMotion.matches);
      if (!this.reducedMotion.matches) {
        flake.y=(flake.y+deltaMs*(.007+(i%3)*.003))%540;
        flake.x=(flake.x+deltaMs*.002)%960;
      }
    }
    if (this.turbo?.anims) {
      if (this.reducedMotion.matches) this.turbo.anims.pause();
      else this.turbo.anims.resume();
    }
  }

  private layoutView(): void {
    const shell=document.getElementById("game-shell")!.getBoundingClientRect();
    const dialogue=document.querySelector<HTMLElement>(".dialogue-box")!;
    const bottom=dialogue.hidden ? 516 : Math.max(220, (dialogue.getBoundingClientRect().top-shell.top)/shell.height*540-20);
    const center=(90+bottom)/2;
    if (this.view==="bridge") {
      if (!this.run) return;
      if (this.boardHeight>400) this.boardLayer.y=Math.round(Phaser.Math.Clamp(center-this.turbo.y, bottom-this.boardHeight-this.bridgeOriginY, 90-this.bridgeOriginY));
      else this.boardLayer.y=Math.round(center-(this.bridgeOriginY+this.boardHeight/2));
    } else if (this.view==="overworld") {
      this.boardLayer.y=Math.round(Phaser.Math.Clamp(center-this.turbo.y, bottom-640, 90));
      this.turbo.setDepth(this.turbo.y+4);
      for(const prop of this.props) {
        const behind=Math.abs(prop.x-this.turbo.x)<prop.displayWidth*.48 && this.turbo.y<prop.y && this.turbo.y>prop.y-prop.displayHeight;
        prop.setAlpha(behind ? .35 : 1);
      }
      this.boardLayer.sort("depth");
    } else this.boardLayer.y=0;
  }
  private async startGame(): Promise<void> {
    this.hud.hideStart();
    this.mode = "overworld";
    this.progress.unlockedBridge = Phaser.Math.Clamp(this.progress.unlockedBridge, 0, BRIDGES.length - 1);
    saveProgress(this.progress);
    this.drawOverworld();
    window.setTimeout(() => void this.audio.unlock().catch(() => undefined), 0);
    if (this.progress.unlockedBridge === 0) {
      this.dialogue.say("Turbo only wanted to cross the rivers and reach his family.");
    }
  }

  private handleAction(action: InputAction): void {
    if (action === "reveal") { this.toggleMonsterReveal(); return; }
    if (this.mode === "title") {
      void this.startGame();
      return;
    }
    if (this.dialogue.hasText && action !== "back") {
      const wasBridge = this.mode === "bridge";
      const advanced = this.advanceDialogue();
      if (advanced && action !== "confirm" && wasBridge && this.mode === "bridge" && !this.dialogue.hasText && this.run) {
        this.moveBridge(action);
      }
      return;
    }
    if (action === "confirm") {
      this.advanceDialogue();
      return;
    }
    if (action === "back") {
      this.dialogue.say(this.mode === "overworld" ? "The snow muffles the jury's laughter." : "Turbo keeps walking. The jury keeps smiling.");
      return;
    }
    if (this.mode === "overworld") {
      this.moveOverworld(action);
      return;
    }
    if (this.mode !== "bridge" || !this.run) {
      return;
    }
    this.moveBridge(action);
  }

  private advanceDialogue(): boolean {
    const result = this.dialogue.confirm();
    if (result === "none") {
      return false;
    }
    if (this.dialogue.isFinished && this.nextAfterDialogue) {
      const next = this.nextAfterDialogue;
      this.nextAfterDialogue = null;
      next();
    }
    return true;
  }

  private moveOverworld(direction: Direction): void {
    const delta = directionDelta(direction);
    const target = { x: this.overworldTurbo.x + delta.x, y: this.overworldTurbo.y + delta.y };
    if (!this.isWalkable(target)) {
      this.dialogue.say("The river is cold. The trees are colder.");
      return;
    }
    this.overworldTurbo = target;
    this.turbo.setPosition(tileCenter(target.x), tileCenter(target.y));
    const bridgeIndex = this.bridgeIndexAt(target);
    if (bridgeIndex !== -1) {
      if (bridgeIndex > this.progress.unlockedBridge) {
        this.dialogue.say("The next jury table waits, but Turbo has unfinished business.");
        return;
      }
      this.startBridgeIntro(bridgeIndex);
    }
  }

  private startBridgeIntro(index: number): void {
    this.mode = "story";
    this.run = null;
    this.encounterLayer.setVisible(false);
    this.drawOverworld();
    this.dialogue.say(BRIDGES[index].intro);
    this.nextAfterDialogue = () => this.startBridge(index);
  }

  private startBridge(index: number): void {
    this.mode = "bridge";
    this.revealMonsterPlaces = false;
    this.run = new BridgeRun(BRIDGES[index]);
    this.dialogue.say(`${this.run.bridge.title}. Cross to the middle of the final row.`);
    this.drawBridge();
  }

  private startFinalEdgeBridgeIntro(): void {
    this.mode = "story";
    this.run = null;
    this.encounterLayer.setVisible(false);
    this.dialogue.say(FINAL_EDGE_BRIDGE.intro);
    this.nextAfterDialogue = () => this.startFinalEdgeBridge();
  }

  private startFinalEdgeBridge(): void {
    this.mode = "bridge";
    this.revealMonsterPlaces = false;
    this.run = new BridgeRun(FINAL_EDGE_BRIDGE);
    this.dialogue.say(`${this.run.bridge.title}. Cross to the middle of the final row.`);
    this.drawBridge();
  }

  private moveBridge(direction: Direction): void {
    if (!this.run || this.dialogue.hasText) {
      return;
    }
    const result = this.run.move(direction);
    this.drawBridge();

    if (result.kind === "blocked") {
      this.dialogue.say(result.message);
      return;
    }
    if (result.kind === "monster") {
      this.showEncounter("* A monster!");
      this.dialogue.say(["A monster!", `${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`]);
      this.nextAfterDialogue = () => {
        this.mode = "bridge";
        this.encounterLayer.setVisible(false);
        this.drawBridge();
      };
      return;
    }
    if (result.kind === "gameOver") {
      this.showEncounter("* A monster!");
      this.dialogue.say(["A monster!", "The bridge keeps its promise. Turbo is out of attempts."]);
      this.nextAfterDialogue = () => this.restartCurrentBridge();
      return;
    }
    if (result.kind === "won") {
      this.completeBridge();
    }
  }

  private completeBridge(): void {
    if (!this.run) {
      return;
    }
    if (this.run.bridge.id === FINAL_EDGE_BRIDGE.id) {
      this.mode = "ended";
      this.drawFamilyEnding();
      this.dialogue.say(["Turbo crossed the final bridge.", "His family was waiting on the other side."]);
      return;
    }
    const currentIndex = BRIDGES.findIndex((bridge) => bridge.id === this.run?.bridge.id);
    if (currentIndex >= BRIDGES.length - 1) {
      this.startFinalEdgeBridgeIntro();
      return;
    }
    this.progress.unlockedBridge = Math.max(this.progress.unlockedBridge, currentIndex + 1);
    this.overworldTurbo = { ...BRIDGE_EXITS[currentIndex] };
    saveProgress(this.progress);
    this.mode = "overworld";
    this.run = null;
    this.drawOverworld();
    this.dialogue.say("Turbo crossed the bridge.");
  }

  private restartCurrentBridge(): void {
    if (this.run?.bridge.id === FINAL_EDGE_BRIDGE.id) {
      this.startFinalEdgeBridgeIntro();
      return;
    }
    const currentIndex = Math.max(0, this.progress.unlockedBridge);
    this.startBridgeIntro(currentIndex);
  }


  private resetView(view: "overworld" | "bridge" | "ending"): void {
    this.view=view;
    this.boardLayer.removeAll(true);
    this.boardLayer.setPosition(0,0);
    this.props=[];
    this.encounterLayer.setVisible(false);
    this.cameras.main.setBackgroundColor("#869dca");
  }

  private terrain(x: number, y: number, frame: number, width=32, height=32): Phaser.GameObjects.Sprite {
    const tile=this.add.sprite(x,y,TextureKeys.terrain,frame).setDisplaySize(width,height).setDepth(-100);
    this.boardLayer.add(tile);
    return tile;
  }

  private prop(x: number, y: number, key: string, frame?: number, width?: number, height?: number): Phaser.GameObjects.Image {
    const sprite=this.add.image(x,y,key,frame).setOrigin(.5,1).setDepth(y);
    if(width && height) sprite.setDisplaySize(width,height);
    this.boardLayer.add(sprite);
    this.props.push(sprite);
    return sprite;
  }

  private drawOverworld(): void {
    this.resetView("overworld");
    this.currentMapTiles=this.createMapTiles();
    for(let y=0;y<MAP_HEIGHT;y++) for(let x=0;x<MAP_WIDTH;x++) {
      const logical=this.currentMapTiles[y][x];
      let frame: number=TerrainFrames.snow;
      if(y===9 || y===10) frame=TerrainFrames.path;
      if([6,14,22].includes(x) && y!==9 && y!==10) frame=TerrainFrames.bankLeft;
      if([9,17,25].includes(x) && y!==9 && y!==10) frame=TerrainFrames.bankRight;
      if(logical===TileIds.water) frame=TerrainFrames.water;
      if([7,8,15,16,23,24].includes(x) && (y===9 || y===10)) frame=TerrainFrames.overworldBridge;
      const tile=this.terrain(tileCenter(x),tileCenter(y),frame);
      if(frame===TerrainFrames.path) tile.setAngle(90);
      if(logical===TileIds.water) tile.play("river-flow");
    }
    // Boundary trees are scenery only. Logical collision cells stay untouched.
    for(let x=-1;x<31;x+=2) {
      this.prop(tileCenter(x),118+(x%3)*8,TextureKeys.tree);
      this.prop(tileCenter(x+1),644+(x%3)*6,TextureKeys.tree);
    }
    for(const tree of this.treePoints()) this.prop(tileCenter(tree.x),tileCenter(tree.y)+16,TextureKeys.tree);
    for(const y of [180,360,540]) {
      this.prop(-4,y,TextureKeys.props,3,64,96);
      this.prop(964,y+40,TextureKeys.props,3,64,96);
    }
    for(const stone of this.stonePoints()) this.prop(tileCenter(stone.x),tileCenter(stone.y)+15,TextureKeys.props,0,40,40);
    for(const sign of this.signPoints()) this.prop(tileCenter(sign.x),tileCenter(sign.y)+16,TextureKeys.props,1,40,40);
    this.prop(tileCenter(27),tileCenter(17)+16,TextureKeys.cabin);
    this.prop(tileCenter(27),tileCenter(11)+16,TextureKeys.props,2,48,48);
    this.prop(tileCenter(FAMILY_POINT.x),tileCenter(FAMILY_POINT.y)+16,TextureKeys.actors,0,48,48);
    for(const point of [{x:6,y:9},{x:14,y:9},{x:21,y:9},{x:22,y:11}]) this.prop(tileCenter(point.x),tileCenter(point.y)+16,TextureKeys.actors,1,44,44);
    this.prop(tileCenter(22),tileCenter(12)+16,TextureKeys.actors,3,48,48);
    this.turbo=this.add.sprite(tileCenter(this.overworldTurbo.x),tileCenter(this.overworldTurbo.y),TextureKeys.turbo,0).setDisplaySize(48,48).setOrigin(.5,.8);
    this.turbo.play("turbo-idle");
    this.boardLayer.add(this.turbo);
    for(let i=0;i<3;i++) {
      const label=this.makeLabel(["I","II","III"][i],tileCenter(5+i*8),tileCenter(7)+14,14);
      label.setDepth(900);
      this.boardLayer.add(label);
    }
    this.layoutView();
  }

  private drawBridge(): void {
    if(!this.run) return;
    this.mode="bridge";
    this.resetView("bridge");
    const bridge=this.run.bridge;
    const tile=isFinalBridge(bridge.id) ? 32 : 64;
    const width=bridge.width*tile;
    this.boardHeight=bridge.height*tile;
    const originX=Math.floor((960-width)/2);
    this.bridgeOriginY=0;
    // The banks and water frame the puzzle; every playable cell stays separate.
    for(let y=-640;y<this.boardHeight+640;y+=32) {
      for(let x=0;x<960;x+=32) {
        if(x>=originX-32 && x<originX+width+32) continue;
        const edge=x<originX ? originX-64 : originX+width+32;
        const frame=x===edge ? (x<originX?TerrainFrames.bankLeft:TerrainFrames.bankRight) : TerrainFrames.water;
        this.terrain(x+16,y+16,frame);
      }
    }
    const frame=this.add.graphics().setDepth(-90);
    frame.fillStyle(0x182333,1).fillRect(originX-8,-8,width+16,this.boardHeight+16);
    frame.lineStyle(4,0xc5d5ed,1).strokeRect(originX-8,-8,width+16,this.boardHeight+16);
    this.boardLayer.add(frame);
    for(let row=0;row<bridge.height;row++) for(let col=0;col<bridge.width;col++) {
      const cell={row,col};
      const x=originX+(col+.5)*tile, y=(row+.5)*tile;
      const known=row===0 || row===bridge.height-1 || this.run.oracle.visitedCells.has(cellKey(cell));
      const terrain=row===0?TerrainFrames.start:row===bridge.height-1?TerrainFrames.goal:known?TerrainFrames.walked:isFinalBridge(bridge.id)?TerrainFrames.darkBridge:TerrainFrames.bridge;
      this.terrain(x,y,terrain,tile,tile).setDepth(-80);
      if(this.run.oracle.isMonsterVisual(cell) || (this.revealMonsterPlaces && this.run.oracle.isMonsterAt(cell))) {
        this.boardLayer.add(this.add.image(x,y,TextureKeys.actors,isFinalBridge(bridge.id)?3:2).setDisplaySize(tile,tile));
      }
    }
    // Only the middle endpoints get the gold marker; side cells remain valid safe landings.
    for(const row of [0,bridge.height-1]) for(let col=0;col<bridge.width;col++) {
      if(col===Math.floor(bridge.width/2)) continue;
      this.terrain(originX+(col+.5)*tile,(row+.5)*tile,TerrainFrames.walked,tile,tile).setDepth(-79);
    }
    this.turbo=this.add.sprite(originX+(this.run.turbo.col+.5)*tile,(this.run.turbo.row+.5)*tile,TextureKeys.turbo,0).setDisplaySize(tile,tile).setDepth(20);
    const grid=this.add.graphics().setDepth(-70).lineStyle(1,0x172333,.55);
    for(let col=1;col<bridge.width;col++) grid.lineBetween(originX+col*tile,0,originX+col*tile,this.boardHeight);
    for(let row=1;row<bridge.height;row++) grid.lineBetween(originX,row*tile,originX+width,row*tile);
    this.boardLayer.add(grid);
    this.turbo.play("turbo-idle");
    this.boardLayer.add(this.turbo);
    this.layoutView();
  }

  private showEncounter(text: string): void {
    this.mode="encounter";
    this.encounterLayer.removeAll(true);
    this.encounterLayer.setVisible(true);
    this.audio.monsterLaugh();
    const bg=this.add.graphics();
    bg.fillStyle(0x101722,.97).fillRect(0,0,960,540);
    bg.lineStyle(3,0xc4d4ed,1).strokeRect(350,90,260,240);
    this.encounterLayer.add(bg);
    this.encounterLayer.add(this.add.image(480,205,TextureKeys.actors,this.run && isFinalBridge(this.run.bridge.id)?3:2).setDisplaySize(192,192));
    this.encounterLayer.add(this.makeLabel(text,480,355,24));
  }

  private drawFamilyEnding(): void {
    this.resetView("ending");
    this.hud.hideStatus();
    for(let y=0;y<540;y+=32) for(let x=0;x<960;x+=32) this.terrain(x+16,y+16,TerrainFrames.snow);
    for(let x=-20;x<1020;x+=60) {
      this.prop(x,120,TextureKeys.tree);
      this.prop(x+24,540,TextureKeys.tree);
    }
    this.prop(560,290,TextureKeys.cabin,undefined,320,256);
    this.prop(708,298,TextureKeys.props,2,64,64);
    this.prop(560,365,TextureKeys.actors,0,96,96);
    this.turbo=this.add.sprite(415,340,TextureKeys.turbo,0).setDisplaySize(80,80).setDepth(370);
    this.turbo.play("turbo-idle");
    this.boardLayer.add(this.turbo);
    this.boardLayer.sort("depth");
  }
  private createMapTiles(): number[][] {
    const data: number[][] = Array.from({ length: MAP_HEIGHT }, (_, y) =>
      Array.from({ length: MAP_WIDTH }, (_, x) => {
        if ((x + y) % 11 === 0) {
          return TileIds.darkSnow;
        }
        return y === 10 || y === 9 ? TileIds.path : TileIds.snow;
      })
    );

    for (const riverX of [7, 15, 23]) {
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        data[y][riverX] = TileIds.water;
        data[y][riverX + 1] = TileIds.water;
      }
    }
    for (const entry of BRIDGE_ENTRIES) {
      data[entry.y][entry.x] = TileIds.bridge;
      data[entry.y][entry.x + 1] = TileIds.bridge;
      data[entry.y - 1][entry.x] = TileIds.bridge;
      data[entry.y - 1][entry.x + 1] = TileIds.bridge;
    }
    for (const tree of this.treePoints()) {
      data[tree.y][tree.x] = TileIds.tree;
    }
    for (const stone of this.stonePoints()) {
      data[stone.y][stone.x] = TileIds.stone;
    }
    for (const sign of this.signPoints()) {
      data[sign.y][sign.x] = TileIds.sign;
    }
    data[17][27] = TileIds.house;
    data[11][27] = TileIds.lantern;
    return data;
  }

  private isWalkable(point: MapPoint): boolean {
    if (point.x < 0 || point.x >= MAP_WIDTH || point.y < 0 || point.y >= MAP_HEIGHT) {
      return false;
    }
    return !BLOCKING_TILES.has(this.currentMapTiles[point.y][point.x]);
  }

  private bridgeIndexAt(point: MapPoint): number {
    return BRIDGE_ENTRIES.findIndex((entry) => (point.x === entry.x || point.x === entry.x + 1) && (point.y === entry.y || point.y === entry.y - 1));
  }

  private treePoints(): MapPoint[] {
    return [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 15 },
      { x: 9, y: 3 },
      { x: 10, y: 16 },
      { x: 12, y: 2 },
      { x: 18, y: 4 },
      { x: 19, y: 16 },
      { x: 25, y: 15 },
      { x: 28, y: 3 }
    ];
  }

  private stonePoints(): MapPoint[] {
    return [
      { x: 4, y: 13 },
      { x: 11, y: 6 },
      { x: 18, y: 14 },
      { x: 26, y: 5 }
    ];
  }

  private signPoints(): MapPoint[] {
    return [
      { x: 5, y: 8 },
      { x: 13, y: 8 },
      { x: 21, y: 8 }
    ];
  }

  private makeLabel(text: string, x: number, y: number, size: number, align: CanvasTextAlign = "center"): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: `${size}px`,
        color: "#ffffff",
        align,
        stroke: "#000000",
        strokeThickness: 4
      })
      .setOrigin(align === "center" ? 0.5 : 0, 0.5);
  }

  private updateHud(): void {
    const showRevealButton = canRevealMonsters(this.mode, this.run?.bridge.oracleMode);
    this.hud?.update(
      this.mode === "ended" ? null : this.run,
      this.dialogue.text,
      !this.dialogue.isRevealing,
      this.progress,
      showRevealButton,
      this.revealMonsterPlaces
    );
  }

  private toggleMonsterReveal(): void {
    if (!canRevealMonsters(this.mode, this.run?.bridge.oracleMode)) {
      return;
    }
    this.revealMonsterPlaces = !this.revealMonsterPlaces;
    this.drawBridge();
  }
}

function tileCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

function directionDelta(direction: Direction): MapPoint {
  if (direction === "up") return { x: 0, y: -1 };
  if (direction === "down") return { x: 0, y: 1 };
  if (direction === "left") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function isFinalBridge(id: string): boolean {
  return id === "final" || id === FINAL_EDGE_BRIDGE.id;
}
