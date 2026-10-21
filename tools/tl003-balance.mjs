// TL003 balance harness: an active-play bot, panel DPS measurement and a meta-loop simulator.
// Used by tests/tl003-balance.test.mjs and runnable as `npm run balance:tl003`.
import { DefenseRun, FIELD } from '../src/tl003/Run.ts';
import { calculateValue, effectiveCooldown } from '../src/tl003/Combat.ts';
import { MERCENARIES, MERC_KINDS } from '../src/tl003/Content.ts';
import { compileTalents, isRevealed, talentCost, canBreakthrough, TALENTS } from '../src/tl003/Talents.ts';
import { emptyTree } from '../src/tl003/Meta.ts';

export const seedFor = i => Math.imul(i + 1, 2654435761) >>> 0;

/** Card preferences for a few common build directions. */
export const BUILDS = {
  kinetic: ['kinetic', 'speed', 'active', 'shock', 'bio', 'wall', 'income', 'haste', 'radius', 'burn', 'fire', 'repair'],
  fire: ['burn', 'fire', 'speed', 'shock', 'active', 'haste', 'radius', 'kinetic', 'wall', 'income', 'bio', 'repair'],
  economy: ['income', 'kinetic', 'speed', 'wall', 'active', 'shock', 'bio', 'haste', 'radius', 'burn', 'fire', 'repair'],
};

/**
 * Policies:
 *  passive — never spends and never casts (the original baseline).
 *  active  — reacts every 0.25 s: casts every ready skill at the enemy closest to the wall,
 *            repairs under 50 %, fills the squad, then buys the cheapest upgrade or fortify.
 */
export function playRun({ seed = 1, effects, policy = 'active', build = 'kinetic', maxSeconds = FIELD.victorySeconds, reaction = 15 } = {}) {
  const run = new DefenseRun(seed, effects); run.start();
  const prefs = BUILDS[build];
  const dps = [], earned = [];
  let purchases = 0, bossesKilled = 0;
  // One extra second so floating-point step drift never stops a run just short of the victory check.
  const limit = Math.round((maxSeconds + 1) / FIELD.step);
  for (let tick = 0; tick <= limit && run.elapsed < maxSeconds + 1e-6; tick++) {
    if (run.phase === 'choice') { run.choose(prefs.find(id => run.choices.some(c => c.id === id)) ?? run.choices[0].id); tick--; continue; }
    if (run.phase !== 'running') break;
    if (policy === 'active' && tick % reaction === 0) purchases += act(run);
    const minute = Math.floor(run.elapsed / 60);
    if (dps.length === minute) { dps.push(panelDps(run)); earned.push(run.totalEarnedMoney); }
    const boss = run.boss;
    run.advance(FIELD.step);
    if (boss && boss.hp <= 0) bossesKilled++;
  }
  return {
    seconds: run.elapsed, kills: run.kills, earned: run.totalEarnedMoney, score: run.score, victory: run.phase === 'victory',
    clearedWave: run.clearedWave, purchases, bossesKilled, squad: run.mercenaries.map(m => `${m.kind}${run.levels[m.kind]}`), cards: run.selectedCards.map(c => c.id), dps, earned,
  };
}

/** Auto-attack DPS of one mercenary kind at a given level (all copies). */
function kindDps(run, kind, level = run.levels[kind], copies = run.mercenaries.filter(m => m.kind === kind).length) {
  const saved = run.levels[kind]; run.levels[kind] = level;
  const def = MERCENARIES[kind], base = run.damageFor(kind), interval = run.intervalFor(kind);
  run.levels[kind] = saved;
  const value = kind === 'flame'
    ? calculateValue(base, ['Damage.Fire', 'Mechanic.DOT', 'Status.Burning', 'Skill.AutoAttack', `Mercenary.${kind}`], run.modifiers)
    : calculateValue(base, def.tags, run.modifiers) / interval;
  return value * copies;
}

/**
 * A strong economic player: every option is valued as added DPS per money; the best one is bought,
 * or saved for when it is not yet affordable. The barricade is repaired / fortified only when threatened.
 * Returns how many purchases it made.
 */
function act(run) {
  let bought = 0;
  const front = run.enemies.reduce((best, e) => (!best || e.x > best.x ? e : best), undefined);
  if (front && front.x > 0) run.mercenaries.forEach((m, slot) => { if (m.cooldown <= 0) run.cast(slot, Math.min(front.x, FIELD.wallX - 5), front.y); });
  for (let guard = 0; guard < 60; guard++) {
    const attackers = run.enemies.filter(e => e.x >= FIELD.wallX - 18).reduce((s, e) => s + e.attack, 0);
    const threatened = run.wallHealth < run.wallMaxHealth * 0.5 || (attackers > 0 && run.wallHealth < attackers * 8);
    if (threatened) {
      if (run.wallHealth < run.wallMaxHealth * 0.6 && run.repair()) { bought++; continue; }
      if (run.fortify()) { bought++; continue; }
    }
    const options = [];
    const owned = [...new Set(run.mercenaries.map(m => m.kind))];
    for (const kind of owned) {
      const gain = kindDps(run, kind, run.levels[kind] + 1) - kindDps(run, kind);
      options.push({ cost: run.upgradeCost(kind), value: gain, buy: () => run.upgrade(kind) });
    }
    if (run.mercenaries.length < 3) for (const kind of MERC_KINDS.filter(k => !owned.includes(k))) {
      const copies = run.mercenaries.filter(m => m.kind === kind).length;
      // A new kind also brings a new active skill; count it as +50% of its auto-attack value.
      const gain = (kindDps(run, kind, run.levels[kind], copies + 1) - kindDps(run, kind)) * (copies ? 1 : 1.5);
      options.push({ cost: run.recruitCost(kind), value: gain, buy: () => run.recruit(kind) });
    }
    const best = options.sort((a, b) => b.value / b.cost - a.value / a.cost)[0];
    if (!best || run.money < best.cost || !best.buy()) break;
    bought++;
  }
  return bought;
}

/** Single-target panel DPS against a zero-defense dummy: auto attacks plus skills averaged over their cooldown. */
export function panelDps(run) {
  let total = 0;
  for (const merc of run.mercenaries) {
    const def = MERCENARIES[merc.kind], base = run.damageFor(merc.kind);
    if (merc.kind === 'flame') total += calculateValue(base, ['Damage.Fire', 'Mechanic.DOT', 'Status.Burning', 'Skill.AutoAttack', `Mercenary.${merc.kind}`], run.modifiers);
    else total += calculateValue(base, def.tags, run.modifiers) / run.intervalFor(merc.kind);
    const cooldown = effectiveCooldown(def.cooldown, run.haste);
    if (merc.kind === 'rifle') total += calculateValue(base * 5, ['Damage.Kinetic', 'Mechanic.AOE', 'Mechanic.Explosion', 'Skill.Active', 'Mercenary.rifle'], run.modifiers) / cooldown;
    if (merc.kind === 'flame') total += calculateValue(base * 3, ['Damage.Fire', 'Mechanic.AOE', 'Mechanic.DOT', 'Skill.Active', 'Mercenary.flame'], run.modifiers) * 6 / cooldown;
    if (merc.kind === 'tesla') total += calculateValue(base * 9, ['Damage.Kinetic', 'Damage.Electric', 'Mechanic.Pierce', 'Skill.Active', 'Mercenary.tesla'], run.modifiers) / cooldown;
  }
  return total;
}

/** Geometric mean of minute-over-minute panel DPS growth, from `from` to the last full minute. */
export function dpsGrowth(dps, from = 1) {
  const last = dps.length - 1;
  if (last - from < 1) return NaN;
  return (dps[last] / dps[from]) ** (1 / (last - from));
}

/** Per-minute income growth: geometric mean of minute-over-minute earnings, from minute `from`. */
export function incomeGrowth(earned, from = 2) {
  const income = earned.slice(1).map((v, i) => v - earned[i]);
  const last = income.length - 1;
  if (last - from < 1 || income[from] <= 0) return NaN;
  return (income[last] / income[from]) ** (1 / (last - from));
}

const NODE_PRIORITY = ['mercenary_damage', 'kinetic_damage', 'barricade_health', 'economy_income', 'attack_speed', 'active_skill_damage', 'active_skill_haste', 'repair_efficiency', 'fire_dot'];
/** Spend all points: cheapest revealed node first, breakthrough whenever allowed. Mirrors a reasonable player. */
export function invest(tree, points) {
  tree = structuredClone(tree);
  for (let guard = 0; guard < 10000; guard++) {
    if (canBreakthrough(tree)) { tree.tier++; tree.maxNodeLevel += 10; continue; }
    const options = NODE_PRIORITY.filter(id => isRevealed(tree, id) && (tree.nodes[id] ?? 0) < tree.maxNodeLevel)
      .sort((a, b) => talentCost(tree.nodes[a] ?? 0) - talentCost(tree.nodes[b] ?? 0));
    const id = options[0]; if (!id) break;
    const cost = talentCost(tree.nodes[id] ?? 0); if (cost > points) break;
    points -= cost; tree.nodes[id] = (tree.nodes[id] ?? 0) + 1;
  }
  return { tree, points };
}

/** Play `runs` consecutive runs, investing the score after each one. */
export function metaLoop({ runs = 60, policy = 'active', build = 'kinetic', seedOffset = 0, stopOnVictory = true } = {}) {
  let tree = emptyTree(), points = 0, playSeconds = 0;
  const history = [];
  for (let i = 0; i < runs; i++) {
    const result = playRun({ seed: seedFor(i + seedOffset), effects: compileTalents(tree), policy, build });
    playSeconds += result.seconds; points += result.score;
    ({ tree, points } = invest(tree, points));
    history.push({ run: i + 1, ...result, talentLevels: Object.values(tree.nodes).reduce((s, v) => s + v, 0), tier: tree.tier, playMinutes: playSeconds / 60 });
    if (result.victory && stopOnVictory) break;
  }
  return history;
}

/** maxSeconds caps rare snowballing runs so the sample stays fast; capped runs count as that long. */
export function firstRunStats(count = 128, policy = 'active', build = 'kinetic', maxSeconds = FIELD.victorySeconds) {
  const runs = Array.from({ length: count }, (_, i) => playRun({ seed: seedFor(i), policy, build, maxSeconds }));
  const avg = key => runs.reduce((s, r) => s + r[key], 0) / runs.length;
  const sorted = runs.map(r => r.seconds).sort((a, b) => a - b);
  return { runs, kills: avg('kills'), seconds: avg('seconds'), medianSeconds: sorted[sorted.length >> 1], purchases: avg('purchases'),
    firstBossLosses: runs.filter(r => r.seconds >= 120 && r.bossesKilled === 0).length / runs.length, minKills: Math.min(...runs.map(r => r.kills)), maxKills: Math.max(...runs.map(r => r.kills)),
    minSeconds: Math.min(...runs.map(r => r.seconds)), maxSeconds: Math.max(...runs.map(r => r.seconds)), victories: runs.filter(r => r.victory).length };
}

/** A fixed mid-game talent tree, used to observe a long run's in-run growth curve. */
export function treeWithLevels(level) {
  const tree = emptyTree(); tree.maxNodeLevel = Math.max(10, Math.ceil(level / 10) * 10); tree.tier = tree.maxNodeLevel / 10;
  for (const node of TALENTS) tree.nodes[node.id] = level;
  return tree;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('tl003-balance.mjs')) {
  const f = n => n >= 1e5 ? n.toExponential(2) : n.toFixed(n < 100 ? 1 : 0);
  for (const policy of ['passive', 'active']) for (const build of policy === 'active' ? Object.keys(BUILDS) : ['kinetic']) {
    const s = firstRunStats(128, policy, build);
    console.log(`first run ${policy.padEnd(7)} ${build.padEnd(7)} kills avg ${s.kills.toFixed(2)} (${s.minKills}–${s.maxKills}) | ${s.seconds.toFixed(1)}s median ${s.medianSeconds.toFixed(1)}s (${s.minSeconds.toFixed(1)}–${s.maxSeconds.toFixed(1)}) | purchases ${s.purchases.toFixed(1)} | lost to first boss ${(100 * s.firstBossLosses).toFixed(0)}% | victories ${s.victories}`);
  }
  for (const level of [10, 20, 30, 40]) {
    const results = Array.from({ length: 16 }, (_, i) => playRun({ seed: seedFor(i), effects: compileTalents(treeWithLevels(level)) }));
    const growth = results.map(r => dpsGrowth(r.dps)).filter(Number.isFinite);
    const mean = growth.length ? growth.reduce((s, g) => s + g, 0) / growth.length : NaN;
    console.log(`all nodes Lv.${level}: survive ${f(results.reduce((s, r) => s + r.seconds, 0) / results.length)}s, panel DPS growth x${mean.toFixed(2)}/min (minute 1→end, n=${growth.length})`);
  }
  for (const build of Object.keys(BUILDS)) {
    const history = metaLoop({ runs: Number(process.env.RUNS ?? 80), build });
    console.log(`\nmeta loop (${build})`);
    for (const h of history) if (h.run <= 5 || h.run % 10 === 0 || h.victory || h === history.at(-1))
      console.log(`  run ${String(h.run).padStart(3)} ${f(h.seconds).padStart(6)}s kills ${String(h.kills).padStart(6)} +${h.score}pt talents Lv${h.talentLevels} T${h.tier} DPS x${dpsGrowth(h.dps).toFixed(2)} play ${h.playMinutes.toFixed(0)}min${h.victory ? ' VICTORY' : ''}`);
  }
}
