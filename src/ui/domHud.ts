import type { BridgeRun } from "../game/bridgeRun.ts";
import type { SavedProgress } from "../game/progress.ts";

export class DomHud {
  private root = document.getElementById("hud-root")!;
  private lastDialogue = "";

  constructor(toggleReveal: () => void) {
    this.root.innerHTML = `
      <section class="start-overlay" data-start role="button" tabindex="0" aria-label="Begin TurboTale">
        <div class="title-card">
          <p class="title-eyebrow">A LITTLE JOURNEY THROUGH THE SNOW</p>
          <h1>Turbo<span>Tale</span></h1>
          <p class="title-story">Three rivers. Three bridges.<br>One very tired snail.</p>
          <span class="title-star" aria-hidden="true">✦</span>
        </div>
      </section>
      <aside class="status-panel" hidden>
        <strong data-bridge>TurboTale</strong>
        <span data-status tabindex="0" role="button" aria-label="Attempt counter. Hold to toggle monster reveal on final bridges.">NEXT BRIDGE 1</span>
        <span class="reveal-state" hidden>MONSTERS REVEALED</span>
      </aside>
      <section class="dialogue-box" aria-live="polite" aria-atomic="true" hidden>
        <img class="speaker-face" src="/assets/generated/snowbound/turbo-face.png" alt="" />
        <p data-dialogue></p>
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

  update(run: BridgeRun | null, dialogue: string, dialogueReady: boolean, progress: SavedProgress, revealAvailable: boolean, monstersRevealed: boolean): void {
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
    status.setAttribute("aria-pressed", String(monstersRevealed));
    this.root.querySelector<HTMLElement>(".reveal-state")!.hidden = !monstersRevealed;
  }
}
