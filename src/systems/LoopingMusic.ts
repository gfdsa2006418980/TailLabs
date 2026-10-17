const STORAGE_KEY = 'taillabs.tl001.music-enabled';

export class LoopingMusic {
  private readonly audio = new Audio(`${import.meta.env.BASE_URL}assets/audio/Alchemists_Sneak_Loop.ogg`);
  private readonly storage?: Storage;
  private enabled = true;
  private started = false;

  constructor(private readonly button: HTMLButtonElement) {
    try {
      this.storage = localStorage;
      this.enabled = this.storage.getItem(STORAGE_KEY) !== 'false';
    } catch { /* Browser privacy settings may block storage. */ }
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = 0.28;
    this.render();
    this.button.addEventListener('click', this.toggle);
  }

  start(): void {
    this.started = true;
    if (this.enabled) this.play();
  }

  destroy(): void {
    this.button.removeEventListener('click', this.toggle);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private readonly toggle = (): void => {
    this.enabled = !this.enabled;
    try { this.storage?.setItem(STORAGE_KEY, String(this.enabled)); } catch { /* Preference remains available for this page. */ }
    this.render();
    if (this.enabled && this.started) this.play();
    else this.audio.pause();
  };

  private play(): void {
    void this.audio.play().catch(() => {
      this.button.title = '瀏覽器目前無法播放背景音樂';
    });
  }

  private render(): void {
    this.button.textContent = this.enabled ? '音樂開' : '音樂關';
    this.button.setAttribute('aria-pressed', String(this.enabled));
    this.button.setAttribute('aria-label', this.enabled ? '關閉背景音樂' : '開啟背景音樂');
    this.button.title = this.enabled ? '背景音樂已開啟' : '背景音樂已關閉';
  }
}
