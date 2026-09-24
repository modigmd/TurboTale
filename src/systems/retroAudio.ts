export class RetroAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private lastBlip = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  textBlip(): void {
    if (!this.enabled || !this.context) {
      return;
    }
    const now = this.context.currentTime;
    if (now - this.lastBlip < 0.035) {
      return;
    }
    this.lastBlip = now;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(390, now + 0.035);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.045);
  }

  monsterLaugh(): void {
    if (!this.enabled || !this.context) {
      return;
    }
    for (let i = 0; i < 5; i += 1) {
      const now = this.context.currentTime + i * 0.09;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(140 + i * 20, now);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.09);
    }
  }
}
