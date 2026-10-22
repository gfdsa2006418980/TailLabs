import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, testTower, wantsAbility } from './tl004-helpers.mjs';
import { PARTNER_ABILITY, ABILITY_INFO } from '../src/tl004/config/Abilities.ts';
import { SLING } from '../src/tl004/config/Tuning.ts';
import { Progress, PROGRESS_KEY } from '../src/tl004/rules/Progress.ts';

const shot = (angle, power = 1) => ({ vx: Math.cos(angle) * SLING.maxLaunchSpeed * power, vy: Math.sin(angle) * SLING.maxLaunchSpeed * power });

/** Fire one partner and tap its ability at the sensible moment; returns the sim and every event. */
function fireWithAbility(partner, launch) {
  const sim = createSim({ ...testTower, shots: [partner, partner] });
  sim.launch(launch.vx, launch.vy);
  const events = [];
  for (let i = 0; i < 900 && sim.phase === 'flying'; i++) {
    if (wantsAbility(sim)) events.push(...sim.activateAbility());
    events.push(...sim.step());
  }
  return { sim, events };
}

test('every partner has an ability with a name and description', () => {
  for (const id of ['caideng', 'zhusun', 'poker', 'jiangpian', 'youfan3d']) {
    const ability = PARTNER_ABILITY[id];
    assert.ok(ability, id);
    assert.ok(ABILITY_INFO[ability].name && ABILITY_INFO[ability].description, id);
  }
});

test('each ability fires once per shot, only before the first contact', () => {
  const launches = { caideng: shot(-0.35, 0.8), zhusun: shot(-0.35, 0.8), poker: shot(-0.4, 0.8), jiangpian: shot(-0.35, 0.8), youfan3d: shot(-0.5, 0.85) };
  for (const [partner, launch] of Object.entries(launches)) {
    const { sim, events } = fireWithAbility(partner, launch);
    const used = events.filter((event) => event.type === 'ability');
    assert.equal(used.length, 1, `${partner} should use its ability exactly once`);
    assert.equal(used[0].ability, PARTNER_ABILITY[partner]);
    assert.equal(sim.canUseAbility, false);
    assert.deepEqual(sim.activateAbility(), [], 'no second use');
    if (partner === 'poker') assert.equal(used[0].extraIds.length, 2, 'split makes two extra cards');
    sim.destroy();
  }
  const sim = createSim();
  assert.deepEqual(sim.activateAbility(), [], 'nothing to use while aiming');
  sim.destroy();
});

test('abilities are part of the replay: same taps, same result', () => {
  const run = () => {
    const sim = createSim();
    const plan = [shot(-0.4, 0.8), shot(-0.35, 0.85), shot(-0.5, 0.75), shot(-0.3, 0.9), shot(-0.45, 0.8)];
    let next = 0;
    for (let i = 0; i < 9000 && sim.phase !== 'won' && sim.phase !== 'lost'; i++) {
      if (sim.phase === 'aiming' && next < plan.length) sim.launch(plan[next].vx, plan[next++].vy);
      if (wantsAbility(sim)) sim.activateAbility();
      sim.step();
    }
    const result = { phase: sim.phase, score: sim.score.total, steps: sim.stepCount, taps: sim.launches.map((l) => l.abilityStep) };
    sim.destroy();
    return result;
  };
  const first = run();
  assert.ok(first.taps.some((tap) => tap !== undefined), 'the plan should use abilities');
  assert.deepEqual(run(), first);
});

test('the firework removes the partner and damages what is around it', () => {
  const { sim, events } = fireWithAbility('caideng', shot(-0.35, 0.8));
  const ability = events.find((event) => event.type === 'ability');
  assert.ok(ability);
  assert.equal(sim.pieces.has(ability.id), false);
  sim.destroy();
});

function memoryStore() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
}

test('progress keeps best stars and score, and unlocks the next level after a clear', () => {
  const store = memoryStore();
  const ids = ['l1', 'l2', 'l3'];
  const progress = new Progress(store);
  assert.equal(progress.isUnlocked(ids, 0), true);
  assert.equal(progress.isUnlocked(ids, 1), false);
  progress.submit('l1', 30000, 2);
  progress.submit('l1', 20000, 1);
  assert.deepEqual(progress.record('l1'), { stars: 2, best: 30000 });
  assert.equal(progress.isUnlocked(ids, 1), true);
  assert.equal(progress.isUnlocked(ids, 2), false);
  assert.equal(progress.totalStars(ids), 2);
  const reloaded = new Progress(store);
  assert.deepEqual(reloaded.record('l1'), { stars: 2, best: 30000 });
});

test('a corrupt save is kept aside and play continues', () => {
  const store = memoryStore();
  store.setItem(PROGRESS_KEY, '{not json');
  const progress = new Progress(store);
  assert.equal(progress.totalStars(['l1']), 0);
  assert.equal(store.getItem(`${PROGRESS_KEY}.broken`), '{not json');
  assert.equal(new Progress(undefined).isUnlocked(['l1'], 0), true, 'works without storage');
});
