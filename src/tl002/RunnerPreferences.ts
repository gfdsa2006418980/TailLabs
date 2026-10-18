export type RunnerLanguage = 'zh-Hant' | 'en' | 'ja';

export interface RunnerPreferences {
  language: RunnerLanguage;
  musicEnabled: boolean;
  musicVolume: number;
  effectsEnabled: boolean;
  effectsVolume: number;
  lowPower: boolean;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const RUNNER_PREFERENCES_KEY = 'taillabs.tl002.preferences.v2';
const PREVIOUS_PREFERENCES_KEY = 'taillabs.tl002.preferences.v1';
const LEGACY_SOUND_KEY = 'taillabs.tl002.sound.v1';

export const DEFAULT_RUNNER_PREFERENCES: RunnerPreferences = {
  language: 'zh-Hant', musicEnabled: true, musicVolume: 17.5,
  effectsEnabled: true, effectsVolume: 70, lowPower: false,
};

function clampVolume(value: unknown, fallback: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, Math.round(value * 2) / 2)) : fallback;
}

function normalize(value: unknown, musicMaximum = 50, effectsMaximum = 150): RunnerPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_RUNNER_PREFERENCES };
  const saved = value as Partial<RunnerPreferences>;
  return {
    language: saved.language === 'en' || saved.language === 'ja' || saved.language === 'zh-Hant'
      ? saved.language : DEFAULT_RUNNER_PREFERENCES.language,
    musicEnabled: typeof saved.musicEnabled === 'boolean' ? saved.musicEnabled : DEFAULT_RUNNER_PREFERENCES.musicEnabled,
    musicVolume: clampVolume(saved.musicVolume, DEFAULT_RUNNER_PREFERENCES.musicVolume, musicMaximum),
    effectsEnabled: typeof saved.effectsEnabled === 'boolean' ? saved.effectsEnabled : DEFAULT_RUNNER_PREFERENCES.effectsEnabled,
    effectsVolume: clampVolume(saved.effectsVolume, DEFAULT_RUNNER_PREFERENCES.effectsVolume, effectsMaximum),
    lowPower: typeof saved.lowPower === 'boolean' ? saved.lowPower : DEFAULT_RUNNER_PREFERENCES.lowPower,
  };
}

export function loadRunnerPreferences(storage?: PreferenceStorage): RunnerPreferences {
  if (!storage) return { ...DEFAULT_RUNNER_PREFERENCES };
  try {
    const raw = storage.getItem(RUNNER_PREFERENCES_KEY);
    if (raw !== null) return normalize(JSON.parse(raw));
    const previous = storage.getItem(PREVIOUS_PREFERENCES_KEY);
    if (previous !== null) {
      const migrated = normalize(JSON.parse(previous), 100, 100);
      migrated.musicVolume = clampVolume(migrated.musicVolume / 2, DEFAULT_RUNNER_PREFERENCES.musicVolume, 50);
      saveRunnerPreferences(storage, migrated);
      return migrated;
    }
    const legacySound = storage.getItem(LEGACY_SOUND_KEY);
    return { ...DEFAULT_RUNNER_PREFERENCES, effectsEnabled: legacySound !== 'off' };
  } catch {
    return { ...DEFAULT_RUNNER_PREFERENCES };
  }
}

export function saveRunnerPreferences(storage: PreferenceStorage | undefined, preferences: RunnerPreferences): void {
  try { storage?.setItem(RUNNER_PREFERENCES_KEY, JSON.stringify(normalize(preferences))); }
  catch { /* Preferences are optional when storage is unavailable. */ }
}
