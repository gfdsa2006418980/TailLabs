export interface RequiredAsset {
  key: string;
  url: string;
  type: 'image' | 'svg';
}

export interface RequiredAssetLoader {
  exists(key: string): boolean;
  load(assets: readonly RequiredAsset[], attempt: number, signal: AbortSignal): Promise<void>;
}

interface AssetLoadOptions {
  signal: AbortSignal;
  onAttempt?: (attempt: number) => void;
  retryDelays?: readonly number[];
}

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Loader completion also includes failed files: validate each required texture. */
export async function loadRequiredAssets(
  assets: readonly RequiredAsset[], loader: RequiredAssetLoader,
  { signal, onAttempt, retryDelays = [700, 1600] }: AssetLoadOptions,
): Promise<readonly RequiredAsset[]> {
  signal.throwIfAborted();
  let missing = assets.filter((asset) => !loader.exists(asset.key));
  for (let attempt = 1; missing.length; attempt++) {
    signal.throwIfAborted();
    onAttempt?.(attempt);
    signal.throwIfAborted();
    await loader.load(missing, attempt, signal);
    signal.throwIfAborted();
    missing = assets.filter((asset) => !loader.exists(asset.key));
    if (!missing.length || attempt > retryDelays.length) break;
    await waitForRetry(retryDelays[attempt - 1], signal);
  }
  return missing;
}
