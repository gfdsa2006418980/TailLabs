import test from 'node:test';
import assert from 'node:assert/strict';
import { DefenseRun, FIELD } from '../src/tl003/Run.ts';
import { compileTalents } from '../src/tl003/Talents.ts';
import { emptyTree } from '../src/tl003/Meta.ts';
import { MERCENARIES, cardDef, makeCard } from '../src/tl003/Content.ts';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
/** A run with the given cores equipped (tier 3, so all three slots are open). */
const withCores = (...cores) => { const tree = emptyTree(); tree.tier = 3; tree.unlockedCoreTalents = cores; tree.activeCoreTalents = cores; const run = new DefenseRun(1, compileTalents(tree)); run.start(); run.mercenaries[0].shotTimer = 1e9; return run; };
const plain = () => withCores();
const enemy = (over = {}) => ({ id: 9000, kind: 'walker', x: 500, y: 225, hp: 1e6, maxHp: 1e6, defense: 0, speed: 0, attack: 0, reward: 1, xp: 0,
  burnPower: 0, burnDuration: 0, burnFlammability: 0, corrosionPower: 0, corrosionDuration: 0, shockPower: 0, shockDuration: 0, hitFlash: 0, ...over });
const shoot = run => { run.mercenaries[0].shotTimer = 0; run.advance(FIELD.step); run.mercenaries[0].shotTimer = 1e9; };
const take = (run, id) => { run.phase = 'choice'; run.choices = [makeCard(cardDef(id))]; run.choose(id); };

test('TL003 cores: cold steel ignores 60% defense, never crits and pierces', () => {
  const base = plain(), cold = withCores('coldsteel');
  for (const run of [base, cold]) { run.critChance = 1; run.enemies = [enemy({ defense: 100 })]; shoot(run); }
  near(1e6 - base.enemies[0].hp, base.damageFor('rifle') * 1.5 * 100 / 200);
  near(1e6 - cold.enemies[0].hp, cold.damageFor('rifle') * 100 / 140);
  assert.equal(cold.pierce, 1);
});

test('TL003 cores: cremation turns direct damage into burns; layers stack burns up to ten', () => {
  const fire = withCores('cremation'); fire.enemies = [enemy()]; shoot(fire);
  near(fire.enemies[0].hp, 1e6); assert.ok(fire.enemies[0].burnPower > 0);
  const layers = withCores('layers'); take(layers, 'burn'); const e = enemy(); layers.enemies = [e];
  for (let i = 0; i < 14; i++) shoot(layers);
  assert.equal(e.burnLayers, 10); near(e.burnPower, 10 * 0.35 * makeCard(cardDef('burn')).value * 1, 1e-3);
});

test('TL003 cores: agony puts the crit on statuses instead of the hit', () => {
  const run = withCores('agony'); take(run, 'bio'); run.critChance = 1; const e = enemy(); run.enemies = [e]; shoot(run);
  near(1e6 - e.hp, run.damageFor('rifle')); near(e.corrosionPower, makeCard(cardDef('bio')).value * run.critDamage);
});

test('TL003 cores: rotation rewards switching elements and punishes repeats', () => {
  const run = withCores('rotation'); run.enemies = [enemy()]; shoot(run); const first = 1e6 - run.enemies[0].hp; shoot(run);
  near(1e6 - run.enemies[0].hp - first, first * 0.7);
});

test('TL003 cores: lone wolf closes recruiting and empowers the rifleman; uniform only recruits riflemen', () => {
  const wolf = withCores('lonewolf'), base = plain(); wolf.money = base.money = 1e6;
  assert.equal(wolf.recruit('flame'), false); near(wolf.damageFor('rifle'), base.damageFor('rifle') * 4); near(wolf.intervalFor('rifle'), base.intervalFor('rifle') / 1.5);
  wolf.cast(0, 500, 225); near(wolf.mercenaries[0].cooldown, MERCENARIES.rifle.cooldown * 0.5);
  const squad = withCores('uniform'); squad.money = 1e6;
  assert.equal(squad.recruit('flame'), false); assert.equal(squad.recruit('rifle'), true); assert.equal(squad.recruit('rifle'), true);
  assert.equal(squad.mercenaries.length, 3); near(squad.damageFor('rifle'), base.damageFor('rifle') * 1.3 ** 2);
});

test('TL003 cores: blood price has no cooldown and costs 10% of the barricade', () => {
  const run = withCores('bloodprice'); const wall = run.wallMaxHealth;
  assert.equal(run.cast(0, 500, 225), true); assert.equal(run.mercenaries[0].cooldown, 0); near(run.wallHealth, wall * 0.9);
  assert.ok(run.repairCost < plain().repairCost || run.repairCost === Math.ceil(6 * 0.5));
});

test('TL003 cores: point blank scales with distance; focus fire stacks on one target', () => {
  const far = withCores('pointblank'), close = withCores('pointblank');
  far.enemies = [enemy({ x: 0 })]; close.enemies = [enemy({ x: FIELD.wallX - 18 })]; shoot(far); shoot(close);
  near((1e6 - close.enemies[0].hp) / (1e6 - far.enemies[0].hp), 2.5 / 0.4);
  const focus = withCores('focusfire'); focus.enemies = [enemy()]; shoot(focus); const one = 1e6 - focus.enemies[0].hp; shoot(focus);
  near(1e6 - focus.enemies[0].hp - one, one * 1.15);
});

test('TL003 cores: corpse blast chains, raise dead fields allies, plunder heals on kills', () => {
  const blast = withCores('corpseblast'); blast.enemies = [enemy({ x: 510, hp: 1, maxHp: 1000 }), enemy({ id: 9001, x: 500, hp: 150, maxHp: 1000 })]; shoot(blast); blast.advance(FIELD.step);
  assert.equal(blast.kills, 2, 'the second dies to the first one\'s blast');
  const dead = withCores('raisedead'); dead.enemies = Array.from({ length: 40 }, (_, i) => enemy({ id: 9100 + i, hp: 1, x: 100 + i * 10 }));
  for (let i = 0; i < 40; i++) shoot(dead);
  assert.ok(dead.allies.length > 0 || dead.events.some(e => e.color === '#b5cc7f'), 'some corpses rise');
  const thief = withCores('plunder'); thief.wallHealth = 10; thief.enemies = [enemy({ hp: 1 })]; shoot(thief);
  near(thief.wallHealth, 10 + thief.wallMaxHealth * 0.01); assert.equal(thief.canRepair, false);
});

test('TL003 cores: ammo economy spends money per shot; autofire casts on its own', () => {
  const run = withCores('ammoeco'); run.money = 1000; run.enemies = [enemy()]; shoot(run);
  near(run.money, 990); near(1e6 - run.enemies[0].hp, run.damageFor('rifle') * (1 + Math.log2(1001) / 4));
  const auto = withCores('autofire'); auto.enemies = [enemy({ x: 400 })]; auto.advance(FIELD.step);
  assert.ok(auto.mercenaries[0].cooldown > 0, 'the grenade went off without a drag');
});

test('TL003 cores: black market offers five, takes two, adds curses and disables rerolls', () => {
  const run = withCores('blackmarket'); take(run, 'kinetic'); run.money = 1e6;
  run.phase = 'running'; run.xp = run.xpNeeded; run.advance(FIELD.step);
  assert.equal(run.choices.length, 5); assert.ok(run.choices.some(c => c.kind === 'curse')); assert.equal(run.reroll(), false);
  run.choose(run.choices[0].id); assert.equal(run.phase, 'choice'); assert.equal(run.choices.length, 4);
  run.choose(run.choices[0].id); assert.equal(run.phase, 'running');
});

test('TL003 grenades push bosses a quarter as far and never push anyone off the road', () => {
  const run = plain(); const walker = enemy({ x: 300 }), boss = enemy({ id: 9001, kind: 'boss', x: 300, y: 235 });
  run.enemies = [walker, boss]; assert.equal(run.cast(0, 300, 225), true); near(walker.x, 260); near(boss.x, 290);
  const edge = plain(), near0 = enemy({ x: 20 }); edge.enemies = [near0]; assert.equal(edge.cast(0, 20, 225), true); near(near0.x, 0);
});

test('TL003 wildfire lights only unburnt enemies, at 40% of the dead one\'s burn', () => {
  const run = plain(); run.evolutions.flame = 'wildfire';
  const dying = enemy({ hp: 1, burnPower: 100, burnDuration: 3 }), fresh = enemy({ id: 9001, x: 510 }), lit = enemy({ id: 9002, x: 490, burnPower: 5, burnDuration: 3 });
  run.enemies = [dying, fresh, lit]; run.advance(FIELD.step); run.advance(FIELD.step);
  assert.ok(dying.hp <= 0); near(fresh.burnPower, 40); near(lit.burnPower, 5); assert.equal(lit.burnFlammability, 0);
});

test('TL003 balance: several status cards merge into one application per hit; the flamer grows +6.5% a level', () => {
  const run = plain(); take(run, 'burn'); take(run, 'burn'); const e = enemy(); run.enemies = [e]; shoot(run);
  near(e.burnPower, 2 * makeCard(cardDef('burn')).value, 1e-3); assert.equal(e.burnFlammability, 0);
  const layers = withCores('layers'); take(layers, 'burn'); take(layers, 'burn'); const f = enemy(); layers.enemies = [f]; shoot(layers);
  assert.equal(f.burnLayers, 2);
  const base = plain(); const lv1 = base.damageFor('flame'); base.levels.flame = 2; near(base.damageFor('flame'), lv1 * 1.065);
});
