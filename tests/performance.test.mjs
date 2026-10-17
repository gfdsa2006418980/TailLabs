import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayClock } from '../src/systems/PlayClock.ts';
import { PerformancePreferences, POWER_SAVING_KEY } from '../src/systems/PerformancePreferences.ts';
import { FramePacer, installFramePacer } from '../src/systems/FramePacer.ts';

test('30 and 60 FPS limits preserve refresh fractions at 60, 120 and 144 Hz', () => {
  for (const refresh of [60, 120, 144]) for (const fps of [30, 60]) {
    const pacer = new FramePacer();
    let count = 0;
    for (let frame = 0; frame < refresh * 5; frame++) {
      if (pacer.shouldRender(frame * 1000 / refresh, fps)) count++;
    }
    assert.ok(Math.abs(count - fps * 5) <= 1, refresh + ' Hz at ' + fps + ' FPS: ' + count);
  }
});

test('waking and changing frame rate render immediately without catching up missed frames', () => {
  const pacer = new FramePacer();
  assert.equal(pacer.shouldRender(0, 30), true);
  assert.equal(pacer.shouldRender(10, 30), false);
  assert.equal(pacer.shouldRender(60000, 30), true);
  assert.equal(pacer.shouldRender(60001, 30), false);
  assert.equal(pacer.shouldRender(60002, 60), true);
  pacer.reset();
  assert.equal(pacer.shouldRender(60003, 60), true);
});

test('the paced loop passes actual render timestamps and resets on wake', () => {
  const frames = [];
  let resets = 0;
  const loop = { fpsLimit: 30, step(time) { frames.push(time); }, stepLimitFPS() {}, resetDelta() { resets++; } };
  installFramePacer(loop);
  for (const time of [0, 16.67, 33.33, 50, 66.67]) loop.stepLimitFPS(time);
  assert.deepEqual(frames, [0, 33.33, 66.67]);
  loop.resetDelta(); loop.stepLimitFPS(67);
  assert.deepEqual(frames, [0, 33.33, 66.67, 67]); assert.equal(resets, 1);
});

test('render sleep does not discount waiting time or count a pause toward the score', () => {
  const clock = new PlayClock();
  clock.reset(100);
  clock.setRunning(true, 100);
  assert.equal(clock.consume(200), 100);
  assert.equal(clock.consume(30200), 30000);
  clock.setRunning(false, 30300);
  assert.equal(clock.consume(60300), 100);
  clock.setRunning(true, 70300);
  assert.equal(clock.consume(70400), 100);
  assert.equal(clock.consume(70400), 0);
});

test('a new round discards pending time from the previous round', () => {
  const clock = new PlayClock();
  clock.setRunning(true, 0);
  clock.setRunning(false, 1000);
  clock.reset(2000);
  clock.setRunning(true, 2000);
  assert.equal(clock.consume(2050), 50);
});

test('mobile saves power by default and a saved manual choice takes precedence', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const mobile = new PerformancePreferences(storage, true);
  assert.equal(mobile.profile.frameRate, 30);
  assert.equal(mobile.profile.canvasDeformation, false);
  mobile.setPowerSaving(false);
  assert.equal(data.get(POWER_SAVING_KEY), 'false');
  const reloaded = new PerformancePreferences(storage, true);
  assert.equal(reloaded.powerSaving, false);
  assert.equal(reloaded.profile.frameRate, 60);
  assert.equal(reloaded.profile.canvasDeformation, false);
  const desktop = new PerformancePreferences(undefined, false);
  assert.equal(desktop.profile.frameRate, 60);
  assert.equal(desktop.profile.maxDeformations, 2);
});

test('blocked storage still permits changing the setting and unsubscribing', () => {
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const prefs = new PerformancePreferences(storage, true);
  let changes = 0;
  const unsubscribe = prefs.subscribe(() => changes++);
  prefs.setPowerSaving(false);
  prefs.setPowerSaving(false);
  assert.equal(changes, 1);
  unsubscribe();
  prefs.setPowerSaving(true);
  assert.equal(changes, 1);
  assert.equal(prefs.powerSaving, true);
});
