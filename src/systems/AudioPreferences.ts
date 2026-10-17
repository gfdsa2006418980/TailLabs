export type AudioChannel = 'music' | 'effects';

export interface AudioPreferenceState {
  musicVolume: number;
  musicMuted: boolean;
  effectsVolume: number;
  effectsMuted: boolean;
}

const MUSIC_ENABLED_KEY = 'taillabs.tl001.music-enabled';
const MUSIC_VOLUME_KEY = 'taillabs.tl001.music-volume';
const EFFECTS_VOLUME_KEY = 'taillabs.tl001.effects-volume';
const EFFECTS_ENABLED_KEY = 'taillabs.tl001.effects-enabled';

function readNumber(key: string, fallback: number, max: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
  } catch { return fallback; }
}

function readEnabled(key: string, fallback: boolean): boolean {
  try { return localStorage.getItem(key) !== 'false' && fallback; } catch { return fallback; }
}

class AudioPreferences {
  private state: AudioPreferenceState = {
    musicVolume: readNumber(MUSIC_VOLUME_KEY, 100, 100),
    musicMuted: !readEnabled(MUSIC_ENABLED_KEY, true),
    effectsVolume: readNumber(EFFECTS_VOLUME_KEY, 200, 200),
    effectsMuted: !readEnabled(EFFECTS_ENABLED_KEY, true),
  };
  private readonly listeners = new Set<(state: AudioPreferenceState) => void>();

  get(): AudioPreferenceState { return { ...this.state }; }

  setVolume(channel: AudioChannel, volume: number): void {
    const max = channel === 'music' ? 100 : 200;
    const value = Math.round(Math.max(0, Math.min(max, Number.isFinite(volume) ? volume : max)));
    if (channel === 'music') this.state.musicVolume = value;
    else this.state.effectsVolume = value;
    this.persist(channel === 'music' ? MUSIC_VOLUME_KEY : EFFECTS_VOLUME_KEY, String(value));
    this.emit();
  }

  setMuted(channel: AudioChannel, muted: boolean): void {
    if (channel === 'music') this.state.musicMuted = muted;
    else this.state.effectsMuted = muted;
    this.persist(channel === 'music' ? MUSIC_ENABLED_KEY : EFFECTS_ENABLED_KEY, String(!muted));
    this.emit();
  }

  subscribe(listener: (state: AudioPreferenceState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* Preferences remain available for this page. */ }
  }

  private emit(): void {
    const state = this.get();
    for (const listener of this.listeners) listener(state);
  }
}

export const audioPreferences = new AudioPreferences();
