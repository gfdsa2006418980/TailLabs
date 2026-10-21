// TL003 balance acceptance with an active-play bot (spends money, aims skills, picks cards).
// Targets: first run 2–3 min ending at the first boss rush (2026-10-22 decision, replaces spec v0.4 §7's
// 20–40 s), and §9 (DPS ×2.00/min, income ×1.85–1.95/min).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDS, firstRunStats, playRun, seedFor, treeWithLevels, dpsGrowth, incomeGrowth } from '../tools/tl003-balance.mjs';
import { compileTalents } from '../src/tl003/Talents.ts';
import * as B from '../src/tl003/Balance.ts';
import { DefenseRun, FIELD } from '../src/tl003/Run.ts';
import { MERCENARIES } from '../src/tl003/Content.ts';

const median = values => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const runAt = (level, seeds, maxSeconds = 1200) =>
  Array.from({ length: seeds }, (_, i) => playRun({ seed: seedFor(i), effects: compileTalents(treeWithLevels(level)), maxSeconds }));

test('TL003 balance: an active zero-talent first run lasts 2–3 minutes, keeps buying and falls to the first boss', () => {
  for (const build of Object.keys(BUILDS)) {
    const s = firstRunStats(48, 'active', build, 600);
    assert.equal(s.victories, 0, `${build}: first run must never win`);
    assert.ok(s.medianSeconds >= 120 && s.medianSeconds <= 180, `${build}: median survival ${s.medianSeconds}s`);
    assert.ok(s.seconds >= 120 && s.seconds <= 240, `${build}: average survival ${s.seconds}s`);
    assert.ok(s.purchases >= 15, `${build}: only ${s.purchases} purchases per first run`);
    assert.ok(s.firstBossLosses >= 0.6, `${build}: only ${s.firstBossLosses} of first runs end at the first boss rush`);
  }
});

test('TL003 balance: the passive baseline (never buys or casts) still loses within a minute', () => {
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

test('TL003 balance: survival grows gradually with talents instead of jumping from 2 min to 20 min', () => {
  const at = level => median(runAt(level, 5).map(r => r.seconds));
  const t1 = at(1), t4 = at(4), t8 = at(8), t20 = at(20);
  assert.ok(t1 <= 300, `Lv1 tree survives ${t1}s`);
  assert.ok(t4 >= 240 && t4 <= 720, `Lv4 tree survives ${t4}s`);
  assert.ok(t8 > t4 && t8 <= 1000, `Lv8 tree survives ${t8}s`);
  assert.ok(t20 >= 1200, `Lv20 tree should reach the 20-minute milestone, got ${t20}s`);
});

test('TL003 balance: structural guards keep income and the barricade from outscaling the horde', () => {
  // Per-kill reward × spawn frequency = total income target.
  assert.ok(Math.abs(B.KILL_REWARD_GROWTH_PER_MINUTE * B.SPAWN_GROWTH_PER_MINUTE - B.INCOME_GROWTH_PER_MINUTE) < 1e-9);
  // Barricade HP bought per money grows sub-linearly.
  assert.ok(Math.log(1 + B.FORTIFY_HEALTH_GAIN) / Math.log(B.FORTIFY_COST_GROWTH) < 1);
  // Each boss rush outgrows the normal enemy curve, so beating one boss does not carry a run forever.
  assert.ok(B.BOSS_RUSH_HP_GROWTH > 1);
  // The first upgrade and the first recruit are within reach of an opening minute's kills.
  assert.ok(B.UPGRADE_BASE_COST * B.UPGRADE_COST_GROWTH <= 15 && B.RECRUIT_FLAME_COST <= 20);
});

test('TL003 balance: the opening grenade is ready at deployment and recharges in about ten seconds', () => {
  const run = new DefenseRun(7); run.start();
  assert.equal(run.mercenaries[0].cooldown, 0);
  assert.equal(run.cast(0, 500, 220), true);
  assert.ok(MERCENARIES.rifle.cooldown <= 12, `grenade cooldown ${MERCENARIES.rifle.cooldown}s`);
  run.money = 1e6; run.recruit('flame'); assert.equal(run.mercenaries[1].cooldown, 0);
});

test('TL003 balance: a boss rush is announced, then charges with an escort on a fixed schedule', () => {
  const run = new DefenseRun(11); run.start(); run.wallHealth = run.wallMaxHealth = 1e300;
  run.mercenaries[0].shotTimer = 1e9; // nobody shoots, so every spawn stays on the field
  // Wave XP opens the card choice, which pauses the run; keep picking so time can reach the boss.
  const step = until => { while (run.elapsed + 1e-9 < until) { if (run.phase === 'choice') run.choose(run.choices[0].id); run.advance(FIELD.step); } };
  step(B.BOSS_FIRST_SECONDS - B.BOSS_WARNING_SECONDS - 1);
  assert.equal(run.bossWarning, undefined); assert.equal(run.boss, undefined);
  step(B.BOSS_FIRST_SECONDS - 5);
  assert.ok(run.bossWarning > 4 && run.bossWarning <= 5 + 1e-6, `warning ${run.bossWarning}`);
  const before = run.enemies.filter(e => e.kind === 'runner').length;
  step(B.BOSS_FIRST_SECONDS + 0.05);
  const first = run.boss; assert.ok(first, 'boss spawned');
  assert.equal(run.enemies.filter(e => e.kind === 'boss').length, 1);
  assert.ok(run.enemies.filter(e => e.kind === 'runner').length >= before + B.BOSS_ESCORT);
  assert.equal(run.nextBossAt, B.BOSS_FIRST_SECONDS + B.BOSS_INTERVAL_SECONDS);
  step(B.BOSS_FIRST_SECONDS + B.BOSS_INTERVAL_SECONDS + 0.05);
  const second = run.enemies.filter(e => e.kind === 'boss').at(-1);
  const expected = B.ENEMY_HP_GROWTH_PER_MINUTE ** (B.BOSS_INTERVAL_SECONDS / 60) * B.BOSS_RUSH_HP_GROWTH;
  assert.ok(Math.abs(second.maxHp / first.maxHp / expected - 1) < 0.01, `second boss ×${second.maxHp / first.maxHp}`);
});

test('TL003 balance: boss strength ignores permanent player power', () => {
  const weak = new DefenseRun(5), strong = new DefenseRun(5, compileTalents(treeWithLevels(30)));
  for (const run of [weak, strong]) { run.start(); run.wallHealth = 1e300; run.mercenaries[0].shotTimer = 1e9; while (!run.boss) { if (run.phase === 'choice') run.choose(run.choices[0].id); run.advance(FIELD.step); } }
  assert.equal(weak.boss.maxHp, strong.boss.maxHp); assert.equal(weak.boss.attack, strong.boss.attack);
});

test('TL003 balance: card bonuses add up instead of compounding', () => {
  const run = new DefenseRun(3); run.start();
  const interval = run.intervalFor('rifle'), wall = run.wallMaxHealth;
  for (let i = 0; i < 4; i++) { run.phase = 'choice'; run.choices = [{ id: 'speed', effect: 'speed' }]; run.choose('speed'); }
  for (let i = 0; i < 4; i++) { run.phase = 'choice'; run.choices = [{ id: 'wall', effect: 'wall' }]; run.choose('wall'); }
  assert.ok(Math.abs(run.intervalFor('rifle') - interval / 2.2) < 1e-9);
  assert.ok(Math.abs(run.wallMaxHealth - wall * 3) < 1e-9);
});
