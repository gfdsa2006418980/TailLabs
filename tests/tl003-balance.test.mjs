// TL003 balance acceptance with an active-play bot (spends money, aims skills, picks cards).
// Targets: spec v0.4 §7 (first run ≈ 5 kills, 20–40 s) and §9 (DPS ×2.00/min, income ×1.85–1.95/min).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDS, firstRunStats, playRun, seedFor, treeWithLevels, dpsGrowth, incomeGrowth } from '../tools/tl003-balance.mjs';
import { compileTalents } from '../src/tl003/Talents.ts';
import * as B from '../src/tl003/Balance.ts';
import { DefenseRun } from '../src/tl003/Run.ts';
import { MERCENARIES } from '../src/tl003/Content.ts';

const median = values => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const runAt = (level, seeds, maxSeconds = 1200) =>
  Array.from({ length: seeds }, (_, i) => playRun({ seed: seedFor(i), effects: compileTalents(treeWithLevels(level)), maxSeconds }));

test('TL003 balance: an active first run with zero talents still kills only about five zombies', () => {
  for (const build of Object.keys(BUILDS)) {
    const s = firstRunStats(96, 'active', build);
    assert.equal(s.victories, 0, `${build}: first run must never win`);
    assert.ok(s.kills >= 4 && s.kills <= 8, `${build}: average kills ${s.kills}`);
    assert.ok(s.maxKills <= 12, `${build}: best first run killed ${s.maxKills}`);
    assert.ok(s.seconds >= 20 && s.seconds <= 45, `${build}: average survival ${s.seconds}s`);
  }
});

test('TL003 balance: the passive baseline is unchanged at about five kills', () => {
  const s = firstRunStats(64, 'passive');
  assert.ok(s.kills >= 4 && s.kills <= 6, `passive kills ${s.kills}`);
});

test('TL003 balance: in long runs panel DPS grows about ×2 and income about ×1.9 per minute', () => {
  const runs = [...runAt(10, 3), ...runAt(15, 3)];
  for (const r of runs) assert.ok(r.seconds >= 360, `long-run sample died at ${r.seconds}s`);
  const dps = median(runs.map(r => dpsGrowth(r.dps))), income = median(runs.map(r => incomeGrowth(r.earned)));
  assert.ok(dps >= 1.85 && dps <= 2.15, `DPS growth ×${dps}/min`);
  assert.ok(income >= 1.75 && income <= 2.0, `income growth ×${income}/min`);
});

test('TL003 balance: survival grows gradually with talents instead of jumping from 40 s to 20 min', () => {
  const at = level => median(runAt(level, 5).map(r => r.seconds));
  const t1 = at(1), t4 = at(4), t8 = at(8), t20 = at(20);
  assert.ok(t1 < 90, `Lv1 tree survives ${t1}s`);
  assert.ok(t4 >= 90 && t4 <= 420, `Lv4 tree survives ${t4}s`);
  assert.ok(t8 > t4 && t8 <= 1000, `Lv8 tree survives ${t8}s`);
  assert.ok(t20 >= 1200, `Lv20 tree should reach the 20-minute milestone, got ${t20}s`);
});

test('TL003 balance: structural guards keep income and the barricade from outscaling the horde', () => {
  // Per-kill reward × spawn frequency = total income target.
  assert.ok(Math.abs(B.KILL_REWARD_GROWTH_PER_MINUTE * B.SPAWN_GROWTH_PER_MINUTE - B.INCOME_GROWTH_PER_MINUTE) < 1e-9);
  // Barricade HP bought per money grows sub-linearly.
  assert.ok(Math.log(1 + B.FORTIFY_HEALTH_GAIN) / Math.log(B.FORTIFY_COST_GROWTH) < 1);
  // In the first run only the rifle is affordable: the cheapest recruit exceeds a typical first-run income.
  const best = Math.max(...firstRunStats(64, 'passive').runs.map(r => r.earned));
  assert.ok(Math.min(B.RECRUIT_FLAME_COST, B.RECRUIT_TESLA_COST) > best, `first-run income ${best}`);
});

test('TL003 balance: the opening rifle deploys with its skill charging; recruits arrive ready', () => {
  const run = new DefenseRun(7); run.start();
  assert.equal(run.mercenaries[0].cooldown, MERCENARIES.rifle.cooldown * B.SKILL_START_CHARGE);
  assert.equal(run.cast(0, 500, 220), B.SKILL_START_CHARGE === 0);
  run.money = 1e6; run.recruit('flame'); assert.equal(run.mercenaries[1].cooldown, 0);
});

test('TL003 balance: card bonuses add up instead of compounding', () => {
  const run = new DefenseRun(3); run.start();
  const interval = run.intervalFor('rifle'), wall = run.wallMaxHealth;
  for (let i = 0; i < 4; i++) { run.phase = 'choice'; run.choices = [{ id: 'speed', effect: 'speed' }]; run.choose('speed'); }
  for (let i = 0; i < 4; i++) { run.phase = 'choice'; run.choices = [{ id: 'wall', effect: 'wall' }]; run.choose('wall'); }
  assert.ok(Math.abs(run.intervalFor('rifle') - interval / 2.2) < 1e-9);
  assert.ok(Math.abs(run.wallMaxHealth - wall * 3) < 1e-9);
});
