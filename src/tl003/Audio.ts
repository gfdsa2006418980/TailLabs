/**
 * Synthesized TL003 sound effects: no audio files. One AudioContext, a master gain driven by the
 * volume bar, bounded voices and a per-cue minimum gap so late-game gunfire never stacks into noise.
 */
export type Cue =
  | 'rifle' | 'tesla' | 'flame' | 'laser' | 'grenade' | 'molotov' | 'kill' | 'wall'
  | 'buy' | 'levelUp' | 'pick' | 'bossWarning' | 'bossArrive' | 'bossDown' | 'gameOver' | 'victory' | 'coin' | 'ready' | 'type';

/** Minimum seconds between two plays of the same cue. */
const GAP: Record<Cue, number> = {
  rifle: 0.07, tesla: 0.08, flame: 0.14, laser: 0.2, grenade: 0.08, molotov: 0.1, kill: 0.05, wall: 0.4,
  buy: 0.04, levelUp: 0.3, pick: 0.1, bossWarning: 1.5, bossArrive: 1, bossDown: 1, gameOver: 1, victory: 1, coin: 0.035, ready: 0.2, type: 0.05,
};
/** Cues that are dropped first when many voices are already sounding. */
const AMBIENT = new Set<Cue>(['rifle', 'tesla', 'flame', 'kill', 'wall', 'coin']);
const MAX_VOICES = 18, AMBIENT_VOICE_LIMIT = 10;

export interface AudioPreferences { volume: number; muted: boolean }
export const AUDIO_KEY = 'taillabs.tl003.audio.v1';
export const DEFAULT_AUDIO: AudioPreferences = { volume: 70, muted: false };

export function loadAudioPreferences(storage?: Storage): AudioPreferences {
  try {
    const value = JSON.parse(storage?.getItem(AUDIO_KEY) ?? 'null') as Partial<AudioPreferences> | null;
    const volume = Number(value?.volume);
    return { volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : DEFAULT_AUDIO.volume, muted: value?.muted === true };
  } catch { return { ...DEFAULT_AUDIO }; }
}
export function saveAudioPreferences(preferences: AudioPreferences, storage?: Storage) {
  try { storage?.setItem(AUDIO_KEY, JSON.stringify(preferences)); } catch { /* Preferences are a convenience. */ }
}

function browserContext(): AudioContext | undefined {
  const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Constructor ? new Constructor() : undefined;
}

interface Voice { source: AudioScheduledSourceNode; nodes: AudioNode[] }

export class DefenseAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private noise?: AudioBuffer;
  private readonly voices = new Set<Voice>();
  private readonly last = new Map<Cue, number>();
  private paused = false;
  private volume: number;
  muted: boolean;

  constructor(preferences: AudioPreferences = DEFAULT_AUDIO, private readonly factory: () => AudioContext | undefined = browserContext) {
    this.volume = preferences.volume / 100; this.muted = preferences.muted;
  }

  /** Call from a user gesture (deploy, resume, first tap) to satisfy browser autoplay rules. */
  unlock() {
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.factory(); if (!this.context) return;
        this.output = this.context.createGain(); this.output.gain.value = this.gainValue();
        this.output.connect(this.context.destination);
        const length = Math.floor(this.context.sampleRate * 0.5);
        this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => undefined);
    } catch { /* Missing audio must never interrupt a run. */ }
  }

  /** 0–100 from the volume bar. */
  setVolume(volume: number) { this.volume = Math.min(1, Math.max(0, (Number.isFinite(volume) ? volume : 0) / 100)); this.applyGain(); }
  setMuted(muted: boolean) { this.muted = muted; if (muted) this.stopVoices(); this.applyGain(); }
  setPaused(paused: boolean) { if (paused && !this.paused) this.stopVoices(); this.paused = paused; }

  play(cue: Cue) {
    const c = this.context;
    if (!c || !this.output || this.muted || this.paused || this.volume <= 0 || c.state !== 'running') return;
    if (this.voices.size >= MAX_VOICES || (AMBIENT.has(cue) && this.voices.size >= AMBIENT_VOICE_LIMIT)) return;
    const now = c.currentTime;
    if (now - (this.last.get(cue) ?? -Infinity) < GAP[cue]) return;
    this.last.set(cue, now);
    const v = 0.85 + Math.random() * 0.3; // slight pitch variety keeps repeats from sounding mechanical
    switch (cue) {
      case 'rifle': this.burst(0.05, 2400 * v, 0.9, 0.11); this.tone('square', 420 * v, 140, 0.045, 0.025); break;
      case 'tesla': this.tone('square', 1500 * v, 700, 0.06, 0.03); this.burst(0.04, 5200, 3, 0.05); break;
      case 'flame': this.burst(0.18, 700 * v, 0.7, 0.06); break;
      case 'laser': this.tone('sawtooth', 1900, 260, 0.38, 0.07); this.tone('sine', 950, 480, 0.4, 0.06, 0.02); break;
      case 'grenade': this.burst(0.5, 380, 0.6, 0.3); this.tone('triangle', 150, 38, 0.45, 0.28); break;
      case 'molotov': this.burst(0.12, 3200, 1.2, 0.12); this.burst(0.6, 600, 0.6, 0.12, 0.08); break;
      case 'kill': this.tone('sine', 360 * v, 150, 0.09, 0.04); break;
      case 'wall': this.burst(0.12, 260, 0.8, 0.12); this.tone('triangle', 95, 55, 0.14, 0.1); break;
      case 'buy': this.tone('sine', 1050, 1500, 0.1, 0.05); this.tone('triangle', 1580, 1920, 0.08, 0.025, 0.04); break;
      case 'levelUp': [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.16, 0.06, i * 0.07)); break;
      case 'pick': this.tone('sine', 880, 1320, 0.12, 0.05); break;
      // Telegraph key: a short, quiet click per typed character of the story.
      case 'type': this.tone('square', 1150 * v, 1150 * v, 0.018, 0.012); break;
      case 'coin': this.tone('square', 1900 * v, 2500 * v, 0.045, 0.018); break;
      case 'ready': this.tone('triangle', 990, 1480, 0.09, 0.04); this.tone('sine', 1480, 1480, 0.12, 0.025, 0.06); break;
      case 'bossWarning': for (let i = 0; i < 3; i++) { this.tone('sawtooth', 440, 660, 0.18, 0.05, i * 0.36); this.tone('sawtooth', 660, 440, 0.16, 0.045, i * 0.36 + 0.18); } break;
      case 'bossArrive': this.tone('sawtooth', 120, 48, 0.9, 0.12); this.tone('square', 62, 40, 0.8, 0.07, 0.05); this.burst(0.7, 220, 0.5, 0.18); break;
      case 'bossDown': this.burst(0.7, 300, 0.5, 0.25); [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.06, 0.15 + i * 0.09)); break;
      case 'gameOver': this.tone('sine', 740, 560, 0.24, 0.05); this.tone('triangle', 520, 390, 0.3, 0.045, 0.16); this.tone('sine', 390, 290, 0.42, 0.05, 0.34); break;
      case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.06, i * 0.11)); break;
    }
  }

  private gainValue() { return this.muted ? 0 : this.volume; }
  private applyGain() { if (this.output && this.context) this.output.gain.setTargetAtTime(this.gainValue(), this.context.currentTime, 0.015); }

  private envelope(volume: number, start: number, seconds: number) {
    const gain = this.context!.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    gain.connect(this.output!);
    return gain;
  }
  private tone(type: OscillatorType, from: number, to: number, seconds: number, volume: number, delay = 0) {
    const c = this.context!, start = c.currentTime + delay, oscillator = c.createOscillator(), gain = this.envelope(volume, start, seconds);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    oscillator.connect(gain);
    this.track(oscillator, [oscillator, gain], start, seconds);
  }
  /** Band-passed white noise: gunshots, flames and explosions. */
  private burst(seconds: number, frequency: number, q: number, volume: number, delay = 0) {
    const c = this.context!, start = c.currentTime + delay, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = this.envelope(volume, start, seconds);
    source.buffer = this.noise!; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
    source.connect(filter); filter.connect(gain);
    this.track(source, [source, filter, gain], start, seconds);
  }
  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, seconds: number) {
    const voice = { source, nodes }; this.voices.add(voice);
    source.onended = () => { for (const node of nodes) node.disconnect(); this.voices.delete(voice); };
    source.start(start); source.stop(start + seconds + 0.02);
  }
  private stopVoices() {
    for (const { source, nodes } of this.voices) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      for (const node of nodes) node.disconnect();
    }
    this.voices.clear();
  }
}
