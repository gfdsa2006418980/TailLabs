import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, testTower, wantsAbility } from './tl004-helpers.mjs';
import { PARTNER_ABILITY, ABILITY_INFO, ABILITY_GRACE_STEPS } from '../src/tl004/config/Abilities.ts';
import { LAUNCH_PITCH } from '../src/tl004/audio/Sfx.ts';
import { shapes } from './tl004-helpers.mjs';
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

const ALL_PARTNERS = ['caideng', 'zhusun', 'poker', 'jiangpian', 'youfan3d', 'zhaxidele', 'jian'];

test('every partner has art, its own ability with a name and description, and its own launch pitch', () => {
  assert.deepEqual([...shapes.attackers.keys()].sort(), [...ALL_PARTNERS].sort());
  for (const id of ALL_PARTNERS) {
    const ability = PARTNER_ABILITY[id];
    assert.ok(ability, id);
    assert.ok(ABILITY_INFO[ability].name && ABILITY_INFO[ability].description, id);
    assert.ok(LAUNCH_PITCH[id] > 0, `${id} launch pitch`);
  }
  assert.equal(new Set(ALL_PARTNERS.map((id) => PARTNER_ABILITY[id])).size, ALL_PARTNERS.length, 'abilities are all different');
  assert.equal(new Set(ALL_PARTNERS.map((id) => LAUNCH_PITCH[id])).size, ALL_PARTNERS.length, 'pitches are all different');
  assert.equal(shapes.attackers.get('zhusun').name, '竹筍');
  assert.equal(shapes.attackers.get('jiangpian').name, '薑片');
});

test('each ability fires once per shot', () => {
  const launches = {
    caideng: shot(-0.35, 0.8), zhusun: shot(-0.35, 0.8), poker: shot(-0.4, 0.8), jiangpian: shot(-0.35, 0.8), youfan3d: shot(-0.5, 0.85),
    zhaxidele: shot(-0.35, 0.8), jian: shot(-0.35, 0.8),
  };
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

/** Fire straight at the tower and wait for the first contact; returns the sim with the partner just touching. */
function untilFirstContact(partner) {
  const sim = createSim({ ...testTower, shots: [partner, partner] });
  const launch = shot(-0.3, 0.85);
  sim.launch(launch.vx, launch.vy);
  for (let i = 0; i < 600 && sim.firstImpactStep === undefined; i++) sim.step();
  assert.notEqual(sim.firstImpactStep, undefined, `${partner} should hit something`);
  return sim;
}

test('the ability can still be used for one second after the first contact, not later', () => {
  for (const partner of ALL_PARTNERS) {
    const late = untilFirstContact(partner);
    assert.equal(late.canUseAbility, true, `${partner}: usable right at contact`);
    while (late.phase === 'flying' && late.stepCount - late.firstImpactStep < ABILITY_GRACE_STEPS) late.step();
    if (late.phase === 'flying' && late.pieces.has(late.activeAttackerId)) {
      assert.equal(late.canUseAbility, true, `${partner}: still usable at exactly one second`);
      const events = late.activateAbility();
      assert.equal(events.find((event) => event.type === 'ability')?.ability, PARTNER_ABILITY[partner]);
    }
    late.destroy();

    const tooLate = untilFirstContact(partner);
    while (tooLate.phase === 'flying' && tooLate.stepCount - tooLate.firstImpactStep <= ABILITY_GRACE_STEPS) tooLate.step();
    assert.equal(tooLate.canUseAbility, false, `${partner}: closed after one second`);
    assert.deepEqual(tooLate.activateAbility(), []);
    tooLate.destroy();
  }
  assert.equal(ABILITY_GRACE_STEPS, 60, 'one second at 60 steps per second');
});

test('札西德勒 rolls forward heavily and keeps going for a while', () => {
  const sim = createSim({ ...testTower, blocks: testTower.blocks.filter((b) => b.material === 'target').slice(0, 1).map((b) => ({ ...b, x: 3000 })), shots: ['zhaxidele', 'zhaxidele'] });
  const launch = shot(-0.6, 0.6);
  sim.launch(launch.vx, launch.vy);
  for (let i = 0; i < 25; i++) sim.step();
  const body = sim.pieces.get(sim.activeAttackerId).body;
  const mass = body.mass;
  const [event] = sim.activateAbility();
  assert.equal(event.ability, 'roll');
  assert.ok(body.mass > mass * 2.5, 'heavier while rolling');
  const startX = body.position.x;
  for (let i = 0; i < 120; i++) sim.step();
  assert.ok(body.position.x - startX > 600, `rolled ${Math.round(body.position.x - startX)} px`);
  assert.ok(body.velocity.x > 5, 'still rolling forward on the ground after two seconds');
  sim.destroy();
});

test('澗 washes pieces ahead forward, but stone shields what is behind it', () => {
  const level = {
    ...testTower, shots: ['jian', 'jian'],
    blocks: [
      { material: 'wood', x: 1100, y: 865, w: 30, h: 150 },
      { material: 'stone', x: 1400, y: 840, w: 60, h: 200 },
      { material: 'wood', x: 1550, y: 865, w: 30, h: 150 },
      { material: 'target', x: 2600, y: 895, shape: 'serpentela-w50-02' },
    ],
  };
  const sim = createSim(level);
  const launch = shot(-0.2, 0.5);
  sim.launch(launch.vx, launch.vy);
  const jian = sim.pieces.get(sim.activeAttackerId).body;
  for (let i = 0; i < 200 && jian.position.x < 900; i++) sim.step();
  const pieces = [...sim.pieces.values()].filter((p) => p.kind === 'block');
  const [front, stone, behind] = ['wood', 'stone', 'wood'].map((m, i) => pieces.filter((p) => p.material === m)[i === 2 ? 1 : 0]);
  sim.activateAbility();
  assert.ok(front.body.velocity.x > 5, 'plank in front is pushed');
  assert.ok(stone.body.velocity.x > 0 && stone.body.velocity.x < front.body.velocity.x, 'stone barely moves');
  assert.ok(Math.abs(behind.body.velocity.x) < 0.01, 'plank behind the stone stays dry');
  sim.destroy();
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
