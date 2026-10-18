export interface RunnerMusicTrack {
  loop: boolean;
  muted: boolean;
  volume: number;
  play(): Promise<void>;
  pause(): void;
}

/** Starts looping music once after the first gameplay countdown and keeps it running for the page lifetime. */
export class RunnerMusic {
  private readonly track: RunnerMusicTrack;
  private ready = false;
  private started = false;
  private disposed = false;

  constructor(track: RunnerMusicTrack, enabled: boolean, volume: number) {
    this.track = track;
    track.loop = true;
    track.volume = this.clamp(volume);
    track.muted = !enabled;
  }

  setVolume(volume: number): void { this.track.volume = this.clamp(volume); }

  setEnabled(enabled: boolean): void {
    this.track.muted = !enabled;
    this.playIfReady();
  }

  afterCountdown(): void {
    this.ready = true;
    this.playIfReady();
  }

  destroy(): void {
    this.disposed = true;
    this.track.pause();
  }

  private playIfReady(): void {
    if (!this.ready || this.started || this.disposed || this.track.muted) return;
    this.started = true;
    try { void this.track.play().catch(() => { this.started = false; }); } catch { this.started = false; /* Music must never block gameplay. */ }
  }

  private clamp(volume: number): number { return Math.max(0, Math.min(0.5, Number.isFinite(volume) ? volume : 0)); }
}
