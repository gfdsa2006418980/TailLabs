import test from 'node:test';
import assert from 'node:assert/strict';
import { DefenseRun, FIELD, PITY_DRAWS, THROWABLE, rarityWeights , freshStatus } from '../src/tl003/Run.ts';
import { CARD_DEFS, MERCENARIES, RARITIES, SKILLS, cardDef, makeCard } from '../src/tl003/Content.ts';
import * as B from '../src/tl003/Balance.ts';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const running = (seed = 1) => { const run = new DefenseRun(seed); run.start(); run.mercenaries[0].shotTimer = 1e9; return run; };
const take = (run, id, rarity) => { run.phase = 'choice'; run.choices = [makeCard(cardDef(id), rarity)]; assert.equal(run.choose(id), true); };
const enemy = (over = {}) => ({ id: 9000, kind: 'walker', x: 500, y: 225, hp: 1e6, maxHp: 1e6, defense: 0, speed: 0, attack: 0, reward: 1, xp: 0,
  ...freshStatus(), hitFlash: 0, ...over });
// Level-ups are banked until the rest; card tests open one pick by hand (one level up, a fresh draw).
const levelUp = run => { run.level++; run.rerollsThisLevel = 0; run.choices = run.draw(); run.phase = 'choice'; return run.choices; };

test('TL003 cards: rarity scales magnitudes (× CARD_POWER); legendary is for evolutions only', () => {
  const kinetic = cardDef('kinetic');
  // 2026-10-23: one fixed value per rarity at every tactical level (no late +1% cards), times CARD_POWER.
  near(makeCard(kinetic, 'uncommon').value, kinetic.value * RARITIES.uncommon.mult * B.CARD_POWER);
  near(makeCard(kinetic, 'rare', 30).modifier.value, kinetic.value * RARITIES.rare.mult * B.CARD_POWER);
  for (const def of CARD_DEFS.filter(d => d.kind === 'normal')) near(makeCard(def, 'common', 100).value, makeCard(def, 'common', 2).value);
  near(makeCard(cardDef('kinetic'), 'common', 80).value, 0.1 * B.CARD_POWER); near(makeCard(cardDef('crit'), 'common', 80).value, 0.03 * B.CARD_POWER);
  const w = rarityWeights(1); near(w.common + w.uncommon + w.rare + w.legendary, 100);
  assert.ok(rarityWeights(30).common < w.common && rarityWeights(500).common === 35, 'common share shrinks with level, floored at 35');
  assert.ok(CARD_DEFS.filter(d => d.fixedRarity === 'legendary').every(d => d.kind === 'evolution'));
  // 2026-10-23: 穿甲彈芯, 爆裂彈頭 and 緊急工兵 are gone; no normal card reaches legendary any more.
  for (const id of ['pierce', 'blastAmmo', 'repair']) assert.equal(cardDef(id), undefined, id);
  assert.deepEqual(CARD_DEFS.filter(d => d.kind === 'normal' && d.maxRarity === 'legendary').map(d => d.id), []);
  assert.deepEqual(cardDef('refract').recipe, ['crit', 'coil', 'coil']);
  // Legendary rolls fall back to rare for normal cards.
  const run = running(); take(run, 'kinetic'); const seen = new Set();
  for (let i = 0; i < 400; i++) { for (const c of levelUp(run)) if (c.kind === 'normal') seen.add(c.id + ':' + c.rarity); run.phase = 'running'; run.choices = []; }
  assert.ok(![...seen].some(key => key.endsWith(':legendary')), [...seen].filter(key => key.endsWith(':legendary')).join());
  assert.ok([...seen].some(key => key.endsWith(':rare')), 'rare cards do show up');
});

test('TL003 cards: each card can be picked at most CARD_PICK_LIMIT times, then it leaves the pool', () => {
  const kineticSeen = picks => {
    const run = running(); for (let i = 0; i < picks; i++) take(run, 'kinetic');
    let seen = 0; for (let i = 0; i < 300; i++) { if (levelUp(run).some(c => c.id === 'kinetic')) seen++; run.phase = 'running'; run.choices = []; }
    return seen;
  };
  assert.ok(kineticSeen(B.CARD_PICK_LIMIT - 1) > 0, 'one pick below the limit it is still offered');
  assert.equal(kineticSeen(B.CARD_PICK_LIMIT), 0, 'at the limit it is never offered again');
});

test('TL003 cards: about 100 picks fit in a 20-minute run; synergies and evolutions are level-gated', () => {
  let total = 0, level = 1; while (level < 101) { total += B.xpForLevel(level); level++; }
  assert.ok(total > 50000 && total < 90000, `XP for 100 picks ${total}`);
  assert.deepEqual([1, 2, 3].map(B.xpForLevel), [3, 5, 8], 'the first cards come quickly');
  const early = running(); early.level = B.EVOLUTION_MIN_LEVEL - 1; take(early, 'active'); take(early, 'active'); take(early, 'active');
  assert.equal(early.readyEvolutions().length, 0);
  assert.ok(B.cardScale(1) > B.cardScale(40) && B.cardScale(500) === B.CARD_SCALE_FLOOR);
});

test('TL003 cards: three unique offers; the first choice offers two recruits and one starter ammo', () => {
  const run = running(); const first = levelUp(run);
  assert.equal(new Set(first.map(c => c.id)).size, 3);
  assert.equal(first.filter(c => c.kind === 'merc').length, 2, first.map(c => c.id).join());
  assert.ok(first.filter(c => c.kind !== 'merc').every(c => ['kinetic', 'burn', 'bio', 'shock', 'chill'].includes(c.id)));
});

test('TL003 cards: until the squad is full every choice offers 1–2 recruits; then none', () => {
  const run = running(); take(run, 'kinetic');
  for (let i = 0; i < 30; i++) {
    const c = levelUp(run), recruits = c.filter(x => x.kind === 'merc').length;
    if (run.mercenaries.length < 3) assert.ok(recruits >= 1 && recruits <= 2, c.map(x => x.id).join()); else assert.equal(recruits, 0);
    run.choose((c.find(x => x.kind === 'merc') ?? c[0]).id);
  }
  assert.equal(run.mercenaries.length, 3); assert.equal(new Set(run.mercenaries.map(m => m.kind)).size, 3, 'no duplicate kinds without 制式部隊');
});

test('TL003 cards: skill cards fill up to three skill slots and stop when full', () => {
  const run = running(); take(run, 'skill_gas'); take(run, 'skill_emp'); assert.deepEqual(run.skills.map(s => s.id), ['grenade', 'gas', 'emp']);
  assert.equal(run.learn('mortar'), false);
  for (let i = 0; i < 20; i++) { const c = levelUp(run); assert.ok(!c.some(x => x.kind === 'skill')); run.choose(c[0].id); }
});

test('TL003 cards: the build pulls its own cards (mercenaries, skills, cores and past picks raise the weight)', () => {
  const run = running(); const base = run.affinity();
  run.recruit('cryo'); run.learn('gas'); take(run, 'chill'); take(run, 'chill');
  const w = run.affinity();
  // cryo: 冷凍 +0.6 and 元素 +0.3; gas: 毒素 +0.4 and 物理 +0.2; two 冷凍 picks +0.3. The rifle and grenade were already there.
  near(w.get('冷凍') - (base.get('冷凍') ?? 1), 0.6 + 0.3);
  near(w.get('毒素') - (base.get('毒素') ?? 1), 0.4);
  near(w.get('元素') - (base.get('元素') ?? 1), 0.3);
  // Over many draws, 冷凍 cards come up clearly more often than for a squad without cold.
  const share = r => { let cold = 0, all = 0; for (let i = 0; i < 300; i++) { const c = levelUp(r); for (const x of c) { all++; if (x.category === '冷凍') cold++; } r.phase = 'running'; r.choices = []; } return cold / all; };
  const plainRun = running(); plainRun.recruit('gunner'); plainRun.recruit('chemist'); take(plainRun, 'kinetic');
  const coldRun = running(); coldRun.recruit('cryo'); coldRun.recruit('sniper'); take(coldRun, 'chill');
  assert.ok(share(coldRun) > share(plainRun) * 1.3, 'cold squads see more cold cards');
});
test('TL003 cards: pity guarantees a rare after a streak of plain draws', () => {
  const run = running(); take(run, 'kinetic');
  run.pity = PITY_DRAWS - 1; const offers = levelUp(run);
  assert.ok(offers.some(c => c.rarity === 'rare' || c.rarity === 'legendary'), offers.map(c => c.rarity).join());
  assert.equal(run.pity, 0);
});

test('TL003 cards: one reroll per pick at a fixed battlefield-money price; a free reroll is used first', () => {
  const run = running(); take(run, 'kinetic'); levelUp(run);
  const cost = run.rerollCost; assert.equal(cost, Math.ceil(8 * B.INCOME_GROWTH_PER_MINUTE ** (run.elapsed / 60)));
  run.money = 0; assert.equal(run.reroll(), false); assert.equal(run.canReroll, true, 'a refused reroll is not used up');
  run.money = 1e6; const before = run.choices; assert.equal(run.reroll(), true); near(run.money, 1e6 - cost);
  assert.notEqual(run.choices, before); assert.equal(run.choices.length, 3); assert.equal(run.phase, 'choice');
  assert.equal(run.rerollCost, cost, 'the price does not rise per reroll');
  assert.equal(B.REROLLS_PER_PICK, 1); assert.equal(run.canReroll, false); assert.equal(run.reroll(), false); near(run.money, 1e6 - cost);
  const free = running(); take(free, 'kinetic'); levelUp(free); free.freeRerolls = 1; free.money = 0;
  assert.equal(free.rerollCost, 0); assert.equal(free.reroll(), true); assert.equal(free.freeRerolls, 0); assert.equal(free.reroll(), false);
});

test('TL003 cards: synergies only enter the pool once both elements are in the build', () => {
  const run = running(); take(run, 'kinetic');
  // Stay away from anything fire: cards, recruits (焚燒兵, 工兵) and skills (燃燒瓶, 地雷陣).
  const fireFree = x => x.category !== '火焰' && !(x.merc && MERCENARIES[x.merc].elements.includes('火焰')) && !(x.skill && SKILLS[x.skill].elements.includes('火焰'));
  for (let i = 0; i < 40; i++) { const c = levelUp(run); assert.ok(!c.some(x => x.id === 'phosphorus')); const pick = c.find(fireFree); if (pick) run.choose(pick.id); else { run.choices = []; run.phase = 'running'; } }
  take(run, 'burn'); let seen = false;
  for (let i = 0; i < 60 && !seen; i++) { run.pity = PITY_DRAWS - 1; const c = levelUp(run); seen = c.some(x => x.id === 'phosphorus'); run.choose(c[0].id); }
  assert.ok(seen, 'white phosphorus appears once kinetic and fire are owned');
});

test('TL003 cards: a completed recipe guarantees its evolution, and one variant locks the others out', () => {
  const run = running(); run.money = 1e6; run.level = 25; // evolutions unlock from tactical level 20
  take(run, 'active'); take(run, 'active'); take(run, 'active');
  const offers = levelUp(run); const evo = offers.find(c => c.kind === 'evolution');
  assert.ok(evo && evo.id === 'hex' && evo.rarity === 'legendary', offers.map(c => c.id).join());
  run.choose('hex'); assert.equal(run.evolutions.grenade, 'hex');
  take(run, 'haste'); take(run, 'speed'); take(run, 'speed');
  for (let i = 0; i < 20; i++) { const c = levelUp(run); assert.ok(!c.some(x => x.kind === 'evolution' && x.skill === 'grenade'), 'no second grenade variant'); run.choose(c[0].id); }
});

test('TL003 cards: evolutions change the skill (high explosive, double throw, overload)', () => {
  const hex = running(); hex.evolutions.grenade = 'hex'; hex.enemies = [enemy({ x: 500, y: 225 + 140 })];
  hex.cast(0, 500, 225); assert.ok(hex.enemies[0].hp < 1e6, 'radius ×1.5 reaches 140 away'); near(hex.skills[0].cooldown, 10 * 1.3);
  const dbl = running(); dbl.evolutions.grenade = 'double'; dbl.cast(0, 500, 225); assert.equal(dbl.events.filter(e => e.kind === 'blast').length, 2);
  const over = running(); over.learn('laser'); over.evolutions.laser = 'overload'; over.cast(1, 200, 222); near(over.skills[1].cooldown, 45 * 1.5);
});

test('TL003 cards: the seven new evolutions (crossfire, barrage, absolute zero, cascade, nerve gas, cluster mines, marksman)', () => {
  /** A run with this throwable in slot 1, optionally evolved. */
  const evo = (skill, id) => { const r = running(); r.learn(skill); if (id) r.evolutions[skill] = id; return r; };
  /** Per-target damage per cast from the THROWABLE table. */
  const T = (r, id) => r.skillPower * THROWABLE[id] * (B.SKILL_TUNING[id] ?? 1);
  const value = id => cardDef(id).value;
  // 交叉火網: a second band 2 × depth behind; every hit × value.
  for (const id of [undefined, 'crossfire']) {
    const r = evo('strafe', id), depth = SKILLS.strafe.radius * r.skillRange;
    const front = enemy({ x: 500 }), back = enemy({ id: 9001, x: 500 - 2 * depth }); r.enemies = [front, back]; r.cast(1, 500, 225);
    near(1e6 - front.hp, T(r, 'strafe') * (id ? value('crossfire') : 1));
    near(1e6 - back.hp, id ? T(r, 'strafe') * value('crossfire') : 0);
  }
  // 飽和轟炸: `value` shells instead of five.
  const barrage = evo('mortar', 'barrage'); barrage.cast(1, 400, 225);
  assert.equal(barrage.events.filter(e => e.kind === 'blast').length, value('barrage'));
  // 絕對零度: radius × value, and the frozen stay frozen 2 s longer.
  for (const id of [undefined, 'absolutezero']) {
    const r = evo('cryobomb', id), radius = SKILLS.cryobomb.radius * r.skillRange;
    const edge = enemy({ x: 500 + radius * (1 + value('absolutezero')) / 2 }); r.enemies = [edge]; r.cast(1, 500, 225);
    assert.equal(r.isFrozen(edge), !!id, `${id} freezes the ring`);
    if (id) near(edge.meters.chill.timer, B.STATUS.chill.duration + 2);
  }
  // 連鎖過載: each struck zombie arcs to its 2 nearest within 120 for value × the EMP damage.
  for (const id of [undefined, 'cascade']) {
    const r = evo('emp', id), struck = enemy({ x: 500 }), outside = enemy({ id: 9001, x: 600 }); r.enemies = [struck, outside];
    r.cast(1, 500 - SKILLS.emp.radius * r.skillRange + 10, 225);
    assert.ok(struck.hp < 1e6); near(1e6 - outside.hp, id ? T(r, 'emp') * value('cascade') : 0);
  }
  // 神經毒氣: 9 s of pulses, toxin × value.
  const nerve = evo('gas', 'nerve'), n = enemy({ toxinBurst: true }); nerve.enemies = [n]; nerve.cast(1, 500, 225);
  near(n.toxin, 6 * value('nerve')); near(nerve.zones[0].remaining, 9);
  nerve.advance(10); near(1e6 - n.hp, 9 * T(nerve, 'gas') / 6);
  // 集束地雷: `value` mines with a 65 blast radius.
  const cluster = evo('minefield', 'cluster'); cluster.enemies = [enemy({ x: 50, y: 380 })]; cluster.cast(1, 400, 225);
  assert.equal(cluster.mines.length, value('cluster')); assert.ok(cluster.mines.every(m => m.radius === 65));
  // 連續狙擊: the `value` highest-HP zombies, each a forced crit.
  const marks = evo('snipe', 'marksman'), crowd = [9, 8, 7, 6, 5].map((h, i) => enemy({ id: 9100 + i, x: 300 + i * 50, hp: h * 1e5, maxHp: 1e6 }));
  marks.enemies = crowd; marks.cast(1, 300, 225);
  crowd.forEach((e, i) => near(e.hp, (9 - i) * 1e5 - (i < value('marksman') ? T(marks, 'snipe') * marks.critDamage : 0)));
});

test('TL003 cards: crits, no pierce without 冷鋼紀律, plating, spikes and airdrop', () => {
  const crit = running(); take(crit, 'crit'); crit.critChance = 1; const a = enemy(); crit.enemies = [a]; crit.mercenaries[0].shotTimer = 0; crit.advance(FIELD.step);
  near(1e6 - a.hp, crit.damageFor('rifle') * 1.5); assert.ok(crit.events.some(e => e.kind === 'hit' && e.crit));
  // Pierce only comes from the 冷鋼紀律 core now (see the cores tests); a plain shot stops at its target.
  const plain = running(); const front = enemy({ x: 600 }), back = enemy({ id: 9001, x: 400 });
  plain.enemies = [front, back]; plain.mercenaries[0].shotTimer = 0; plain.advance(FIELD.step);
  assert.equal(plain.pierce, 0); assert.ok(front.hp < 1e6); near(back.hp, 1e6);
  const plating = makeCard(cardDef('plating')).value;
  const plate = running(); take(plate, 'plating'); near(plate.wallReduction, plating); take(plate, 'plating'); near(plate.wallReduction, 1 - (1 - plating) ** 2);
  const spikes = running(); take(spikes, 'spikes'); const chewer = enemy({ x: FIELD.wallX - 18 }); spikes.enemies = [chewer]; spikes.advance(1); assert.ok(chewer.hp < 1e6);
  const drop = running(); take(drop, 'airdrop'); assert.ok(drop.money > 0 && drop.totalEarnedMoney === drop.money);
});
