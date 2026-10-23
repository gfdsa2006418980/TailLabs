import test from 'node:test';
import assert from 'node:assert/strict';
import { DefenseRun, FIELD, freshStatus, searchlightAt } from '../src/tl003/Run.ts';
import { compileTalents } from '../src/tl003/Talents.ts';
import { emptyTree } from '../src/tl003/Meta.ts';
import { SKILLS, cardDef, makeCard } from '../src/tl003/Content.ts';
import * as B from '../src/tl003/Balance.ts';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
/** A run with the given cores equipped (tier 3, so all three slots are open). */
const withCores = (...cores) => { const tree = emptyTree(); tree.tier = 3; tree.unlockedCoreTalents = cores; tree.activeCoreTalents = cores; const run = new DefenseRun(1, compileTalents(tree)); run.start(); run.mercenaries[0].shotTimer = 1e9; return run; };
const plain = () => withCores();
const enemy = (over = {}) => ({ id: 9000, kind: 'walker', x: 500, y: 225, hp: 1e6, maxHp: 1e6, defense: 0, speed: 0, attack: 0, reward: 1, xp: 0,
  burnPower: 0, burnDuration: 0, burnFlammability: 0, ...freshStatus(), hitFlash: 0, ...over });
const shoot = run => { run.mercenaries[0].shotTimer = 0; run.advance(FIELD.step); run.mercenaries[0].shotTimer = 1e9; };
const take = (run, id) => { run.phase = 'choice'; run.choices = [makeCard(cardDef(id))]; run.choose(id); };

test('TL003 cores: cold steel: kinetic damage ignores half the armor, never crits, pierces two', () => {
  const base = plain(), cold = withCores('coldsteel');
  for (const run of [base, cold]) { run.critChance = 1; run.enemies = [enemy({ defense: 100 })]; shoot(run); }
  near(1e6 - base.enemies[0].hp, base.damageFor('rifle') * 1.5 * 100 / 200);
  near(1e6 - cold.enemies[0].hp, cold.damageFor('rifle') * 100 / 150);
  assert.equal(cold.pierce, 2); assert.equal(base.pierce, 0);
  // The only source of pierce: a single shot carries on through two enemies behind it, keeping pierceRetention per enemy.
  const pierce = withCores('coldsteel'), front = enemy({ x: 600 }), back = enemy({ id: 9001, x: 400 }), back2 = enemy({ id: 9002, x: 300 }), back3 = enemy({ id: 9003, x: 200 });
  pierce.enemies = [front, back, back2, back3]; shoot(pierce);
  const r = pierce.perm.pierceRetention, hit = 1e6 - front.hp;
  near(1e6 - back.hp, hit * r); near(1e6 - back2.hp, hit * r * r); near(back3.hp, 1e6);
  // Only kinetic damage: a cold hit (the cryo trooper's) still meets the full armor... and armor does not stop cold anyway.
  const cryo = withCores('coldsteel'); cryo.recruit('cryo'); cryo.enemies = [enemy({ defense: 100, resist: 0.5, x: 600 })];
  cryo.mercenaries[1].shotTimer = 0; cryo.advance(FIELD.step);
  near(1e6 - cryo.enemies[0].hp, cryo.damageFor('cryo') * 0.5, 1e-6);
});

test('TL003 cores: cremation turns direct damage into burns; layers stack burns up to ten', () => {
  const fire = withCores('cremation'); fire.enemies = [enemy()]; shoot(fire);
  near(fire.enemies[0].hp, 1e6); near(fire.enemies[0].burnPower, fire.damageFor('rifle') * 0.8);
  const layers = withCores('layers'); take(layers, 'burn'); const e = enemy(); layers.enemies = [e];
  for (let i = 0; i < 14; i++) shoot(layers);
  assert.equal(e.burnLayers, 10); near(e.burnPower, 10 * 0.35 * makeCard(cardDef('burn')).value * layers.damageFor('rifle'), 1e-3);
});

test('TL003 cores: agony puts the crit on statuses instead of the hit', () => {
  // toxinBurst: already detonated, so the 0-defense dummy does not blow itself up on the first toxin.
  const run = withCores('agony'); take(run, 'bio'); run.critChance = 1; const e = enemy({ toxinBurst: true }); run.enemies = [e]; shoot(run);
  near(1e6 - e.hp, run.damageFor('rifle')); near(e.toxin, makeCard(cardDef('bio')).value * run.critDamage);
});

test('TL003 cores: rotation rewards switching elements and punishes repeats', () => {
  const run = withCores('rotation'); run.enemies = [enemy()]; shoot(run); const first = 1e6 - run.enemies[0].hp; shoot(run);
  near(1e6 - run.enemies[0].hp - first, first * 0.7);
});

test('TL003 cores: lone wolf closes recruiting and empowers the rifleman; uniform only recruits riflemen', () => {
  const wolf = withCores('lonewolf'), base = plain(); wolf.money = base.money = 1e6;
  assert.equal(wolf.recruit('flame'), false); near(wolf.damageFor('rifle'), base.damageFor('rifle') * 4); near(wolf.intervalFor('rifle'), base.intervalFor('rifle') / 1.5);
  wolf.cast(0, 500, 225); near(wolf.skills[0].cooldown, SKILLS.grenade.cooldown * 0.5);
  const squad = withCores('uniform'); squad.money = 1e6;
  assert.equal(squad.recruit('flame'), false); assert.equal(squad.recruit('rifle'), true); assert.equal(squad.recruit('rifle'), true);
  assert.equal(squad.mercenaries.length, 3); near(squad.damageFor('rifle'), base.damageFor('rifle') * 1.3 ** 2);
});

test('TL003 cores: 血債血償 grows all damage as the barricade falls (×2 cap); casts cost 4% but never the last point', () => {
  const run = withCores('bloodprice'), base = plain(); const wall = run.wallMaxHealth;
  assert.equal(run.cast(0, 500, 225), true); near(run.wallHealth, wall * (1 - B.BLOOD_SKILL_COST)); assert.ok(run.skills[0].cooldown > 0, 'cooldowns stay');
  const hitAt = (share) => { const r = withCores('bloodprice'); r.wallHealth = r.wallMaxHealth * share; r.enemies = [enemy()]; shoot(r); return 1e6 - r.enemies[0].hp; };
  base.enemies = [enemy()]; shoot(base); const plainHit = 1e6 - base.enemies[0].hp;
  near(hitAt(1), plainHit); near(hitAt(0.5), plainHit * 1.5); near(hitAt(0.01), plainHit * (1 + 0.99 * (B.BLOOD_MAX - 1)));
  const brink = withCores('bloodprice'); brink.wallHealth = 1; brink.cast(0, 500, 225); near(brink.wallHealth, 1);
  assert.equal(brink.phase, 'running'); near(brink.repairCost, plain().repairCost);
});

test('TL003 cores: point blank scales with distance; focus fire stacks on one target', () => {
  // 探照獵殺: ×2 in the searchlight, ÷2 outside, and the guns pick the lit target over a closer unlit one.
  const hunt = withCores('pointblank'), base = plain(), light = hunt.searchlight;
  assert.equal(light.radius, B.SEARCHLIGHT_WIDE_RADIUS); assert.equal(base.searchlight.radius, B.SEARCHLIGHT_RADIUS);
  const lit = enemy({ x: Math.max(200, Math.min(700, light.x)), y: light.y });
  const dark = enemy({ id: 9001, x: lit.x + 20 + light.radius, y: light.y });
  hunt.isLit(lit) || assert.fail('the test zombie should stand in the light');
  hunt.enemies = [lit, dark]; shoot(hunt);
  near(1e6 - lit.hp, hunt.damageFor('rifle') * B.SEARCHLIGHT_FACTOR); near(dark.hp, 1e6);
  hunt.enemies = [dark]; shoot(hunt); near(1e6 - dark.hp, hunt.damageFor('rifle') / B.SEARCHLIGHT_FACTOR);
  // The light moves with game time only.
  const a = searchlightAt(10), b = searchlightAt(10); near(a.x, b.x); assert.notEqual(searchlightAt(20).x, a.x);
  // 集火射擊 speeds up the guns on one target; each shot's damage stays the same.
  const focus = withCores('focusfire'); focus.enemies = [enemy()]; shoot(focus); const one = 1e6 - focus.enemies[0].hp; shoot(focus);
  near(1e6 - focus.enemies[0].hp - one, one);
  near(focus.shotInterval(focus.mercenaries[0]), focus.intervalFor('rifle') / 1.15);
  for (let i = 0; i < 30; i++) shoot(focus);
  near(focus.shotInterval(focus.mercenaries[0]), focus.intervalFor('rifle') / 4);
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
  // The shot spends 1% first, then every kinetic hit scales with the money left.
  const run = withCores('ammoeco'); run.money = 1000; run.enemies = [enemy()]; shoot(run);
  near(run.money, 990); near(1e6 - run.enemies[0].hp, run.damageFor('rifle') * (1 + Math.log2(991) / 4));
  const grenade = withCores('ammoeco'); grenade.money = 0; grenade.enemies = [enemy()]; grenade.learn('strafe'); grenade.cast(1, 500, 225);
  near(1e6 - grenade.enemies[0].hp, grenade.skillPower * 0.8 * 6 * 0.5, 1e-6);
  const auto = withCores('autofire'); auto.enemies = [enemy({ x: 400 })]; auto.advance(FIELD.step);
  assert.ok(auto.skills[0].cooldown > 0, 'the grenade went off without a drag');
});

test('TL003 cores: 以牆為彈 adds 8% of the barricade per second to each gun, and the wall takes ×1.3', () => {
  const run = withCores('blackmarket'), base = plain();
  run.enemies = [enemy()]; shoot(run); base.enemies = [enemy()]; shoot(base);
  const extra = (1e6 - run.enemies[0].hp) - (1e6 - base.enemies[0].hp);
  near(extra, run.wallHealth * B.BULWARK_SHARE * run.intervalFor('rifle'));
  near(run.wallVulnerability, B.BULWARK_WALL_DAMAGE);
  // Ordinary three-card choices with rerolls: the old black market is gone.
  // Level-ups are banked; open the pick by hand (one level up, a fresh draw).
  take(run, 'kinetic'); run.money = 1e6; run.level++; run.choices = run.draw(); run.phase = 'choice';
  assert.equal(run.choices.length, 3); assert.ok(!run.choices.some(c => c.kind === 'curse')); assert.equal(run.reroll(), true);
});
test('TL003 cores: 亡者徵召 fixes the barricade at 1 max health; it cannot be fortified', () => {
  const run = withCores('raisedead'); run.money = 1e6;
  near(run.wallMaxHealth, 1); near(run.wallHealth, 1);
  assert.equal(run.canFortify, false); assert.equal(run.fortify(), false); take(run, 'wall'); near(run.wallMaxHealth, 1);
});

test('TL003 grenades push bosses a quarter as far and never push anyone off the road', () => {
  const run = plain(); const walker = enemy({ x: 300 }), boss = enemy({ id: 9001, kind: 'boss', x: 300, y: 235 });
  run.enemies = [walker, boss]; assert.equal(run.cast(0, 300, 225), true); near(walker.x, 260); near(boss.x, 290);
  const edge = plain(), near0 = enemy({ x: 20 }); edge.enemies = [near0]; assert.equal(edge.cast(0, 20, 225), true); near(near0.x, 0);
});

test('TL003 wildfire lights only unburnt enemies, at 40% of the dead one\'s burn', () => {
  const run = plain(); run.evolutions.molotov = 'wildfire';
  const dying = enemy({ hp: 1, burnPower: 100, burnDuration: 3 }), fresh = enemy({ id: 9001, x: 510 }), lit = enemy({ id: 9002, x: 490, burnPower: 5, burnDuration: 3 });
  run.enemies = [dying, fresh, lit]; run.advance(FIELD.step); run.advance(FIELD.step);
  assert.ok(dying.hp <= 0); near(fresh.burnPower, 40); near(lit.burnPower, 5); assert.equal(lit.burnFlammability, 0);
});

test('TL003 balance: several status cards merge into one application per hit; the flamer grows FLAME_DAMAGE_PER_LEVEL a level', () => {
  const run = plain(); take(run, 'burn'); take(run, 'burn'); const e = enemy(); run.enemies = [e]; shoot(run);
  near(e.burnPower, 2 * makeCard(cardDef('burn')).value * run.damageFor('rifle'), 1e-3); assert.equal(e.burnFlammability, 0);
  const layers = withCores('layers'); take(layers, 'burn'); take(layers, 'burn'); const f = enemy(); layers.enemies = [f]; shoot(layers);
  assert.equal(f.burnLayers, 2);
  const base = plain(); const lv1 = base.damageFor('flame'); base.levels.flame = 2; near(base.damageFor('flame'), lv1 * B.FLAME_DAMAGE_PER_LEVEL);
});
