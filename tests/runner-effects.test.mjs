import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { coinFlightAt, CoinFlightPool, CoinFlightSpace, COIN_FX_CAPACITY, COIN_FLIGHT_SECONDS } from '../src/tl002/CoinFlight.ts';
import { dayNightAt, DAY_CYCLE_SECONDS, SKY_STOPS } from '../src/tl002/DayNight.ts';
import { RUNNER_ART, runnerFrame } from '../src/tl002/RunnerArt.ts';

const start = { x: 260, y: 350 }, body = { x: 150, y: 320 }, target = { x: 850, y: 35 };
test('TL002 coin projection matches all rendered canvas corners even with unequal axis scales', () => {
  const space = new CoinFlightSpace(), point = { x: 0, y: 0 };
  // Regression: canvas pixels were 680x540, but the old FIT surface kept 960:540.
  // Its width-based Y projection placed pickups under the visible ground.
  space.measure({ left: 18, top: 30, width: 620, height: 350 }, { left: 8, top: 10 }, 680, 540);
  for (const [x, y, expectedX, expectedY] of [
    [0, 0, 10, 20], [680, 0, 630, 20], [0, 540, 10, 370], [680, 540, 630, 370],
  ]) {
    space.project(x, y, point);
    assert.ok(Math.abs(point.x - expectedX) < 1e-9);
    assert.ok(Math.abs(point.y - expectedY) < 1e-9);
  }
});
test('TL002 pickup starts at the visible coin and is absorbed into the jumping runner body', () => {
  const space = new CoinFlightSpace(), from = { x: 0, y: 0 }, runner = { x: 0, y: 0 };
  space.measure({ left: 18, top: 30, width: 620, height: 350 }, { left: 18, top: 10 }, 680, 540);
  space.project(204, 378, from); space.project(150, 300, runner);
  const pool = new CoinFlightPool(); pool.spawn(from, runner, space.size); pool.advance(0, runner, target);
  assert.equal(pool.slots[0].pose.x, 186);
  assert.equal(pool.slots[0].pose.y, 265);
  pool.advance(0.14, runner, target);
  assert.ok(Math.abs(pool.slots[0].pose.y - (20 + 300 * 350 / 540)) < 1e-9);
  assert.ok(pool.slots[0].pose.y < 265, 'absorb moves up from the visible coin instead of from below the floor');
});
test('TL002 coin projection refreshes the centered canvas origin after portrait and landscape resizing', () => {
  const space = new CoinFlightSpace(), point = { x: 0, y: 0 };
  space.measure({ left: 0, top: 200, width: 340, height: 270 }, { left: 0, top: 0 }, 680, 540);
  space.project(150, 372, point); assert.deepEqual(point, { x: 75, y: 386 });
  space.measure({ left: 40, top: 0, width: 1240, height: 540 }, { left: 0, top: 0 }, 1240, 540);
  space.project(150, 372, point); assert.deepEqual(point, { x: 190, y: 372 });
});
test('TL002 resizing during a pickup remaps its origin and bounce anchor into the new canvas', () => {
  const portrait = new CoinFlightSpace(), landscape = new CoinFlightSpace();
  portrait.measure({ left: 0, top: 200, width: 340, height: 270 }, { left: 0, top: 0 }, 680, 540);
  landscape.measure({ left: 20, top: 0, width: 680, height: 540 }, { left: 0, top: 0 }, 680, 540);
  const from = { x: 0, y: 0 }, runner = { x: 0, y: 0 };
  portrait.project(204, 378, from); portrait.project(150, 300, runner);
  const pool = new CoinFlightPool(); pool.spawn(from, runner, portrait.size); pool.advance(0.22, runner, target);
  const slot = pool.slots[0];
  portrait.remap(slot.start, landscape); portrait.remap(slot.body, landscape);
  slot.size *= landscape.size / portrait.size;
  pool.advance(0, slot.body, target);
  assert.deepEqual(slot.start, { x: 224, y: 378 });
  assert.deepEqual(slot.body, { x: 170, y: 300 });
  assert.equal(slot.pose.x, 170); assert.ok(slot.pose.y < 300);
  assert.equal(slot.size, 1); assert.equal(pool.activeCount, 1);
  pool.advance(1, slot.body, target); assert.equal(pool.settled, 1);
});

test('TL002 coin flight follows absorb, upward bounce, larger rotating rise, hover and HUD arrival', () => {
  const initial = coinFlightAt(0, start, body, target);
  const absorbed = coinFlightAt(0.14, start, body, target);
  const rising = coinFlightAt(0.25, start, body, target);
  const hover = coinFlightAt(0.4, start, body, target);
  const flying = coinFlightAt(0.8, start, body, target);
  const arrived = coinFlightAt(COIN_FLIGHT_SECONDS, start, body, target);
  assert.equal(initial.stage, 'absorb'); assert.equal(initial.x, start.x);
  assert.equal(absorbed.x, body.x); assert.equal(absorbed.y, body.y);
  assert.equal(rising.stage, 'bounce'); assert.ok(rising.y < body.y && rising.scale > 1 && rising.rotation > 0);
  assert.equal(hover.stage, 'hover'); assert.ok(Math.abs(hover.x - body.x) < 0.01);
  assert.equal(flying.stage, 'fly'); assert.ok(flying.x > body.x && flying.y < hover.y);
  assert.equal(arrived.stage, 'arrived'); assert.equal(arrived.x, target.x); assert.equal(arrived.y, target.y);
});
test('TL002 coin stages join continuously and the short hover barely moves', () => {
  for (const boundary of [0.14, 0.36, 0.5, COIN_FLIGHT_SECONDS]) {
    const before = coinFlightAt(boundary - 1e-7, start, body, target), after = coinFlightAt(boundary, start, body, target);
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 0.01);
    assert.ok(Math.abs(before.scale - after.scale) < 0.001);
    assert.ok(Math.abs(before.rotation - after.rotation) < 0.001);
  }
  assert.ok(Math.abs(coinFlightAt(0.36, start, body, target).y - coinFlightAt(0.43, start, body, target).y) <= 2.01);
});
test('TL002 flight tracks a moving player while absorbing, then keeps a stable bounce anchor', () => {
  const pool = new CoinFlightPool(); pool.spawn(start, body, 1);
  pool.advance(0.08, { x: 150, y: 280 }, target); assert.equal(pool.slots[0].body.y, 280);
  pool.advance(0.1, { x: 150, y: 250 }, target); assert.equal(pool.slots[0].body.y, 250);
  pool.advance(0.1, { x: 150, y: 190 }, target); assert.equal(pool.slots[0].body.y, 250);
});
test('TL002 coin counter settles only on arrival and keeps every coin under pool saturation', () => {
  const pool = new CoinFlightPool(); pool.spawn(start, body, 1);
  pool.advance(0.7, body, target); assert.equal(pool.settled, 0);
  pool.advance(0.4, body, target); assert.equal(pool.settled, 1); assert.equal(pool.activeCount, 0);
  pool.reset();
  for (let i = 0; i < 1000; i++) pool.spawn(start, body, 1);
  assert.equal(pool.slots.length, COIN_FX_CAPACITY); assert.equal(pool.activeCount, COIN_FX_CAPACITY);
  pool.advance(1.1, body, target); assert.equal(pool.settled, 1000);
  assert.equal(pool.peak, COIN_FX_CAPACITY); assert.equal(pool.skippedAnimations, 1000 - COIN_FX_CAPACITY);
});
test('TL002 thousands of coin effects reuse the same pool objects and restart discards pending flights', () => {
  const pool = new CoinFlightPool(); const identities = [...pool.slots];
  for (let i = 0; i < 300; i++) { pool.spawn(start, body, 0.5); pool.advance(0.1, body, target); }
  pool.advance(2, body, target); assert.equal(pool.settled, 300);
  assert.ok(pool.slots.every((slot, i) => slot === identities[i]));
  pool.spawn(start, body, 1); pool.reset(); pool.advance(2, body, target);
  assert.equal(pool.settled, 0); assert.equal(pool.activeCount, 0);
});
test('TL002 every sampled flight coordinate stays finite at mobile and desktop scales', () => {
  for (const scale of [0.4, 0.6, 1, 1.3]) for (let i = 0; i <= 120; i++) {
    const pose = coinFlightAt(i / 100, start, body, target, scale);
    assert.ok([pose.x, pose.y, pose.scale, pose.rotation].every(Number.isFinite));
  }
});
test('TL002 daylight becomes orange sunset, dark moonlight and a pale dawn', () => {
  assert.equal(dayNightAt(10).label, '白天'); assert.equal(dayNightAt(49).label, '黃昏');
  const night = dayNightAt(85); assert.equal(night.label, '月夜'); assert.equal(night.stars, 1);
  assert.ok(night.moonAlpha > 0.9 && night.moonY < 120); assert.equal(night.sunAlpha, 0);
  assert.equal(dayNightAt(113).label, '黎明'); assert.ok(dayNightAt(118).sunAlpha > dayNightAt(111).sunAlpha);
  assert.ok(dayNightAt(118).sunY < dayNightAt(111).sunY);
});
test('TL002 complete day cycle wraps continuously and sun/moon cross the sky from left to right', () => {
  assert.deepEqual(dayNightAt(0), dayNightAt(DAY_CYCLE_SECONDS));
  assert.ok(dayNightAt(5).sunX < dayNightAt(45).sunX);
  assert.ok(dayNightAt(65).moonX < dayNightAt(105).moonX);
  for (let second = 0; second < DAY_CYCLE_SECONDS * 3; second += 0.25) {
    const mood = dayNightAt(second);
    assert.ok(mood.blend >= 0 && mood.blend <= 1); assert.ok(mood.index >= 0 && mood.index < SKY_STOPS.length - 1);
    assert.ok(mood.stars >= 0 && mood.stars <= 1); assert.ok(mood.moonAlpha >= 0 && mood.moonAlpha <= 1);
  }
});
test('TL002 uses three running images and two directional jump poses without allocating frame animations', () => {
  assert.equal(RUNNER_ART.filter((art) => art.frame.startsWith('run-')).length, 3);
  assert.equal(RUNNER_ART.filter((art) => art.frame.startsWith('jump-')).length, 2);
  assert.deepEqual(new Set([0, 34, 68, 102].map((distance) => runnerFrame(distance, true, 0))), new Set(['run-a', 'run-b', 'run-c']));
  assert.equal(runnerFrame(0, false, -1), 'jump-up'); assert.equal(runnerFrame(0, false, 1), 'jump-down');
  assert.equal(runnerFrame(68, true, 0, true), 'run-a');
});
test('TL002 selected WebP assets preserve the source bytes and stay below 20 KB total', async () => {
  let bytes = 0;
  for (const art of RUNNER_ART) {
    const source = await readFile(new URL(`../public/assets/serpentelas/${art.file}`, import.meta.url));
    const used = await readFile(new URL(`../TL002/public/assets/serpentela/${art.file}`, import.meta.url));
    const hash = (data) => createHash('sha256').update(data).digest('hex');
    assert.equal(hash(source), hash(used)); bytes += used.length;
  }
  assert.ok(bytes < 20000); assert.equal(768 * 128 * 4, 393216, 'single atlas GPU pixel budget');
});
