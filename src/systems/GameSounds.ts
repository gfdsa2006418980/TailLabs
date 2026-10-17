import { audioPreferences } from './AudioPreferences';

type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };
const EFFECTS_LOUDNESS_MULTIPLIER = 2;

/** Small synthesized cues that need no downloaded sound assets. */
export class GameSounds {
  private context?: AudioContext;
  private output?: GainNode;
  private lastSettleAt = -Infinity;
  private readonly unsubscribe = audioPreferences.subscribe(() => this.updateOutputGain());

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

  playGameEnd(): void {
    this.tone('sine', 740, 560, 0.24, 0.04);
    this.tone('triangle', 520, 390, 0.3, 0.035, 0.16);
    this.tone('sine', 390, 290, 0.42, 0.04, 0.34);
  }

  playGameSuccess(): void {
    this.tone('triangle', 523, 659, 0.13, 0.04);
    this.tone('sine', 659, 784, 0.14, 0.043, 0.12);
    this.tone('triangle', 784, 1047, 0.2, 0.05, 0.25);
    this.tone('sine', 1047, 1319, 0.3, 0.028, 0.39);
  }

  playClick(): void {
    this.tone('triangle', 1050, 820, 0.045, 0.012);
  }

  destroy(): void {
    this.unsubscribe();
    const context = this.context;
    this.context = undefined;
    this.output = undefined;
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
    gain.connect(this.output ?? context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  private getContext(): AudioContext | undefined {
    if (this.context?.state === 'closed') this.context = undefined;
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
      if (!AudioContextConstructor) return undefined;
      try { this.context = new AudioContextConstructor(); } catch { return undefined; }
      this.output = this.context.createGain();
      this.output.connect(this.context.destination);
      this.updateOutputGain();
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return this.context;
  }

  private updateOutputGain(): void {
    if (!this.context || !this.output) return;
    const { effectsMuted, effectsVolume } = audioPreferences.get();
    const value = effectsMuted ? 0 : effectsVolume / 100 * EFFECTS_LOUDNESS_MULTIPLIER;
    this.output.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
  }
}
