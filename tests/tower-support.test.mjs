import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerSupportSystem } from '../src/systems/TowerSupportSystem.ts';
import { TowerCamera } from '../src/systems/TowerCamera.ts';

const piece = (id, top, frozen = false) => ({ id, frozen, grabbed: false, bounds: { min: { y: top } } });
const freeze = (tower, value) => { value.frozen = true; tower.onFreeze(value.id); };

test('a high side-pillar scrape and an isolated piece frozen to the wall do not raise the camera', () => {
  const tower = new TowerSupportSystem(), camera = new TowerCamera(), side = piece(1, 145);
  tower.addFloor(0); tower.track(side);
  tower.beginContact(1, 999, 'wall'); // Pillars are not floor supports.
  assert.equal(tower.top, undefined);
  freeze(tower, side);
  for (let frame = 0; frame < 120; frame++) camera.update(tower.top, 1000 / 60);
  assert.equal(tower.top, undefined); assert.equal(camera.offset, 0);
});

test('a moving piece that has touched the floor cannot pull the camera upward while bouncing', () => {
  const tower = new TowerSupportSystem(), base = piece(1, 500), bouncing = piece(2, 150);
  tower.addFloor(0); tower.track(base); tower.track(bouncing);
  tower.beginContact(1, 0, 'floor'); freeze(tower, base);
  tower.beginContact(2, 1, 'bounce');
  assert.equal(tower.top, 500);
  tower.endContact(2, 1, 'bounce'); freeze(tower, bouncing);
  assert.equal(tower.top, 500);
});

test('settled floor-connected tower height survives Matter retiring static collision pairs', () => {
  const tower = new TowerSupportSystem(), camera = new TowerCamera(); tower.addFloor(0);
  let previous = 0;
  for (const [index, top] of [500, 400, 250].entries()) {
    const value = piece(index + 1, top); tower.track(value);
    tower.beginContact(value.id, previous, 'a' + value.id);
    tower.beginContact(value.id, previous, 'b' + value.id); // Compound-body contacts.
    tower.endContact(value.id, previous, 'a' + value.id);
    freeze(tower, value); tower.endContact(value.id, previous, 'b' + value.id);
    previous = value.id;
  }
  assert.equal(tower.top, 250);
  for (let frame = 0; frame < 300; frame++) camera.update(tower.top, 1000 / 60);
  assert.equal(camera.offset, -60);
});

test('an isolated settled group becomes part of the tower when a settled bridge reaches it', () => {
  const tower = new TowerSupportSystem(); tower.addFloor(0);
  const base = piece(1, 500), bridge = piece(2, 400), high = piece(3, 300), tip = piece(4, 250);
  for (const value of [base, bridge, high, tip]) tower.track(value);
  tower.beginContact(0, 1, 'floor'); freeze(tower, base);
  tower.beginContact(3, 4, 'isolated'); freeze(tower, high); freeze(tower, tip);
  tower.endContact(3, 4, 'isolated'); assert.equal(tower.top, 500);
  tower.beginContact(1, 2, 'lower'); tower.beginContact(2, 3, 'upper');
  assert.equal(tower.top, 500);
  freeze(tower, bridge); assert.equal(tower.top, 250);
});

test('rescue detaches old contacts and a fresh landing restores support', () => {
  const tower = new TowerSupportSystem(); tower.addFloor(0);
  const value = piece(1, 200); tower.track(value); tower.beginContact(0, 1, 'old');
  value.grabbed = true; tower.detach(value.id);
  tower.beginContact(0, 1, 'held'); value.grabbed = false;
  freeze(tower, value); assert.equal(tower.top, undefined);
  tower.beginContact(0, 1, 'new'); assert.equal(tower.top, 200);
});

test('restarting clears the previous tower while preserving the physical floor', () => {
  const tower = new TowerSupportSystem(), old = piece(1, -100);
  tower.addFloor(0); tower.track(old); tower.beginContact(0, 1, 'old'); freeze(tower, old);
  assert.equal(tower.top, -100); tower.clear(); assert.equal(tower.top, undefined);
  const next = piece(2, 500); tower.track(next); freeze(tower, next);
  assert.equal(tower.top, undefined);
  tower.beginContact(0, 2, 'next'); assert.equal(tower.top, 500);
});

test('a 500-piece tower stays connected through all retired compound contacts', () => {
  const tower = new TowerSupportSystem(); tower.addFloor(0);
  for (let id = 1; id <= 500; id++) {
    const value = piece(id, 680 - id * 8); tower.track(value);
    tower.beginContact(id, id - 1, 'contact' + id); freeze(tower, value);
    tower.endContact(id, id - 1, 'contact' + id);
    assert.equal(tower.top, value.bounds.min.y);
  }
  assert.equal(tower.top, -3320);
});
