import test from 'node:test';
import assert from 'node:assert/strict';
import { DefenseRun, FIELD, PITY_DRAWS, rarityWeights , freshStatus } from '../src/tl003/Run.ts';
import { CARD_DEFS, MERCENARIES, RARITIES, SKILLS, cardDef, makeCard } from '../src/tl003/Content.ts';
import * as B from '../src/tl003/Balance.ts';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const running = (seed = 1) => { const run = new DefenseRun(seed); run.start(); run.mercenaries[0].shotTimer = 1e9; return run; };
const take = (run, id, rarity) => { run.phase = 'choice'; run.choices = [makeCard(cardDef(id), rarity)]; assert.equal(run.choose(id), true); };
const enemy = (over = {}) => ({ id: 9000, kind: 'walker', x: 500, y: 225, hp: 1e6, maxHp: 1e6, defense: 0, speed: 0, attack: 0, reward: 1, xp: 0,
  burnPower: 0, burnDuration: 0, burnFlammability: 0, ...freshStatus(), hitFlash: 0, ...over });
const levelUp = run => { run.phase = 'running'; run.xp = run.xpNeeded; run.advance(FIELD.step); assert.equal(run.phase, 'choice'); return run.choices; };

test('TL003 cards: rarity scales magnitudes; legendary is reserved for evolutions', () => {
  const kinetic = cardDef('kinetic');
  near(makeCard(kinetic, 'uncommon').value, kinetic.value * RARITIES.uncommon.mult * B.cardScale(1));
  near(makeCard(kinetic, 'rare', 30).modifier.value, kinetic.value * RARITIES.rare.mult * B.cardScale(30));
  const w = rarityWeights(1); near(w.common + w.uncommon + w.rare, 100);
  assert.ok(rarityWeights(30).common < w.common && rarityWeights(500).common === 35, 'common share shrinks with level, floored at 35');
  assert.ok(CARD_DEFS.filter(d => d.fixedRarity === 'legendary').every(d => d.kind === 'evolution'));
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
  assert.ok(first.filter(c => c.kind !== 'merc').every(c => ['kinetic', 'burn', 'bio', 'shock', 'chill', 'blastAmmo'].includes(c.id)));
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

test('TL003 cards: pity guarantees a rare after a streak of plain draws', () => {
  const run = running(); take(run, 'kinetic');
  run.pity = PITY_DRAWS - 1; const offers = levelUp(run);
  assert.ok(offers.some(c => c.rarity === 'rare' || c.rarity === 'legendary'), offers.map(c => c.rarity).join());
  assert.equal(run.pity, 0);
});

test('TL003 cards: reroll costs battlefield money, rises per reroll and redraws', () => {
  const run = running(); take(run, 'kinetic'); levelUp(run);
  const cost = run.rerollCost; run.money = 0; assert.equal(run.reroll(), false);
  run.money = 1e6; assert.equal(run.reroll(), true); near(run.money, 1e6 - cost);
  assert.ok(run.rerollCost > cost); assert.equal(run.choices.length, 3); assert.equal(run.phase, 'choice');
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

test('TL003 cards: crits, pierce, plating, spikes and airdrop', () => {
  const crit = running(); take(crit, 'crit'); crit.critChance = 1; const a = enemy(); crit.enemies = [a]; crit.mercenaries[0].shotTimer = 0; crit.advance(FIELD.step);
  near(1e6 - a.hp, crit.damageFor('rifle') * 1.5); assert.ok(crit.events.some(e => e.kind === 'hit' && e.crit));
  const pierce = running(); take(pierce, 'pierce', 'rare'); const front = enemy({ x: 600 }), back = enemy({ id: 9001, x: 400 });
  pierce.enemies = [front, back]; pierce.mercenaries[0].shotTimer = 0; pierce.advance(FIELD.step); near(1e6 - back.hp, (1e6 - front.hp) * 0.6);
  const plating = makeCard(cardDef('plating')).value;
  const plate = running(); take(plate, 'plating'); near(plate.wallReduction, plating); take(plate, 'plating'); near(plate.wallReduction, 1 - (1 - plating) ** 2);
  const spikes = running(); take(spikes, 'spikes'); const chewer = enemy({ x: FIELD.wallX - 18 }); spikes.enemies = [chewer]; spikes.advance(1); assert.ok(chewer.hp < 1e6);
  const drop = running(); take(drop, 'airdrop'); assert.ok(drop.money > 0 && drop.totalEarnedMoney === drop.money);
});
