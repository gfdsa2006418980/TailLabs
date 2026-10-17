type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Small synthesized cues that need no downloaded sound assets. */
export class GameSounds {
  private context?: AudioContext;
  private lastSettleAt = -Infinity;

  playDrop(): void {
    this.tone('triangle', 250, 115, 0.16, 0.06875);
  }

  playSettle(): void {
    const now = performance.now();
    if (now - this.lastSettleAt < 140) return;
    this.lastSettleAt = now;
    this.tone('sine', 560, 820, 0.2, 0.0475);
    this.tone('sine', 820, 1050, 0.19, 0.03, 0.045);
  }

  destroy(): void {
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const context = this.getContext();
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  private getContext(): AudioContext | undefined {
    if (this.context?.state === 'closed') this.context = undefined;
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
      if (!AudioContextConstructor) return undefined;
      try { this.context = new AudioContextConstructor(); } catch { return undefined; }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return this.context;
  }
}
