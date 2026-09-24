import type { RetroAudio } from "../systems/retroAudio.ts";
import type { DialogueLine, Speaker } from "./types.ts";

export class DialogueModel {
  private queue: DialogueLine[] = [];
  speaker: Speaker = "turbo";
  private fullText = "";
  private visibleChars = 0;
  private carry = 0;
  private lastBlipChar = 0;
  private readonly charsPerSecond: number;

  constructor(charsPerSecond: number) {
    this.charsPerSecond = charsPerSecond;
  }

  get text(): string {
    return this.fullText.slice(0, this.visibleChars);
  }

  get hasText(): boolean {
    return this.fullText.length > 0;
  }

  get isRevealing(): boolean {
    return this.visibleChars < this.fullText.length;
  }

  get isFinished(): boolean {
    return !this.isRevealing && this.queue.length === 0;
  }

  say(text: string | DialogueLine | DialogueLine[], speaker: Speaker = "turbo"): void {
    this.queue = typeof text === "string" ? [{text,speaker}] : Array.isArray(text) ? [...text] : [text];
    this.loadNext();
  }

  clear(): void {
    this.queue = [];
    this.fullText = "";
    this.visibleChars = 0;
    this.carry = 0;
  }

  update(dt: number, audio: RetroAudio): void {
    if (!this.isRevealing) {
      return;
    }
    this.carry += dt * this.charsPerSecond;
    const advance = Math.floor(this.carry);
    if (advance <= 0) {
      return;
    }
    const previous = this.visibleChars;
    this.visibleChars = Math.min(this.fullText.length, this.visibleChars + advance);
    this.carry -= advance;
    for (let index = previous; index < this.visibleChars; index += 1) {
      const char = this.fullText[index] ?? "";
      if (char.trim() && index - this.lastBlipChar >= 2) {
        audio.textBlip();
        this.lastBlipChar = index;
      }
    }
  }

  confirm(): "advanced" | "closed" | "none" {
    if (this.isRevealing) {
      this.visibleChars = this.fullText.length;
      this.carry = 0;
      return "advanced";
    }
    if (this.queue.length > 0) {
      this.loadNext();
      return "advanced";
    }
    if (this.fullText) {
      this.fullText = "";
      this.visibleChars = 0;
      return "closed";
    }
    return "none";
  }

  private loadNext(): void {
    const line = this.queue.shift();
    this.fullText = line?.text ?? "";
    this.speaker = line?.speaker ?? "turbo";
    this.visibleChars = 0;
    this.carry = 0;
    this.lastBlipChar = 0;
  }
}
