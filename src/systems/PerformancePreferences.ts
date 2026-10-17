export interface PerformanceProfile {
  powerSaving: boolean;
  mobile: boolean;
  frameRate: 30 | 60;
  canvasDeformation: boolean;
  maxDeformations: number;
  effectFrameMs: number;
  hudIntervalMs: number;
}

export const POWER_SAVING_KEY = 'taillabs.tl001.power-saving.v1';

export function createPerformanceProfile(powerSaving: boolean, mobile: boolean): PerformanceProfile {
  return {
    powerSaving, mobile,
    frameRate: powerSaving ? 30 : 60,
    canvasDeformation: !powerSaving && !mobile,
    maxDeformations: powerSaving || mobile ? 0 : 2,
    effectFrameMs: 1000 / 30,
    hudIntervalMs: powerSaving ? 250 : 80,
  };
}

function detectMobile(): boolean {
  return typeof window !== 'undefined' && (
    window.matchMedia?.('(pointer: coarse)').matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export class PerformancePreferences {
  private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>;
  readonly mobile: boolean;
  private enabled: boolean;
  private currentProfile: PerformanceProfile;
  private readonly listeners = new Set<() => void>();

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>, mobile = false) {
    this.storage = storage;
    this.mobile = mobile;
    let saved: string | null = null;
    try { saved = storage?.getItem(POWER_SAVING_KEY) ?? null; } catch { /* Use the device default. */ }
    this.enabled = saved === 'true' || (saved !== 'false' && mobile);
    this.currentProfile = createPerformanceProfile(this.enabled, mobile);
  }

  get powerSaving(): boolean { return this.enabled; }
  get profile(): PerformanceProfile { return this.currentProfile; }

  setPowerSaving(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.currentProfile = createPerformanceProfile(enabled, this.mobile);
    try { this.storage?.setItem(POWER_SAVING_KEY, String(enabled)); } catch { /* Session preference still applies. */ }
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

let storage: Storage | undefined;
try { storage = globalThis.localStorage; } catch { /* Private browsing can block storage. */ }
export const performancePreferences = new PerformancePreferences(storage, detectMobile());
