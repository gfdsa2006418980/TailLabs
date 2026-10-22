import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, playShots, runUntilSettled, kit, testTower } from './tl004-helpers.mjs';
import { FixedStepper } from '../src/tl004/rules/FixedStepper.ts';
import { predictPath } from '../src/tl004/rules/Launch.ts';
import { SLING_REST } from '../src/tl004/sim/BattleSim.ts';
import { GRAVITY_PER_STEP, SERPENTELA, SHOT, SLING, STEP_MS, WORLD } from '../src/tl004/config/Tuning.ts';

const shot = (angle, power = 1) => ({ vx: Math.cos(angle) * SLING.maxLaunchSpeed * power, vy: Math.sin(angle) * SLING.maxLaunchSpeed * power });

test('the test tower starts settled, asleep and completely still', () => {
  const sim = createSim();
  assert.equal(sim.crystalsLeft, 3);
  assert.ok([...sim.pieces.values()].every((piece) => piece.body.isSleeping));
  const before = [...sim.pieces.values()].map((piece) => ({ ...piece.body.position }));
  const events = [];
  for (let i = 0; i < 600; i++) events.push(...sim.step());
  assert.deepEqual(events, []);
  [...sim.pieces.values()].forEach((piece, i) => assert.deepEqual(piece.body.position, before[i]));
  sim.destroy();
});

test('the aiming preview matches the real flight', () => {
  const sim = createSim();
  const launch = shot(-0.6, 0.8);
  const predicted = predictPath(SLING_REST, launch.vx, launch.vy, GRAVITY_PER_STEP, SERPENTELA.frictionAir, WORLD.groundY);
  const [event] = sim.launch(launch.vx, launch.vy);
  const body = sim.pieces.get(event.id).body;
  for (let i = 0; i < 40; i++) {
    sim.step();
    assert.ok(Math.hypot(body.position.x - predicted[i].x, body.position.y - predicted[i].y) < 1, `step ${i} drifted from the preview`);
  }
  sim.destroy();
});

test('a shot ends once everything settles, then the next serpentela is ready', () => {
  const sim = createSim();
  sim.launch(...Object.values(shot(-0.5)));
  assert.equal(sim.phase, 'flying');
  assert.equal(sim.canSkip, false);
  const events = runUntilSettled(sim);
  assert.equal(sim.phase, 'aiming');
  assert.equal(sim.shotIndex, 1);
  assert.ok(events.some((event) => event.type === 'impact'));
  assert.ok(events.some((event) => event.type === 'ready' && event.shot === 1));
  assert.ok(sim.shotSteps <= SHOT.forceNextSteps);
  sim.destroy();
});

test('"next" is only allowed after the skip delay', () => {
  const sim = createSim();
  sim.launch(...Object.values(shot(-0.5)));
  assert.deepEqual(sim.requestNext(), []);
  for (let i = 0; i < SHOT.skipAfterSteps; i++) sim.step();
  assert.equal(sim.canSkip, true);
  const events = sim.requestNext();
  assert.equal(events[0].type, 'shotEnd');
  assert.equal(sim.phase, 'aiming');
  sim.destroy();
});

test('the last shot cannot be skipped, so a slow collapse can still win', () => {
  const sim = createSim({ ...testTower, shots: ['serpentela-w50-01'] });
  sim.launch(...Object.values(shot(-0.5)));
  for (let i = 0; i < SHOT.skipAfterSteps + 5; i++) sim.step();
  assert.equal(sim.isLastShot, true);
  assert.equal(sim.canSkip, false);
  assert.deepEqual(sim.requestNext(), []);
  sim.destroy();
});

test('broken level data is rejected before building', () => {
  const broken = (block) => ({ ...testTower, blocks: [block] });
  assert.throws(() => createSim(broken({ material: 'wod', x: 0, y: 0, w: 10, h: 10 })), /unknown material/);
  assert.throws(() => createSim(broken({ material: 'wood', x: 0, y: 0 })), /needs w and h/);
  assert.throws(() => createSim(broken({ material: 'crystal', x: 0, y: 0, angle: 0.3 })), /cannot be rotated/);
  assert.throws(() => createSim({ ...testTower, shots: ['nobody'] }), /Unknown serpentela/);
});

test('missing every crystal with all serpentelas loses the level', () => {
  const sim = createSim();
  const events = playShots(sim, [shot(-1.45, 0.3), shot(-1.45, 0.3), shot(-1.45, 0.3), shot(-1.45, 0.3)]);
  assert.equal(sim.phase, 'lost');
  assert.equal(sim.stars, 0);
  assert.ok(events.some((event) => event.type === 'lost'));
  sim.destroy();
});

test('the same launches give the same result, whatever the frame rate', () => {
  const replay = [shot(-0.5), shot(-0.7, 0.95), shot(-0.35), shot(-0.9)];
  function run(frameMs, jitter) {
    const sim = createSim();
    const stepper = new FixedStepper(STEP_MS, 8);
    let next = 0, frame = 0;
    while (sim.phase !== 'won' && sim.phase !== 'lost' && frame < 20000) {
      const dt = jitter ? frameMs * (0.5 + ((frame * 7919) % 100) / 100) : frameMs;
      const count = stepper.advance(dt);
      for (let i = 0; i < count && sim.phase !== 'won' && sim.phase !== 'lost'; i++) {
        if (sim.phase === 'aiming' && next < replay.length) sim.launch(replay[next].vx, replay[next++].vy);
        sim.step();
      }
      frame++;
    }
    const result = { phase: sim.phase, score: sim.score.total, steps: sim.stepCount, positions: [...sim.pieces.values()].map((p) => [p.material ?? p.kind, p.body.position.x, p.body.position.y]) };
    sim.destroy();
    return result;
  }
  const sixty = run(1000 / 60, false);
  assert.deepEqual(run(1000 / 30, false), sixty);
  assert.deepEqual(run(1000 / 60, true), sixty);
});

test('no sleeping block is left hanging after a hit', () => {
  for (const angle of [-0.3, -0.4, -0.5, -0.6, -0.8, -1.0]) {
    const sim = createSim();
    sim.launch(...Object.values(shot(angle)));
    runUntilSettled(sim);
    const asleep = [...sim.pieces.values()].filter((piece) => piece.body.isSleeping).map((piece) => ({ piece, y: piece.body.position.y }));
    for (const piece of sim.pieces.values()) kit.Sleeping.set(piece.body, false);
    for (let i = 0; i < 120; i++) sim.step();
    for (const { piece, y } of asleep) {
      if (!sim.pieces.has(piece.id)) continue;
      assert.ok(piece.body.position.y - y < 12, `angle ${angle}: sleeping ${piece.material ?? piece.kind} dropped ${(piece.body.position.y - y).toFixed(1)} px when woken`);
    }
    sim.destroy();
  }
});

test('a simple aiming bot can clear the test tower', () => {
  const candidates = [];
  for (let angle = -0.15; angle >= -1.1; angle -= 0.05) for (const power of [0.85, 1]) candidates.push(shot(angle, power));
  const chosen = [];
  let best;
  for (let shotIndex = 0; shotIndex < 4; shotIndex++) {
    best = undefined;
    for (const candidate of candidates) {
      const sim = createSim();
      playShots(sim, [...chosen, candidate]);
      while (sim.phase === 'flying') sim.step();
      const value = (3 - sim.crystalsLeft) * 1e6 + sim.score.total;
      if (!best || value > best.value) best = { candidate, value, phase: sim.phase, crystals: sim.crystalsLeft };
      sim.destroy();
    }
    chosen.push(best.candidate);
    if (best.phase === 'won') break;
  }
  assert.equal(best.phase, 'won', `bot left ${best.crystals} crystal(s) after ${chosen.length} shots`);
});
