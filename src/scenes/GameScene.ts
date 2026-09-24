import Phaser from "phaser";
import { AssetPaths, TextureKeys, TerrainFrames, TileIds, TILE_SIZE } from "../assets/manifest.ts";
import { BRIDGES, FINAL_EDGE_BRIDGE } from "../data/bridges.ts";
import { BridgeRun } from "../game/bridgeRun.ts";
import { DialogueModel } from "../game/dialogue.ts";
import { cellKey, type Cell, type Direction, type InputAction } from "../game/types.ts";
import { loadProgress, saveProgress, type SavedProgress } from "../game/progress.ts";
import { bindTouchInput, canRevealMonsters, InputRouter, MovementPacer } from "../systems/input.ts";
import { RetroAudio } from "../systems/retroAudio.ts";
import { DomHud } from "../ui/domHud.ts";

type Mode = "title" | "overworld" | "story" | "bridge" | "encounter" | "ended";
import { MAP_WIDTH, MAP_HEIGHT, BRIDGE_ENTRIES, BRIDGE_EXITS, START_POINT, FAMILY_POINT, CABIN_POINT, LANTERN_POINT, TREE_POINTS, STONE_POINTS, SIGN_POINTS, JURY_POINTS, MONSTER_POINT, worldBlockAt, type MapPoint } from "../game/world.ts";

export class GameScene extends Phaser.Scene {
  private progress!: SavedProgress;
  private inputRouter!: InputRouter;
  private movementPacer = new MovementPacer();
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
    this.load.image(TextureKeys.star, AssetPaths.star);
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

  }

  private handleAction(action: InputAction): void {
    if (action === "reveal") { this.toggleMonsterReveal(); return; }
    if (this.mode === "title") { void this.startGame(); return; }
    if (action === "confirm") { this.advanceDialogue(); return; }
    if (action === "back") {
      this.hud.showNotice(this.mode === "overworld" ? "Head for the next bridge." : "Reach any large star.");
      return;
    }
    if (this.mode === "ended" || !this.movementPacer.accept(performance.now())) return;
    // A direction also dismisses dialogue and completes its transition.
    // Never consume a movement gesture just to close an informational message.
    for (let i = 0; i < 4 && (this.dialogue.hasText || this.nextAfterDialogue); i++) {
      this.dialogue.clear();
      const next = this.nextAfterDialogue;
      this.nextAfterDialogue = null;
      next?.();
    }
    this.hud.clearNotice();
    if (this.mode === "overworld") this.moveOverworld(action);
    else if (this.mode === "bridge" && this.run) this.moveBridge(action);
  }

  private advanceDialogue(): boolean {
    const result = this.dialogue.confirm();
    if (result === "none") {
      return false;
    }
    if (result === "closed" && this.nextAfterDialogue) {
      const next = this.nextAfterDialogue;
      this.nextAfterDialogue = null;
      next();
    }
    return true;
  }

  private moveOverworld(direction: Direction): void {
    const delta = directionDelta(direction);
    const target = { x: this.overworldTurbo.x + delta.x, y: this.overworldTurbo.y + delta.y };
    const obstruction = worldBlockAt(target);
    if (obstruction) {
      if (obstruction === "water") this.hud.showNotice("The river is cold.");
      else if (obstruction === "edge") this.hud.showNotice("Can't go there.");
      return;
    }
    this.overworldTurbo = target;
    this.turbo.setPosition(tileCenter(target.x), tileCenter(target.y));
    const bridgeIndex = this.bridgeIndexAt(target);
    if (bridgeIndex !== -1) {
      if (bridgeIndex > this.progress.unlockedBridge) {
        this.hud.showNotice("Cross the previous bridge first.");
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
    this.drawBridge();
  }

  private moveBridge(direction: Direction): void {
    if (!this.run || this.dialogue.hasText) {
      return;
    }
    const result = this.run.move(direction);
    this.drawBridge();

    if (result.kind === "blocked") {
      return;
    }
    if (result.kind === "monster") {
      this.showEncounter("* A monster!");
      this.dialogue.say([{speaker:"turbo",text:"A monster!"},{speaker:"jury",text:`${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`}]);
      this.nextAfterDialogue = () => {
        this.mode = "bridge";
        this.encounterLayer.setVisible(false);
        this.drawBridge();
      };
      return;
    }
    if (result.kind === "gameOver") {
      this.showEncounter("* A monster!");
      this.dialogue.say({speaker:"jury",text:"No attempts left. Try again."});
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
      this.dialogue.say({speaker:"family",text:"You're home!"});
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
    // The visible forest border is solid, using the shared world footprint.
    for(let x=-1;x<31;x+=2) {
      this.prop(tileCenter(x),118+(x%3)*8,TextureKeys.tree);
      this.prop(tileCenter(x+1),644+(x%3)*6,TextureKeys.tree);
    }
    for(const tree of TREE_POINTS) this.prop(tileCenter(tree.x),tileCenter(tree.y)+16,TextureKeys.tree);
    for(const y of [180,360,540]) {
      this.prop(-4,y,TextureKeys.props,3,64,96);
      this.prop(964,y+40,TextureKeys.props,3,64,96);
    }
    for(const stone of STONE_POINTS) this.prop(tileCenter(stone.x),tileCenter(stone.y)+15,TextureKeys.props,0,40,40);
    for(const sign of SIGN_POINTS) this.prop(tileCenter(sign.x),tileCenter(sign.y)+16,TextureKeys.props,1,40,40);
    this.prop(tileCenter(CABIN_POINT.x),tileCenter(CABIN_POINT.y)+16,TextureKeys.cabin);
    this.prop(tileCenter(LANTERN_POINT.x),tileCenter(LANTERN_POINT.y)+16,TextureKeys.props,2,48,48);
    this.prop(tileCenter(FAMILY_POINT.x),tileCenter(FAMILY_POINT.y)+16,TextureKeys.actors,0,48,48);
    for(const point of JURY_POINTS) this.prop(tileCenter(point.x),tileCenter(point.y)+16,TextureKeys.actors,1,44,44);
    this.prop(tileCenter(MONSTER_POINT.x),tileCenter(MONSTER_POINT.y)+16,TextureKeys.actors,3,48,48);
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
      const terrain=row===0?TerrainFrames.start:row===bridge.height-1?TerrainFrames.goal:known?TerrainFrames.walked:TerrainFrames.darkBridge;
      this.terrain(x,y,terrain,tile,tile).setDepth(-80);
      if(this.run.oracle.isMonsterVisual(cell) || (this.revealMonsterPlaces && this.run.oracle.isMonsterAt(cell))) {
        this.boardLayer.add(this.add.image(x,y,TextureKeys.actors,isFinalBridge(bridge.id)?3:2).setDisplaySize(tile,tile));
      }
    }
    for(const row of [0,bridge.height-1]) for(let col=0;col<bridge.width;col++) {
      this.boardLayer.add(this.add.image(originX+(col+.5)*tile,(row+.5)*tile,TextureKeys.star).setDisplaySize(tile*(row===0?.34:.68),tile*(row===0?.34:.68)));
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
    for (const tree of TREE_POINTS) {
      data[tree.y][tree.x] = TileIds.tree;
    }
    for (const stone of STONE_POINTS) {
      data[stone.y][stone.x] = TileIds.stone;
    }
    for (const sign of SIGN_POINTS) {
      data[sign.y][sign.x] = TileIds.sign;
    }
    data[CABIN_POINT.y][CABIN_POINT.x] = TileIds.house;
    data[LANTERN_POINT.y][LANTERN_POINT.x] = TileIds.lantern;
    return data;
  }

  private bridgeIndexAt(point: MapPoint): number {
    return BRIDGE_ENTRIES.findIndex((entry) => (point.x === entry.x || point.x === entry.x + 1) && (point.y === entry.y || point.y === entry.y - 1));
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
      this.revealMonsterPlaces,
      this.dialogue.speaker
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
