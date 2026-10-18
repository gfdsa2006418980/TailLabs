import test from 'node:test';
import assert from 'node:assert/strict';
import { canRescue, RescueSystem } from '../src/systems/RescueSystem.ts';
import { RoundSession } from '../src/systems/RoundSession.ts';
import { StickinessSystem } from '../src/systems/StickinessSystem.ts';

const area = { safeLeft: 120, safeRight: 400, platformY: 548 };
function piece(id, x = 130, y = 480) {
  const value = {
    id, frozen: false, grabbed: false,
    body: { position: { x, y }, velocity: { x: -1, y: 0 }, bounds: { min: { x: x - 20, y: y - 20 }, max: { x: x + 20, y: y + 20 } } },
    get bounds() { return this.body.bounds; },
    containsPoint(px, py, padding) { return Math.abs(px - this.body.position.x) <= 20 + padding && Math.abs(py - this.body.position.y) <= 20 + padding; },
    grab() { this.grabbed = true; },
    moveTo(px, py) {
      this.body.position = { x: px, y: py };
      this.body.bounds = { min: { x: px - 20, y: py - 20 }, max: { x: px + 20, y: py + 20 } };
    },
    releaseFromRescue() { this.grabbed = false; },
  };
  return value;
}

test('rescue selects outward-sliding or fallen pieces, leaving fresh drops and stable pieces alone', () => {
  const loose = piece(1);
  assert.equal(canRescue(loose, area), true);
  loose.body.velocity.x = 1;
  assert.equal(canRescue(loose, area), false);
  loose.moveTo(420, 480);
  assert.equal(canRescue(loose, area), true);
  loose.moveTo(260, 610);
  assert.equal(canRescue(loose, area), true);
  loose.moveTo(130, 180); loose.body.velocity.x = 0;
  assert.equal(canRescue(loose, area), false);
  loose.body.velocity.x = -1;
  assert.equal(canRescue(loose, area), true);
  loose.frozen = true;
  assert.equal(canRescue(loose, area), false);
});

test('hit testing prefers a direct hit over a nearby touch target and ignores safe pieces', () => {
  const rescue = new RescueSystem();
  const direct = piece(1, 130), nearby = piece(2, 96), safe = piece(3, 260);
  assert.equal(rescue.pick([nearby, direct, safe], 118, 480, area, 14), direct);
  assert.equal(rescue.pick([direct], 156, 480, area, 7), direct);
  assert.equal(rescue.pick([direct], 159, 480, area, 7), undefined);
  assert.equal(rescue.pick([safe], 260, 480, area, 14), undefined);
});

test('one pointer owns the grab and preserves the point where the piece was caught', () => {
  const rescue = new RescueSystem(), caught = piece(1), other = piece(2);
  assert.equal(rescue.begin(caught, 1, 125, 475), true);
  assert.equal(caught.grabbed, true);
  assert.equal(rescue.begin(other, 2, 130, 480), false);
  assert.equal(rescue.move(2, 300, 300), false);
  assert.equal(rescue.release(2), undefined);
  assert.equal(rescue.move(1, 250, 300), true);
  assert.deepEqual(caught.body.position, { x: 255, y: 305 });
  assert.equal(rescue.release(1), caught);
  assert.equal(caught.grabbed, false);
  assert.equal(rescue.active, undefined);
  assert.equal(rescue.release(1), undefined);
});

test('holding clears escape failure while time continues and never grants placement or extra drops', () => {
  const round = new RoundSession(1), caught = piece(1, 450);
  round.start(); round.recordDrop();
  round.update(16, [caught], 548, { ...area, fallLimit: 660 });
  round.update(700, [caught], 548, { ...area, fallLimit: 660 });
  caught.grabbed = true; round.resetEscapeTimer(caught.id);
  round.update(10000, [caught], 548, { ...area, fallLimit: 660 });
  assert.equal(round.state, 'playing'); assert.equal(round.warning, false);
  assert.equal(round.elapsedMilliseconds, 10716);
  assert.equal(round.placedCount, 0); assert.equal(round.maxHeight, 0);
  assert.equal(round.droppedCount, 1); assert.equal(round.remaining, 0);
  caught.grabbed = false; caught.moveTo(260, 480);
  round.update(16, [caught], 548, { ...area, fallLimit: 660 });
  assert.equal(round.state, 'playing');
  caught.frozen = true;
  round.update(16, [caught], 548, { ...area, fallLimit: 660 });
  assert.equal(round.state, 'completed'); assert.equal(round.placedCount, 1);
});

test('a quick catch/release resets the timer, but another escaping piece can still end the round', () => {
  const round = new RoundSession(2), caught = piece(1, 450), other = piece(2, 450);
  round.start(); round.recordDrop(); round.recordDrop();
  round.update(16, [caught], 548);
  round.update(700, [caught], 548);
  round.resetEscapeTimer(caught.id);
  round.update(100, [caught], 548);
  assert.equal(round.state, 'playing');
  caught.grabbed = true;
  round.update(16, [caught, other], 548);
  round.update(750, [caught, other], 548);
  assert.equal(round.state, 'failed');
});

test('rescue suspends settling and starts a fresh delay after the piece lands again', () => {
  let frozen = false;
  const target = { id: 1, speed: 0, angularSpeed: 0, damp() {}, freeze() { frozen = true; } };
  const sticky = new StickinessSystem(); sticky.setDelayMs(1500); sticky.addSupport(2); sticky.track(target);
  sticky.beginContact(1, 2, 0);
  sticky.update(1500, 16);
  sticky.suspend(1); sticky.update(10000, 16);
  assert.equal(frozen, false);
  sticky.resume(1); sticky.update(11000, 16);
  sticky.endContact(1, 2); sticky.update(14000, 16);
  sticky.beginContact(1, 2, 15000);
  sticky.update(16499, 16); assert.equal(frozen, false);
  sticky.update(16500, 16); assert.equal(frozen, false);
  sticky.update(16950, 16); assert.equal(frozen, true);
  assert.equal(sticky.frozenCount, 1);
});
