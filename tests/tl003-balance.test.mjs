// TL003 balance acceptance with an active-play bot (spends money, aims skills, picks cards, fortifies in the rests).
// v2 targets (2026-10-23 retrospective, set before tuning): a run of all 20 stages takes about a quarter of an hour;
// a zero-talent first run clears 2–4 stages; spending each run's points on the blueprint, the first full clear comes
// after about ten runs. These are real gates now, not todos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDS, firstRunStats, metaLoop, playRun, seedFor, treeWithLevels } from '../tools/tl003-balance.mjs';
import { compileTalents } from '../src/tl003/Talents.ts';
import * as B from '../src/tl003/Balance.ts';
import { DefenseRun, FIELD } from '../src/tl003/Run.ts';
import { CARDS, SKILLS } from '../src/tl003/Content.ts';

const median = values => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

test('TL003 balance: a zero-talent first run clears 2–4 stages and never wins', () => {
  for (const build of Object.keys(BUILDS)) {
    const runs = Array.from({ length: 6 }, (_, i) => playRun({ seed: seedFor(i), build }));
    const cleared = median(runs.map(r => r.clearedWave));
    assert.ok(runs.every(r => !r.victory), `${build}: a first run must never win`);
    assert.ok(cleared >= 2 && cleared <= 4, `${build}: median stages cleared ${cleared}`);
  }
});

// Since 2026-10-23 recruits come free from the level-up cards, so a passive player still fields a squad;
// what must hold is that never upgrading or casting loses early.
test('TL003 balance: the passive baseline (never buys or casts) still loses within a minute and a half', () => {
  const s = firstRunStats(64, 'passive');
  assert.ok(s.kills >= 4, `passive kills ${s.kills}`);
  assert.ok(s.medianSeconds <= 90, `passive median survival ${s.medianSeconds}s`);
});

test('TL003 balance: spending each run on the blueprint, the first full clear comes after about ten runs of about a quarter hour', () => {
  const first = [], minutes = [];
  for (const build of Object.keys(BUILDS)) {
    const history = metaLoop({ runs: 25, build });
    const win = history.findIndex(r => r.victory);
    first.push(win < 0 ? 99 : win + 1);
    if (win >= 0) minutes.push(history[win].seconds / 60);
    // Progress is gradual: no run jumps from the first boss straight to a full clear.
    assert.ok(history.slice(0, Math.max(0, win)).some(r => r.clearedWave >= B.BOSS_FIRST_STAGE), `${build}: stages ${history.map(r => r.victory ? 'W' : r.clearedWave).join(' ')}`);
  }
  const runs = median(first);
  assert.ok(runs >= 5 && runs <= 15, `first full clear on run ${first.join(' / ')}`);
  for (const m of minutes) assert.ok(m >= 10 && m <= 22, `a full clear took ${m.toFixed(1)} min`);
});

test('TL003 balance: structural guards keep income and the barricade from outscaling the horde', () => {
  // Per-kill reward × spawn frequency = total income target.
  assert.ok(Math.abs(B.KILL_REWARD_GROWTH_PER_MINUTE * B.SPAWN_GROWTH_PER_MINUTE - B.INCOME_GROWTH_PER_MINUTE) < 1e-9);
  // Barricade HP bought per money grows sub-linearly.
  assert.ok(Math.log(1 + B.FORTIFY_HEALTH_GAIN) / Math.log(B.FORTIFY_COST_GROWTH) < 1);
  // Each boss stage's boss outgrows the normal enemy curve, so beating one boss does not carry a run forever.
  assert.ok(B.BOSS_HP_PER_STAGE > 1);
  // The first upgrade is within reach of an opening minute's kills; recruits are free (cards).
  assert.ok(B.UPGRADE_BASE_COST * B.UPGRADE_COST_GROWTH <= 15);
  assert.equal(B.MAX_SQUAD, 3); assert.equal(B.MAX_SKILLS, 3);
});

test('TL003 balance: the opening grenade is ready at deployment and recharges in about ten seconds', () => {
  const run = new DefenseRun(7); run.start();
  assert.equal(run.skills[0].id, 'grenade'); assert.equal(run.skills[0].cooldown, 0);
  assert.equal(run.cast(0, 500, 220), true);
  assert.ok(SKILLS.grenade.cooldown <= 12, `grenade cooldown ${SKILLS.grenade.cooldown}s`);
  run.learn('molotov'); assert.equal(run.skills[1].cooldown, 0, 'a skill picked later arrives ready');
});

test('TL003 balance: boss stages 4, 7, … 19 and a super boss on 20; the boss is announced, then charges with an escort', () => {
  const bossStages = Array.from({ length: B.STAGE_COUNT }, (_, i) => i + 1).filter(B.isBossStage);
  assert.deepEqual(bossStages, [4, 7, 10, 13, 16, 19, 20]);
  const atStage = stage => {
    const run = new DefenseRun(11); run.start(); run.stage = stage; run.wallHealth = run.wallMaxHealth = 1e300;
    run.mercenaries[0].shotTimer = 1e9; // nobody shoots, so every spawn stays on the field
    return run;
  };
  const step = (run, until) => { while (run.stageTime + 1e-9 < until && run.phase === 'running') { run.mercenaries.forEach(m => { m.shotTimer = 1e9; }); run.advance(FIELD.step); } };
  const run = atStage(4), length = B.stageSeconds(4);
  step(run, length - B.BOSS_WARNING_SECONDS - 1);
  assert.equal(run.bossWarning, undefined); assert.equal(run.boss, undefined);
  step(run, length - 3);
  assert.ok(run.bossWarning > 2 && run.bossWarning <= 3 + 1e-6, `warning ${run.bossWarning}`);
  const before = run.enemies.filter(e => e.kind === 'runner').length;
  step(run, length + 0.05);
  const boss = run.boss; assert.ok(boss, 'boss spawned');
  assert.equal(run.enemies.filter(e => e.kind === 'boss').length, 1);
  assert.ok(run.enemies.filter(e => e.kind === 'runner').length >= before + B.BOSS_ESCORT);
  // The horde keeps coming until the boss is down.
  const count = run.enemies.length; step(run, length + 5); assert.ok(run.enemies.length > count);
  // The last stage's super boss: more HP and attack than a boss at the same moment.
  const last = atStage(20), plain = atStage(19);
  last.elapsed = plain.elapsed = 600; last.stageTime = B.stageSeconds(20) - 0.01; plain.stageTime = B.stageSeconds(19) - 0.01;
  last.advance(FIELD.step); plain.advance(FIELD.step);
  assert.ok(last.boss.superBoss && !plain.boss.superBoss);
  assert.ok(Math.abs(last.boss.maxHp / plain.boss.maxHp / (B.SUPER_BOSS_HP * B.BOSS_HP_PER_STAGE * B.ENEMY_HP_GROWTH_PER_MINUTE ** B.STAGE_PACE_MINUTES) - 1) < 0.01, 'one stage later on the curve, ×super');
  assert.ok(Math.abs(last.boss.attack / plain.boss.attack / (B.SUPER_BOSS_ATTACK * B.ENEMY_ATTACK_GROWTH_PER_MINUTE ** B.STAGE_PACE_MINUTES) - 1) < 0.01);
  assert.ok(last.enemies.filter(e => e.kind === 'runner').length >= B.SUPER_BOSS_ESCORT);
});

test('TL003 balance: boss strength ignores permanent player power', () => {
  const weak = new DefenseRun(5), strong = new DefenseRun(5, compileTalents(treeWithLevels(30)));
  for (const run of [weak, strong]) {
    run.start(); run.stage = 4; run.wallHealth = run.wallMaxHealth = 1e300; run.mercenaries[0].shotTimer = 1e9;
    while (!run.boss && run.phase === 'running') { run.mercenaries.forEach(m => { m.shotTimer = 1e9; }); run.advance(FIELD.step); }
  }
  assert.equal(weak.boss.maxHp, strong.boss.maxHp); assert.equal(weak.boss.attack, strong.boss.attack);
});

test('TL003 balance: speed cards add up; the wall card adds a share of the current maximum', () => {
  const run = new DefenseRun(3); run.start();
  const interval = run.intervalFor('rifle'), wall = run.wallMaxHealth;
  for (let i = 0; i < 4; i++) { run.phase = 'choice'; run.choices = [{ id: 'speed', effect: 'speed' }]; run.choose('speed'); }
  for (let i = 0; i < 4; i++) { run.phase = 'choice'; run.choices = [{ id: 'wall', effect: 'wall' }]; run.choose('wall'); }
  const speed = CARDS.find(c => c.id === 'speed').value, gain = CARDS.find(c => c.id === 'wall').value;
  assert.ok(Math.abs(run.intervalFor('rifle') - interval / (1 + 4 * speed)) < 1e-9);
  // 2026-10-23: the wall card counts on the current maximum (a share of the opening wall meant nothing late), so it compounds.
  assert.ok(Math.abs(run.wallMaxHealth - wall * (1 + gain) ** 4) < 1e-9);
});
