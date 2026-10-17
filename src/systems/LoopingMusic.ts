import { audioPreferences } from './AudioPreferences';

const MUSIC_BASE_GAIN = 0.196 * 0.8;
type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class LoopingMusic {
  private readonly audio = new Audio(`${import.meta.env.BASE_URL}assets/audio/Alchemists_Sneak_Loop.ogg`);
  private started = false;
  private context?: AudioContext;
  private source?: MediaElementAudioSourceNode;
  private gain?: GainNode;
  private readonly unsubscribe: () => void;

  constructor() {
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.applyPreferences();
    this.unsubscribe = audioPreferences.subscribe(this.applyPreferences);
  }

  start(): void {
    this.started = true;
    this.audio.preload = 'auto';
    this.ensureAudioGraph();
    this.applyPreferences();
  }

  destroy(): void {
    this.unsubscribe();
    this.audio.pause();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
  }

  private readonly applyPreferences = (): void => {
    const { musicMuted, musicVolume } = audioPreferences.get();
    const volume = MUSIC_BASE_GAIN * musicVolume / 100;
    if (this.gain && this.context) {
      this.audio.volume = 1;
      this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.025);
    } else this.audio.volume = volume;
    if (this.started && !musicMuted && musicVolume > 0) {
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
      if (this.audio.paused) this.play();
    } else this.audio.pause();
  };

  private ensureAudioGraph(): void {
    if (this.context || this.gain) return;
    const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) return;

    let context: AudioContext;
    try { context = new AudioContextConstructor(); } catch { return; }
    let source: MediaElementAudioSourceNode | undefined;
    try {
      const gain = context.createGain();
      source = context.createMediaElementSource(this.audio);
      source.connect(gain);
      gain.connect(context.destination);
      this.context = context;
      this.source = source;
      this.gain = gain;
    } catch {
      if (source) {
        try {
          source.disconnect();
          source.connect(context.destination);
          this.context = context;
          this.source = source;
          return;
        } catch { /* Fall back to native media playback if the Web Audio route failed. */ }
      }
      if (context.state !== 'closed') void context.close().catch(() => undefined);
    }
  }

  private play(): void {
    void this.audio.play().catch(() => undefined);
  }
}
