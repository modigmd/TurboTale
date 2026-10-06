import type { BridgeRun } from "../game/bridgeRun.ts";
import type { SavedProgress } from "../game/progress.ts";
import type { Speaker } from "../game/types.ts";
import { SNOWBOUND_ASSET_ROOT } from "../assets/manifest.ts";

const SPEAKERS: Record<Speaker, {name:string; image:string}> = {
  turbo: {name:"Turbo",image:"turbo-face.png"},
  jury: {name:"IMO Jury",image:"jury-face.png"},
  monster: {name:"Monster",image:"monster-face.png"},
  finalMonster: {name:"Monster",image:"final-monster-face.png"},
  family: {name:"Family",image:"family-face.png"}
};

export class DomHud {
  private root = document.getElementById("hud-root")!;
  private lastDialogue = "";
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(toggleReveal: () => void) {
    this.root.innerHTML = `
      <section class="start-overlay" data-start role="button" tabindex="0" aria-label="Begin TurboTale">
        <div class="title-card">
          <h1>Turbo<span>Tale</span></h1>
          <span class="title-star" aria-hidden="true">✦</span>
        </div>
      </section>
      <aside class="status-panel" hidden>
        <strong data-bridge>TurboTale</strong>
        <span data-status tabindex="0" role="button" aria-label="Attempt counter. Monster reveal is unavailable here.">NEXT BRIDGE 1</span>
        <span class="reveal-state" hidden>MONSTERS REVEALED</span>
      </aside>
      <p class="world-notice" role="status" hidden></p>
      <section class="dialogue-box" aria-live="polite" aria-atomic="true" hidden>
        <img class="speaker-face" src="${SNOWBOUND_ASSET_ROOT}turbo-face.png" alt="" />
        <div><strong class="speaker-name" data-speaker></strong><p data-dialogue></p></div>
        <span class="continue-cue" aria-hidden="true">◆</span>
      </section>
    `;
    this.root.querySelector<HTMLElement>("[data-status]")!.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      toggleReveal();
    });
  }

  hideStart(): void {
    this.root.querySelector<HTMLElement>("[data-start]")!.hidden = true;
    this.root.querySelector<HTMLElement>(".status-panel")!.hidden = false;
  }

  hideStatus(): void {
    this.root.querySelector<HTMLElement>(".status-panel")!.hidden = true;
  }

  showNotice(message: string): void {
    clearTimeout(this.noticeTimer);
    const notice=this.root.querySelector<HTMLElement>(".world-notice")!;
    notice.textContent=message;
    notice.hidden=false;
    this.noticeTimer=setTimeout(()=>{notice.hidden=true;},1200);
  }

  clearNotice(): void {
    clearTimeout(this.noticeTimer);
    this.root.querySelector<HTMLElement>(".world-notice")!.hidden=true;
  }

  update(run: BridgeRun | null, dialogue: string, dialogueReady: boolean, progress: SavedProgress, revealAvailable: boolean, monstersRevealed: boolean, speaker: Speaker): void {
    const person=SPEAKERS[speaker];
    const face=this.root.querySelector<HTMLImageElement>(".speaker-face")!;
    const image=SNOWBOUND_ASSET_ROOT+person.image;
    if(face.getAttribute("src")!==image) face.setAttribute("src",image);
    face.alt=person.name;
    this.root.querySelector("[data-speaker]")!.textContent=person.name;
    if (dialogue !== this.lastDialogue) {
      this.root.querySelector("[data-dialogue]")!.textContent = dialogue ? `* ${dialogue}` : "";
      this.lastDialogue = dialogue;
    }
    const box = this.root.querySelector<HTMLElement>(".dialogue-box")!;
    box.hidden = !dialogue;
    box.classList.toggle("is-finished", dialogueReady);
    this.root.classList.toggle("has-dialogue", Boolean(dialogue));
    this.root.querySelector("[data-bridge]")!.textContent = run ? run.bridge.title : "TurboTale";
    const status = this.root.querySelector<HTMLElement>("[data-status]")!;
    status.textContent = run ? `ATTEMPT ${Math.min(run.attempt, run.bridge.maxAttempts)} / ${run.bridge.maxAttempts}` : `NEXT BRIDGE ${progress.unlockedBridge + 1}`;
    status.setAttribute("aria-disabled", String(!revealAvailable));
    status.setAttribute("aria-label", `${status.textContent}. ${revealAvailable ? "Hold to toggle monster reveal." : "Monster reveal is unavailable here."}`);
    status.setAttribute("aria-pressed", String(monstersRevealed));
    this.root.querySelector<HTMLElement>(".reveal-state")!.hidden = !monstersRevealed;
  }
}
