import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RUNNER_PREFERENCES, RUNNER_PREFERENCES_KEY, loadRunnerPreferences, saveRunnerPreferences,
} from '../src/tl002/RunnerPreferences.ts';
import { runnerText } from '../src/tl002/RunnerLocale.ts';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, value); },
  };
}

test('TL002 preferences default to Chinese, half-volume music, moderate effects and standard power use', () => {
  assert.deepEqual(loadRunnerPreferences(), DEFAULT_RUNNER_PREFERENCES);
  assert.deepEqual(loadRunnerPreferences(memoryStorage()), DEFAULT_RUNNER_PREFERENCES);
  assert.equal(DEFAULT_RUNNER_PREFERENCES.musicVolume, 17.5);
});

test('TL002 preferences persist all menu choices and clamp volume values on reload', () => {
  const storage = memoryStorage();
  const chosen = { language: 'ja', musicEnabled: false, musicVolume: 123,
    effectsEnabled: true, effectsVolume: 180, lowPower: true };
  saveRunnerPreferences(storage, chosen);
  assert.equal(storage.data.has(RUNNER_PREFERENCES_KEY), true);
  assert.deepEqual(loadRunnerPreferences(storage), { ...chosen, musicVolume: 50, effectsVolume: 150 });
  storage.setItem(RUNNER_PREFERENCES_KEY, JSON.stringify({ ...chosen, musicVolume: -9, effectsVolume: -9 }));
  assert.deepEqual(loadRunnerPreferences(storage), { ...chosen, musicVolume: 0, effectsVolume: 0 });
});

test('TL002 preferences recover malformed or unsupported saved values without breaking the menu', () => {
  const storage = memoryStorage({ [RUNNER_PREFERENCES_KEY]: '{broken' });
  assert.deepEqual(loadRunnerPreferences(storage), DEFAULT_RUNNER_PREFERENCES);
  storage.setItem(RUNNER_PREFERENCES_KEY, JSON.stringify({ language: 'fr', musicVolume: 'loud', lowPower: 'yes' }));
  assert.deepEqual(loadRunnerPreferences(storage), DEFAULT_RUNNER_PREFERENCES);
});

test('TL002 halves the previous saved music volume once while migrating settings', () => {
  const storage = memoryStorage({
    'taillabs.tl002.preferences.v1': JSON.stringify({ language: 'en', musicEnabled: true, musicVolume: 35,
      effectsEnabled: false, effectsVolume: 62, lowPower: true }),
  });
  assert.deepEqual(loadRunnerPreferences(storage), { language: 'en', musicEnabled: true, musicVolume: 17.5,
    effectsEnabled: false, effectsVolume: 62, lowPower: true });
  assert.equal(JSON.parse(storage.data.get(RUNNER_PREFERENCES_KEY)).musicVolume, 17.5);
  assert.equal(loadRunnerPreferences(storage).musicVolume, 17.5);
});

test('TL002 migrates older full-range audio settings before applying the new music and effects limits', () => {
  const storage = memoryStorage({
    'taillabs.tl002.preferences.v1': JSON.stringify({ language: 'en', musicEnabled: true, musicVolume: 100,
      effectsEnabled: true, effectsVolume: 100, lowPower: false }),
  });
  assert.deepEqual(loadRunnerPreferences(storage), { language: 'en', musicEnabled: true, musicVolume: 50,
    effectsEnabled: true, effectsVolume: 100, lowPower: false });
});

test('TL002 keeps the previous sound-off choice when upgrading to separate music/effects controls', () => {
  assert.equal(loadRunnerPreferences(memoryStorage({ 'taillabs.tl002.sound.v1': 'off' })).effectsEnabled, false);
  assert.equal(loadRunnerPreferences(memoryStorage({ 'taillabs.tl002.sound.v1': 'on' })).effectsEnabled, true);
});

test('TL002 menu and game labels are available in Traditional Chinese, English, and Japanese', () => {
  assert.equal(runnerText('zh-Hant', 'gateEarly'), '按太早了，蛇貂跌倒了');
  assert.equal(runnerText('zh-Hant', 'gateSafe'), '節奏門 · 可跳躍');
  assert.equal(runnerText('zh-Hant', 'programDevelopment'), '程式開發');
  assert.equal(runnerText('zh-Hant', 'developerName'), '浣熊拉芙');
  assert.equal(runnerText('en', 'developerName'), 'Raccoon Rafu');
  assert.equal(runnerText('ja', 'developerName'), 'ラフラフ');
  assert.equal(runnerText('zh-Hant', 'artName'), '阿樹');
  assert.equal(runnerText('en', 'artName'), '阿樹');
  assert.equal(runnerText('ja', 'artName'), '阿樹');
  assert.equal(runnerText('en', 'lowPower'), 'Low power mode');
  assert.equal(runnerText('ja', 'leaderboard'), 'ランキング');
  assert.equal(runnerText('en', 'credits'), 'Credits');
  assert.equal(runnerText('ja', 'credits'), 'クレジット');
  assert.equal(runnerText('ja', 'music'), '音楽');
  assert.equal(runnerText('en', 'gameSettings'), 'Settings');
});
