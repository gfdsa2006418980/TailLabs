type Cue = 'jump' | 'collision' | 'failure' | 'coin';
interface Voice { oscillator: OscillatorNode; gain: GainNode }
type ContextFactory = () => AudioContext | undefined;
const EFFECTS_LOUDNESS_MULTIPLIER = 1.3;
const EFFECTS_MAX_VOLUME_SCALE = 1.5;

function browserContext(): AudioContext | undefined {
  const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Constructor ? new Constructor() : undefined;
}

/** One context, short synthesized cues and bounded voices; background music is handled separately. */
export class RunnerAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private readonly voices = new Set<Voice>();
  private paused = false;
  private disposed = false;
  private lastCoin = -Infinity;
  private counts = { jump: 0, collision: 0, failure: 0, coin: 0 };
  private readonly factory: ContextFactory;
  muted = false;
  private volume = 0.7;

  constructor(factory: ContextFactory = browserContext) { this.factory = factory; }

  /** Called directly from start/resume input to satisfy browser audio policies. */
  unlock(): void {
    if (this.disposed) return;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.factory();
        if (!this.context) return;
        this.output = this.context.createGain();
        this.output.gain.value = this.muted ? 0 : this.volume;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch { /* Audio availability must not interrupt a run. */ }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopVoices();
    if (this.output && this.context) this.output.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.015);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(EFFECTS_MAX_VOLUME_SCALE, Math.max(0, Number.isFinite(volume) ? volume : 0)) * EFFECTS_LOUDNESS_MULTIPLIER;
    if (this.output && this.context && !this.muted) this.output.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.stopVoices();
  }

  jump(air = false): void {
    if (!this.canPlay('jump')) return;
    this.tone('triangle', air ? 470 : 310, air ? 900 : 680, 0.12, 0.065);
  }
  collision(): void {
    if (!this.canPlay('collision')) return;
    this.tone('square', 680, 110, 0.07, 0.17);
    this.tone('sawtooth', 240, 42, 0.22, 0.19);
    this.tone('triangle', 95, 28, 0.32, 0.23, 0.012);
  }
  failure(): void {
    if (!this.canPlay('failure')) return;
    // Match TL001's stacked-game failure cue; this plays when the result settles.
    this.tone('sine', 740, 560, 0.24, 0.04);
    this.tone('triangle', 520, 390, 0.3, 0.035, 0.16);
    this.tone('sine', 390, 290, 0.42, 0.04, 0.34);
  }
  coin(): void {
    if (!this.context || this.context.currentTime - this.lastCoin < 0.045 || !this.canPlay('coin')) return;
    this.lastCoin = this.context.currentTime;
    this.tone('sine', 1050, 1500, 0.11, 0.05);
    this.tone('triangle', 1580, 1920, 0.085, 0.022, 0.04);
  }

  private canPlay(cue: Cue): boolean {
    if (this.disposed || this.muted || this.paused || this.context?.state !== 'running' || this.voices.size > 10) return false;
    this.counts[cue]++;
    return true;
  }

  private tone(type: OscillatorType, from: number, to: number, seconds: number, volume: number, delay = 0): void {
    const context = this.context!;
    const oscillator = context.createOscillator(), gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain); gain.connect(this.output!);
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    oscillator.start(start); oscillator.stop(start + seconds + 0.01);
  }

  private stopVoices(): void {
    for (const { oscillator, gain } of this.voices) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* Already ended. */ }
      oscillator.disconnect(); gain.disconnect();
    }
    this.voices.clear();
  }

  snapshot() { return { ...this.counts, context: this.context?.state ?? 'locked', muted: this.muted, volume: this.volume, voices: this.voices.size }; }
  destroy(): void {
    this.disposed = true; this.stopVoices();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.context = undefined; this.output = undefined;
  }
}
