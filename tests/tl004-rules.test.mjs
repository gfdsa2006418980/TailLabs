import test from 'node:test';
import assert from 'node:assert/strict';
import { launchFromPull, predictPath, previewDots } from '../src/tl004/rules/Launch.ts';
import { FixedStepper } from '../src/tl004/rules/FixedStepper.ts';
import { damageFrom, effectiveMass, impactStrength } from '../src/tl004/rules/Damage.ts';
import { ScoreBook, starsFor } from '../src/tl004/rules/Scoring.ts';
import { MATERIALS } from '../src/tl004/config/Materials.ts';
import { SCORE, STEP_MS, steps } from '../src/tl004/config/Tuning.ts';

test('pulling back-left launches up-right, capped at full power', () => {
  const half = launchFromPull(-50, 30, 100, 24);
  assert.ok(half.vx > 0 && half.vy < 0);
  assert.ok(Math.abs(half.power - Math.hypot(50, 30) / 100) < 1e-9);
  const over = launchFromPull(-300, 0, 100, 24);
  assert.equal(over.power, 1);
  assert.ok(Math.abs(over.vx - 24) < 1e-9);
  assert.deepEqual(launchFromPull(0, 0, 100, 24), { vx: 0, vy: 0, power: 0, pull: { x: 0, y: 0 } });
});

test('preview shows only the first part of the flight', () => {
  const path = predictPath({ x: 0, y: 0 }, 20, -12, 0.236, 0.004, 400);
  assert.ok(path.at(-1).y > 400);
  const dots = previewDots(path, 0.35, 3);
  assert.ok(dots.length > 0);
  assert.ok(dots.at(-1).x < path.at(-1).x * 0.4);
});

test('physics steps follow simulated time, not frame rate, and stop during hit-stop', () => {
  const sixty = new FixedStepper(STEP_MS, 4), thirty = new FixedStepper(STEP_MS, 4);
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a += sixty.advance(1000 / 60);
  for (let i = 0; i < 30; i++) b += thirty.advance(1000 / 30);
  assert.equal(a, 60);
  assert.equal(b, 60);
  assert.equal(new FixedStepper(STEP_MS, 4).advance(100, 0), 0);
  const slow = new FixedStepper(STEP_MS, 4);
  let c = 0;
  for (let i = 0; i < 60; i++) c += slow.advance(1000 / 60, 0.4);
  assert.equal(c, 24);
  assert.equal(new FixedStepper(STEP_MS, 4).advance(200), 4, 'a long frame is capped instead of spiralling');
});

test('impact strength uses the contact normal and treats static bodies as immovable', () => {
  const ground = { mass: Infinity, isStatic: true, velocity: { x: 0, y: 0 } };
  const plank = { mass: 6, isStatic: false, velocity: { x: 3, y: 7 } };
  assert.equal(effectiveMass(plank, ground), 6);
  assert.equal(effectiveMass({ ...plank, mass: 2 }, { ...plank, mass: 2 }), 1);
  assert.ok(Math.abs(impactStrength(plank, ground, { x: 0, y: 1 }) - 7 * Math.sqrt(6)) < 1e-9);
  assert.equal(damageFrom(MATERIALS.wood.threshold - 0.1, MATERIALS.wood), 0, 'resting contact never wears a block down');
  assert.ok(damageFrom(40, MATERIALS.wood) >= MATERIALS.wood.hp, 'a full-power hit breaks a plank');
});

test('chain bonus needs enough breaks inside the window of one shot', () => {
  const book = new ScoreBook();
  book.beginShot(100);
  for (let i = 0; i < SCORE.chainMinBreaks; i++) book.addBreak(500, 100 + i * 10);
  book.addBreak(500, 100 + steps(3) + 1);
  const bonus = book.endShot();
  assert.equal(bonus, Math.round(500 * SCORE.chainMinBreaks * SCORE.chainBonus));
  book.beginShot(1000);
  book.addBreak(500, 1001);
  assert.equal(book.endShot(), 0);
  assert.equal(starsFor(50000, false, { two: 1, three: 2 }), 0);
  assert.equal(starsFor(10, true, { two: 100, three: 200 }), 1);
  assert.equal(starsFor(150, true, { two: 100, three: 200 }), 2);
  assert.equal(starsFor(200, true, { two: 100, three: 200 }), 3);
});
