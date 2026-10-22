import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, isOver, levels, playReplay } from './tl004-helpers.mjs';
import { PARTNER_ABILITY } from '../src/tl004/config/Abilities.ts';

const targets = (level) => level.blocks.filter((block) => block.material === 'target').length;

test('there are 20 levels with unique ids and names', () => {
  assert.equal(levels.length, 20);
  assert.equal(new Set(levels.map((level) => level.id)).size, 20);
  assert.equal(new Set(levels.map((level) => level.name)).size, 20);
});

test('level 1 is still the approved wooden hut', () => {
  const [first] = levels;
  assert.equal(first.id, 'm1-wood-hut');
  assert.deepEqual(first.shots, ['caideng', 'zhusun', 'poker', 'jiangpian', 'youfan3d']);
  assert.deepEqual(first.stars, { two: 35000, three: 45000 });
  assert.equal(first.blocks.length, 9);
  assert.ok(first.blocks.every((block) => block.material === 'wood' || block.material === 'target'));
});

test('levels 2–6 each feature one partner, in the agreed order', () => {
  const featured = ['caideng', 'zhusun', 'poker', 'youfan3d', 'jiangpian'];
  featured.forEach((partner, i) => {
    const level = levels[i + 1];
    const count = level.shots.filter((id) => id === partner).length;
    assert.ok(count >= 3, `level ${i + 2} should mostly use ${partner}`);
    assert.ok(level.blocks.every((block) => block.material === 'wood' || block.material === 'target'), `level ${i + 2} is wood only`);
  });
});

test('level 10 is the first stone tower', () => {
  const tower = levels[9];
  assert.equal(tower.id, 'stone-front');
  assert.deepEqual(tower.blocks[0], { material: 'stone', x: 1950, y: 860, w: 100, h: 160 });
  assert.equal(targets(tower), 3);
});

test('later levels give fewer partners and hide more 四十塊', () => {
  levels.forEach((level, i) => {
    const n = i + 1;
    assert.ok(level.shots.every((id) => PARTNER_ABILITY[id]), `level ${n}: unknown partner`);
    if (n <= 15) assert.equal(level.shots.length, 5, `level ${n} shots`);
    else {
      assert.ok(level.shots.length >= 3 && level.shots.length <= 4, `level ${n} shots`);
      assert.ok(targets(level) >= 4 && targets(level) <= 5, `level ${n} 四十塊`);
    }
    if (n >= 7 && n <= 9) assert.ok(level.blocks.some((block) => block.material === 'glass'), `level ${n} uses glass`);
    if (n >= 11) assert.ok(level.blocks.some((block) => block.material === 'stone'), `level ${n} uses stone`);
    assert.ok(level.stars.two < level.stars.three, `level ${n} star thresholds`);
  });
  const both = new Set(levels.flatMap((level) => level.shots));
  assert.ok(both.has('zhaxidele') && both.has('jian'), 'the new partners appear in levels');
});

test('every level starts settled and completely still', () => {
  for (const [i, level] of levels.entries()) {
    const sim = createSim(level);
    assert.equal(sim.targetsLeft, targets(level), `level ${i + 1}: a 四十塊 fell out while settling`);
    const events = [];
    for (let s = 0; s < 300; s++) events.push(...sim.step());
    assert.deepEqual(events, [], `level ${i + 1} moved on its own`);
    assert.ok([...sim.pieces.values()].every((piece) => piece.body.isSleeping), `level ${i + 1} is not asleep`);
    sim.destroy();
  }
});

test('every level can be cleared: its stored solution still wins', () => {
  for (const [i, level] of levels.entries()) {
    assert.ok(level.solution?.length, `level ${i + 1} has no solution; run tools/tl004-balance.mjs`);
    const sim = createSim(level);
    playReplay(sim, level.solution);
    for (let s = 0; s < 3000 && !isOver(sim); s++) sim.step();
    assert.equal(sim.phase, 'won', `level ${i + 1} (${level.name}): the solution no longer wins, ${sim.targetsLeft} 四十塊 left`);
    assert.ok(sim.stars >= 1);
    sim.destroy();
  }
});
