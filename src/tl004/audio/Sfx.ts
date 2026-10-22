import type { MaterialId } from '../config/Materials.ts';

type ImpactMaterial = MaterialId | 'ground' | 'attacker';

interface AudioSessionLike { type: string }

/**
 * Synthesised sound effects (no audio files). Each sound has a minimum repeat
 * interval and the total number of live voices is capped, so big collapses never clip.
 */
export class Sfx {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private readonly lastPlayed = new Map<string, number>();
  private voices = 0;
  muted = false;

  /** Call from a user gesture (iOS only starts audio inside one). */
  unlock(): void {
    const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
    if (session) {
      try { session.type = 'ambient'; } catch { /* Not supported: ignore. */ }
    }
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.context.destination);
      const length = this.context.sampleRate;
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    // iOS can leave the context "interrupted" (call, Siri, app switch), not just "suspended".
    if (this.context.state !== 'running') void this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.context.currentTime, 0.02);
  }

  private gate(key: string, minMs: number): boolean {
    if (!this.context || this.muted || this.voices >= 14) return false;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < minMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private voice(duration: number): { ctx: AudioContext; out: GainNode; t: number } {
    const ctx = this.context as AudioContext;
    const out = ctx.createGain();
    out.connect(this.master as GainNode);
    this.voices++;
    window.setTimeout(() => { this.voices--; out.disconnect(); }, (duration + 0.1) * 1000);
    return { ctx, out, t: ctx.currentTime };
  }

  private tone(frequency: number, endFrequency: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0): void {
    const { ctx, out, t } = this.voice(duration + delay);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t + delay);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + delay + duration);
    out.gain.setValueAtTime(0.0001, t + delay);
    out.gain.exponentialRampToValueAtTime(volume, t + delay + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + delay + duration);
    osc.connect(out);
    osc.start(t + delay);
    osc.stop(t + delay + duration + 0.02);
  }

  private burst(filterType: BiquadFilterType, frequency: number, q: number, duration: number, volume: number, delay = 0): void {
    const { ctx, out, t } = this.voice(duration + delay);
    const source = ctx.createBufferSource();
    source.buffer = this.noise as AudioBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    out.gain.setValueAtTime(0.0001, t + delay);
    out.gain.exponentialRampToValueAtTime(volume, t + delay + 0.005);
    out.gain.exponentialRampToValueAtTime(0.0001, t + delay + duration);
    source.connect(filter).connect(out);
    source.start(t + delay, Math.random() * 0.5);
    source.stop(t + delay + duration + 0.02);
  }

  /** Rising creak while pulling; pitch follows power. */
  stretch(power: number): void {
    if (!this.gate('stretch', 70)) return;
    this.tone(180 + power * 380, 200 + power * 400, 0.06, 0.05, 'triangle');
  }

  launch(power: number): void {
    if (!this.gate('launch', 120)) return;
    this.burst('bandpass', 900 + power * 700, 0.8, 0.28, 0.22);
    this.tone(520, 160, 0.18, 0.12, 'triangle');
  }

  impact(material: ImpactMaterial, strength: number): void {
    if (!this.gate(`impact-${material}`, 45)) return;
    const level = Math.min(1, strength / 45);
    if (material === 'stone') { this.tone(150, 70, 0.18, 0.25 * level + 0.05); this.burst('lowpass', 600, 0.7, 0.12, 0.18 * level); }
    else if (material === 'glass') this.tone(1800 + Math.random() * 500, 1500, 0.09, 0.08 * level + 0.03, 'triangle');
    else if (material === 'wood') { this.tone(260, 140, 0.1, 0.2 * level + 0.05, 'triangle'); this.burst('bandpass', 1200, 1.5, 0.06, 0.12 * level); }
    else if (material === 'target' || material === 'attacker') this.tone(420, 300, 0.09, 0.1 * level + 0.04, 'sine');
    else this.burst('lowpass', 400, 0.7, 0.14, 0.2 * level + 0.04);
  }

  /** A soft "boing" when a partner squashes. */
  squish(): void {
    if (!this.gate('squish', 140)) return;
    this.tone(300, 620, 0.16, 0.12, 'sine');
  }

  shatter(material: MaterialId): void {
    if (!this.gate(`break-${material}`, 50)) return;
    if (material === 'glass') { this.burst('highpass', 3500, 0.7, 0.35, 0.18); for (let i = 0; i < 3; i++) this.tone(2400 + i * 500, 2200, 0.12, 0.05, 'triangle', i * 0.04); }
    else if (material === 'stone') { this.burst('lowpass', 900, 0.6, 0.4, 0.3); this.tone(110, 50, 0.3, 0.2); }
    else if (material === 'wood') { this.burst('bandpass', 1500, 1.2, 0.22, 0.25); this.tone(220, 90, 0.16, 0.14, 'triangle'); }
  }

  /** A 四十塊 knocked out: cartoon "bonk" plus a rising slide-whistle as it flies off. */
  knockout(): void {
    if (!this.gate('knockout', 90)) return;
    this.tone(520, 260, 0.08, 0.2, 'square');
    this.tone(500, 1900, 0.55, 0.11, 'sine', 0.05);
    this.burst('bandpass', 2200, 1.2, 0.3, 0.08, 0.05);
  }

  star(index: number): void {
    this.gate(`star-${index}`, 0);
    if (!this.context || this.muted) return;
    const base = [784, 988, 1175][index] ?? 1175;
    this.tone(base, base, 0.35, 0.14, 'triangle');
    this.tone(base * 2, base * 2, 0.25, 0.05, 'sine', 0.03);
  }

  result(won: boolean): void {
    if (!this.context || this.muted) return;
    const notes = won ? [523, 659, 784, 1047] : [392, 349, 311];
    notes.forEach((f, i) => this.tone(f, f, 0.28, 0.12, 'triangle', i * 0.12));
  }

  tick(): void {
    if (!this.gate('tick', 40)) return;
    this.tone(1300, 1300, 0.03, 0.04, 'square');
  }
}
