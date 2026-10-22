// TL003 balance harness: an active-play bot, panel DPS measurement and a meta-loop simulator.
// Used by tests/tl003-balance.test.mjs and runnable as `npm run balance:tl003`.
import { DefenseRun, FIELD } from '../src/tl003/Run.ts';
import { calculateValue, effectiveCooldown, withFamily } from '../src/tl003/Combat.ts';
import { MERCENARIES, SKILLS } from '../src/tl003/Content.ts';
import { compileTalents, isRevealed, talentCost, canBreakthrough, TALENTS } from '../src/tl003/Talents.ts';
import { emptyTree } from '../src/tl003/Meta.ts';

/** The nine nodes of the first star map (still present with the same ids). */
export const LEGACY_NODES = ['mercenary_damage', 'kinetic_damage', 'barricade_health', 'economy_income', 'fire_dot', 'repair_efficiency', 'attack_speed', 'active_skill_damage', 'active_skill_haste'];
export const seedFor = i => Math.imul(i + 1, 2654435761) >>> 0;

/**
 * Card preferences for a few common build directions: recruits first (until the squad is full), then
 * skills (while a slot is free), then the build's normal cards.
 */
export const BUILDS = {
  kinetic: ['merc_sniper', 'merc_grenadier', 'merc_gunner', 'merc_tesla', 'merc_cryo', 'skill_strafe', 'skill_mortar', 'skill_snipe',
    'kinetic', 'physical', 'crit', 'critDamage', 'speed', 'training', 'pierce', 'active', 'shock', 'voltage', 'coil', 'wall', 'plating', 'income', 'haste', 'radius', 'bio', 'burn', 'fire', 'repair'],
  fire: ['merc_flame', 'merc_engineer', 'merc_tesla', 'merc_cryo', 'merc_grenadier', 'skill_molotov', 'skill_minefield', 'skill_emp',
    'burn', 'fire', 'burnTime', 'elemental', 'speed', 'shock', 'active', 'haste', 'radius', 'acid', 'bio', 'kinetic', 'wall', 'plating', 'income', 'repair'],
  economy: ['merc_gunner', 'merc_grenadier', 'merc_tesla', 'merc_sniper', 'merc_chemist', 'skill_mortar', 'skill_strafe', 'skill_gas',
    'income', 'haggle', 'airdrop', 'kinetic', 'physical', 'speed', 'wall', 'plating', 'active', 'shock', 'bio', 'haste', 'radius', 'burn', 'fire', 'repair'],
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
    if (run.phase === 'choice') { run.choose(pickCard(run, prefs)); tick--; continue; }
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

/** Evolutions first, then synergies, then the build's preference list; among equals the higher rarity. */
export function pickCard(run, prefs) {
  const rank = c => ({ common: 0, uncommon: 1, rare: 2, legendary: 3 })[c.rarity ?? 'common'];
  const special = run.choices.filter(c => c.kind === 'evolution' || c.kind === 'synergy').sort((a, b) => (b.kind === 'evolution') - (a.kind === 'evolution'));
  if (special.length) return special[0].id;
  // A recruit is a whole new gun: worth more than any normal card while the squad has room.
  const score = c => prefs.indexOf(c.id) >= 0 ? prefs.indexOf(c.id) : c.kind === 'merc' ? 50 : c.kind === 'skill' ? 60 : 99;
  const scored = run.choices.map(c => ({ c, p: score(c) })).sort((a, b) => a.p - b.p || rank(b.c) - rank(a.c));
  return scored[0].c.id;
}
/** Auto-attack DPS of one mercenary kind at a given level (all copies). */
function kindDps(run, kind, level = run.levels[kind], copies = run.mercenaries.filter(m => m.kind === kind).length) {
  const saved = run.levels[kind]; run.levels[kind] = level;
  const def = MERCENARIES[kind], base = run.damageFor(kind), interval = run.intervalFor(kind);
  run.levels[kind] = saved;
  // Upgrades are judged against a crowd: splash and chains count the extra targets they usually reach.
  const crowd = def.pattern === 'aoe' ? 3 : def.pattern === 'cone' ? def.targets : def.pattern === 'chain' ? 1 + 0.7 * def.targets : 1;
  return mercValue(run, kind, base, interval) * crowd * copies;
}

/**
 * A strong economic player: every option is valued as added DPS per money; the best one is bought,
 * or saved for when it is not yet affordable. The barricade is repaired / fortified only when threatened.
 * Returns how many purchases it made.
 */
export function act(run) {
  let bought = 0;
  const front = run.enemies.reduce((best, e) => (!best || e.x > best.x ? e : best), undefined);
  if (front && front.x > 0) run.skills.forEach((s, slot) => { if (s.cooldown <= 0) run.cast(slot, Math.min(front.x, FIELD.wallX - 5), front.y); });
  for (let guard = 0; guard < 60; guard++) {
    const attackers = run.enemies.filter(e => e.x >= FIELD.wallX - 18).reduce((s, e) => s + e.attack, 0);
    const threatened = run.wallHealth < run.wallMaxHealth * 0.5 || (attackers > 0 && run.wallHealth < attackers * 8);
    if (threatened) {
      if (run.wallHealth < run.wallMaxHealth * 0.6 && run.repair()) { bought++; continue; }
      if (run.fortify()) { bought++; continue; }
    }
    const options = [];
    // Recruits come from cards now; money only buys levels (and the barricade).
    const owned = [...new Set(run.mercenaries.map(m => m.kind))];
    for (const kind of owned) {
      const gain = kindDps(run, kind, run.levels[kind] + 1) - kindDps(run, kind);
      options.push({ cost: run.upgradeCost(kind), value: gain, buy: () => run.upgrade(kind) });
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
  for (const merc of run.mercenaries) total += mercValue(run, merc.kind, run.damageFor(merc.kind), run.intervalFor(merc.kind));
  for (const skill of run.skills) {
    const [k, tags] = SKILL_PANEL[skill.id];
    total += calculateValue(run.skillPower * k, withFamily(tags), run.modifiers) / Math.max(1, effectiveCooldown(SKILLS[skill.id].cooldown, run.haste));
  }
  return total;
}
/** One mercenary's single-target auto-attack DPS: the flamer's burn, a hit per interval for everyone else. */
function mercValue(run, kind, base, interval) {
  const def = MERCENARIES[kind];
  if (kind === 'flame') return calculateValue(base, withFamily(['Damage.Fire', 'Mechanic.DOT', 'Status.Burning', 'Skill.AutoAttack', `Mercenary.${kind}`]), run.modifiers);
  return calculateValue(base * (1 + (def.ignite ?? 0) * 3), withFamily(def.tags), run.modifiers) / interval;
}
/** Each skill's damage as a multiple of the squad's reference shot, and its tags, for panel DPS. */
const SKILL_PANEL = {
  grenade: [5, ['Damage.Blast', 'Skill.Active', 'Weapon.grenade']], molotov: [18, ['Damage.Fire', 'Mechanic.DOT', 'Skill.Active', 'Weapon.molotov']],
  laser: [9, ['Damage.Electric', 'Skill.Active', 'Weapon.laser']], cryobomb: [4, ['Damage.Cold', 'Skill.Active', 'Weapon.cryobomb']],
  gas: [3.6, ['Damage.Toxin', 'Skill.Active', 'Weapon.gas']], mortar: [5, ['Damage.Blast', 'Skill.Active', 'Weapon.mortar']],
  emp: [3, ['Damage.Electric', 'Skill.Active', 'Weapon.emp']], strafe: [4.8, ['Damage.Kinetic', 'Skill.Active', 'Weapon.strafe']],
  snipe: [45, ['Damage.Kinetic', 'Damage.Cold', 'Skill.Active', 'Weapon.snipe']], minefield: [6, ['Damage.Blast', 'Damage.Fire', 'Skill.Active', 'Weapon.minefield']],
};

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

/** Every node of the star map, original nine first so ties keep the old order. */
const NODE_PRIORITY = [...LEGACY_NODES, ...TALENTS.map(n => n.id).filter(id => !LEGACY_NODES.includes(id))];
/** Spend all points: cheapest revealed node first, breakthrough whenever allowed. Mirrors a reasonable player. */
export function invest(tree, points) {
  tree = structuredClone(tree);
  for (let guard = 0; guard < 10000; guard++) {
    if (canBreakthrough(tree)) { tree.tier++; tree.maxNodeLevel += 10; continue; }
    const options = NODE_PRIORITY.filter(id => isRevealed(tree, id) && (tree.nodes[id] ?? 0) < tree.maxNodeLevel)
      .sort((a, b) => talentCost(tree.nodes[a] ?? 0, a) - talentCost(tree.nodes[b] ?? 0, b));
    const id = options[0]; if (!id) break;
    const cost = talentCost(tree.nodes[id] ?? 0, id); if (cost > points) break;
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
  // The original nine nodes: the long-run targets were calibrated on them. Real progression across the
  // whole 47-node map is measured by the meta-loop simulator instead.
  for (const id of LEGACY_NODES) tree.nodes[id] = level;
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
