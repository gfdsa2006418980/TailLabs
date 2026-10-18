import Phaser from 'phaser';
import { SERPENTELAS } from '../data/serpentelas';
import { loadRequiredAssets, type RequiredAsset } from '../systems/AssetReadiness';
import { t } from '../ui/i18n';

const assets: readonly RequiredAsset[] = [
  ...SERPENTELAS.map((definition) => ({
    key: definition.texture, type: 'image' as const,
    url: `${import.meta.env.BASE_URL}assets/serpentelas/${definition.file}`,
  })),
  { key: 'magic-circle', type: 'svg', url: `${import.meta.env.BASE_URL}assets/magic-circle.svg` },
];

/** Keep incomplete artwork out of GameScene, including on slow or unreliable connections. */
export class AssetScene extends Phaser.Scene {
  private readonly controller = new AbortController();
  private loading = false;

  constructor() { super('AssetScene'); }

  create(): void {
    this.load.maxParallelDownloads = 4;
    const retry = document.querySelector<HTMLButtonElement>('#asset-retry-button')!;
    const onRetry = () => { void this.prepare(); };
    retry.textContent = t('retryAssets');
    retry.addEventListener('click', onRetry);
    const dispose = () => {
      this.controller.abort();
      retry.removeEventListener('click', onRetry);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, dispose);
      this.events.off(Phaser.Scenes.Events.DESTROY, dispose);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
    this.events.once(Phaser.Scenes.Events.DESTROY, dispose);
    void this.prepare();
  }

  private async prepare(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    const overlay = document.querySelector<HTMLElement>('#asset-loading')!;
    const status = document.querySelector<HTMLElement>('#asset-loading-status')!;
    const retry = document.querySelector<HTMLButtonElement>('#asset-retry-button')!;
    overlay.hidden = false;
    overlay.setAttribute('aria-busy', 'true');
    retry.hidden = true;
    try {
      const missing = await loadRequiredAssets(assets, {
        exists: (key) => this.textures.exists(key),
        load: (pending, attempt, signal) => this.loadBatch(pending, attempt, signal),
      }, {
        signal: this.controller.signal,
        onAttempt: (attempt) => { status.textContent = t(attempt === 1 ? 'loadingAssets' : 'retryingAssets'); },
      });
      if (!missing.length) {
        overlay.hidden = true;
        this.scene.start('GameScene');
        return;
      }
      console.error('TL001 required artwork is missing:', missing.map((asset) => asset.key));
    } catch (error) {
      if (this.controller.signal.aborted) return;
      console.error('Unable to load TL001 artwork:', error);
    } finally {
      this.loading = false;
      overlay.removeAttribute('aria-busy');
    }
    status.textContent = t('assetLoadFailed');
    retry.hidden = false;
  }

  private loadBatch(pending: readonly RequiredAsset[], attempt: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const complete = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => {
        this.load.off(Phaser.Loader.Events.COMPLETE, complete);
        signal.removeEventListener('abort', abort);
      };
      this.load.once(Phaser.Loader.Events.COMPLETE, complete);
      signal.addEventListener('abort', abort, { once: true });
      try {
        for (const asset of pending) {
          const url = new URL(asset.url, location.href);
          // Successful images stay cached; retry failed responses with a fresh URL.
          if (attempt > 1) url.searchParams.set('tl001-retry', `${Date.now()}-${attempt}`);
          const xhrSettings: Phaser.Types.Loader.XHRSettingsObject = { timeout: 15000, responseType: asset.type === 'svg' ? 'text' : 'blob' };
          const config = { key: asset.key, url: url.href, xhrSettings };
          if (asset.type === 'svg') this.load.svg(config);
          else this.load.image(config);
        }
        this.load.start();
      } catch (error) { cleanup(); reject(error); }
    });
  }
}
