import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundSession } from '../src/systems/RoundSession.ts';
import { TowerCamera } from '../src/systems/TowerCamera.ts';
import { DrawQueue } from '../src/systems/DrawQueue.ts';
import { SerpentelaPicker } from '../src/systems/SerpentelaPicker.ts';
const piece = (id, x = 260, y = 500, frozen = false) => ({ id, frozen, bounds: { min: { x: x - 25, y: y - 25 }, max: { x: x + 25, y: y + 25 } } });

test('advertised next is promoted and exactly N pieces are drawn, including the final two', () => {
  let draws = 0;
  const queue = new DrawQueue(() => ++draws, 3);
  assert.deepEqual([queue.current, queue.next, draws], [1, 2, 2]);
  assert.equal(queue.consume(), 1);
  assert.deepEqual([queue.current, queue.next, draws], [2, 3, 3]);
  assert.equal(queue.consume(), 2);
  assert.deepEqual([queue.current, queue.next, draws], [3, undefined, 3]);
  assert.equal(queue.consume(), 3); assert.equal(queue.consume(), undefined);
  assert.equal(queue.remaining, 0); assert.equal(draws, 3);
});

test('weighted Current/Next sequence continues to exclude both recent identities', () => {
  const picker = new SerpentelaPicker([{ id: 'A', weight: 50 }, { id: 'B', weight: 20 }, { id: 'C', weight: 5 }, { id: 'D', weight: 1 }], () => .5);
  const queue = new DrawQueue(() => picker.next(), 500);
  const released = [];
  for (let n = 0; n < 500; n++) {
    const advertised = queue.next;
    const current = queue.consume();
    assert.ok(!released.slice(-2).includes(current.id));
    released.push(current.id);
    assert.equal(queue.current, advertised);
  }
});

test('the final drop waits until every body is frozen before awarding victory once', () => {
  const session = new RoundSession(2);
  assert.equal(session.recordDrop(), false); session.start();
  assert.equal(session.recordDrop(), true); assert.equal(session.recordDrop(), true); assert.equal(session.recordDrop(), false);
  const bodies = [piece(1, 250, 500, true), piece(2, 265, 450)];
  assert.equal(session.update(1000, bodies, 548), false); assert.equal(session.remaining, 0);
  assert.equal(session.state, 'playing'); assert.equal(session.placedCount, 1);
  bodies[1].frozen = true;
  assert.equal(session.update(500, bodies, 548), true); assert.equal(session.state, 'completed');
  const result = session.result();
  assert.equal(result.baseScore, 200); assert.equal(result.heightBonus, (548 - 425) * 2); assert.ok(result.speedBonus > 0);
  assert.equal(result.score, result.baseScore + result.heightBonus + result.speedBonus);
  assert.equal(session.update(1000, bodies, 548), false); assert.deepEqual(session.result(), result);
});

test('one escaped body fails the whole round after the grace period, including on the last drop', () => {
  const session = new RoundSession(1); session.start(); session.recordDrop();
  const escaped = piece(1, 460, 350);
  assert.equal(session.update(16, [escaped], 548), false);
  assert.equal(session.warning, true);
  assert.equal(session.update(749, [escaped], 548), false);
  assert.equal(session.update(1, [escaped], 548), true);
  assert.equal(session.state, 'failed'); assert.equal(session.result().speedBonus, 0);
});

test('a brief overhang is allowed and reentry cancels the pending failure timer', () => {
  const session = new RoundSession(3); session.start(); session.recordDrop();
  const body = piece(1, 410, 480); // Centre beyond platform but collider still overlaps.
  session.update(1000, [body], 548); assert.equal(session.warning, false);
  body.bounds = piece(1, 450, 480).bounds;
  session.update(500, [body], 548); session.update(500, [body], 548);
  body.bounds = piece(1, 380, 480).bounds; session.update(100, [body], 548);
  assert.equal(session.warning, false);
  body.bounds = piece(1, 450, 480).bounds;
  session.update(500, [body], 548); session.update(500, [body], 548);
  assert.equal(session.state, 'playing');
});

test('falling below the original platform fails even after the camera has risen far away', () => {
  const camera = new TowerCamera();
  for (let n = 0; n < 100; n++) camera.update(-2000, 1000 / 60);
  assert.ok(camera.offset < -2000);
  const session = new RoundSession(); session.start(); session.recordDrop();
  session.update(16, [piece(1, 260, 700)], 548);
  assert.equal(session.update(750, [piece(1, 260, 700)], 548), true);
  assert.equal(session.state, 'failed');
});

test('camera follows supported tower smoothly, never follows falling debris down, and resets', () => {
  const camera = new TowerCamera();
  assert.equal(camera.update(450, 16), 0);
  const first = camera.update(200, 16); assert.ok(first < 0 && first > -110);
  for (let n = 0; n < 300; n++) camera.update(200, 1000 / 60);
  assert.equal(camera.offset, -110);
  assert.equal(camera.update(500, 16), -110);
  assert.equal(camera.update(undefined, 16), -110);
  camera.reset(); assert.equal(camera.offset, 0);
});

test('camera tracking at 30, 60 and 120 fps converges without an abrupt teleport', () => {
  const offsets = [];
  for (const fps of [30, 60, 120]) {
    const camera = new TowerCamera(); let previous = 0;
    for (let n = 0; n < fps; n++) {
      const value = camera.update(-100, 1000 / fps);
      assert.ok(value <= previous && Math.abs(value - previous) < 50); previous = value;
    }
    offsets.push(camera.offset);
  }
  assert.ok(Math.max(...offsets) - Math.min(...offsets) < .001);
});
