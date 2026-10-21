export interface RunnerMusicTrack {
  loop: boolean;
  muted: boolean;
  volume: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };
type ContextFactory = () => AudioContext | undefined;

function browserContext(): AudioContext | undefined {
  const Constructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
  return Constructor ? new Constructor() : undefined;
}

/** Prime playback during a user gesture, then expose the music after the countdown. */
export class RunnerMusic {
  private readonly track: RunnerMusicTrack;
  private readonly contextFactory: ContextFactory;
  private context?: AudioContext;
  private source?: MediaElementAudioSourceNode;
  private output?: GainNode;
  private ready = false;
  private enabled: boolean;
  private volume: number;
  private disposed = false;

  constructor(track: RunnerMusicTrack, enabled: boolean, volume: number, contextFactory: ContextFactory = browserContext) {
    this.track = track;
    this.contextFactory = contextFactory;
    this.enabled = enabled;
    this.volume = this.clamp(volume);
    track.loop = true;
    track.volume = this.volume;
    track.muted = !enabled;
  }

  /** Call directly from Start/Resume so Safari accepts both Web Audio and media playback. */
  unlock(): void {
    if (this.disposed || !this.enabled) return;
    this.ensureAudioGraph();
    this.resumeContext();
    this.applyOutput();
    this.playTrack();
  }

  setVolume(volume: number): void {
    this.volume = this.clamp(volume);
    this.applyOutput();
    if (this.ready && this.enabled && this.volume > 0) this.playIfReady();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyOutput();
    this.playIfReady();
  }

  afterCountdown(): void {
    this.ready = true;
    this.playIfReady();
  }

  destroy(): void {
    this.disposed = true;
    this.track.pause();
    this.source?.disconnect();
    this.output?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
  }

  private ensureAudioGraph(): void {
    if (this.context || this.output) return;
    let context: AudioContext | undefined;
    let source: MediaElementAudioSourceNode | undefined;
    let output: GainNode | undefined;
    try {
      context = this.contextFactory();
      if (!context) return;
      source = context.createMediaElementSource(this.track as HTMLAudioElement);
      output = context.createGain();
      source.connect(output); output.connect(context.destination);
      this.context = context; this.source = source; this.output = output;
      // iOS Safari does not reliably honor HTMLMediaElement.volume; use a Web Audio gain instead.
      this.track.volume = 1;
    } catch {
      if (context && source) {
        try {
          output?.disconnect(); source.disconnect(); source.connect(context.destination);
          this.context = context; this.source = source;
          return;
        } catch { /* Fall back to native playback if a direct media route is also unavailable. */ }
      }
      if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    }
  }

  private resumeContext(): void {
    if (this.context && this.context.state !== 'running' && this.context.state !== 'closed') {
      void this.context.resume().catch(() => undefined);
    }
  }

  private applyOutput(): void {
    const audible = this.ready && this.enabled;
    if (this.output && this.context) {
      this.track.muted = false;
      this.output.gain.setTargetAtTime(audible ? this.volume : 0, this.context.currentTime, 0.025);
    } else {
      // A muted pre-roll is the safe fallback when the browser has no Web Audio graph.
      this.track.muted = !audible;
      this.track.volume = this.volume;
    }
  }

  private playIfReady(): void {
    if (!this.ready || !this.enabled || this.disposed) return;
    this.ensureAudioGraph();
    this.resumeContext();
    this.applyOutput();
    this.playTrack();
  }

  private playTrack(): void {
    if (this.disposed || this.track.paused === false) return;
    try {
      void this.track.play().catch(() => undefined);
    } catch { /* Music must never block gameplay. */ }
  }

  private clamp(volume: number): number { return Math.max(0, Math.min(0.5, Number.isFinite(volume) ? volume : 0)); }
}
