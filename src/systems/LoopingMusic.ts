import { audioPreferences } from './AudioPreferences';

export class LoopingMusic {
  private readonly audio = new Audio(`${import.meta.env.BASE_URL}assets/audio/Alchemists_Sneak_Loop.ogg`);
  private started = false;
  private readonly unsubscribe: () => void;

  constructor() {
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.applyPreferences();
    this.unsubscribe = audioPreferences.subscribe(this.applyPreferences);
  }

  start(): void {
    this.started = true;
    this.applyPreferences();
  }

  destroy(): void {
    this.unsubscribe();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private readonly applyPreferences = (): void => {
    const { musicMuted, musicVolume } = audioPreferences.get();
    this.audio.volume = 0.196 * musicVolume / 100;
    if (this.started && !musicMuted && musicVolume > 0) {
      if (this.audio.paused) this.play();
    } else this.audio.pause();
  };

  private play(): void {
    void this.audio.play().catch(() => undefined);
  }
}
