import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateValue, calculateDamage, effectiveCooldown, runScore, formatNumber, withFamily } from '../src/tl003/Combat.ts';
import { DefenseRun, FIELD, THROWABLE, damageSource, freshStatus, meterThreshold } from '../src/tl003/Run.ts';
import { MERCENARIES, CARDS, SKILLS, ENEMIES } from '../src/tl003/Content.ts';
import { LocalMetaMirror, META_KEY, emptyMeta, normalizeMeta } from '../src/tl003/Meta.ts';
import { project, unproject, projectedCircle } from '../src/tl003/Projection.ts';
import * as B from '../src/tl003/Balance.ts';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const mods = [
  { kind: 'Flat', tags: ['Damage.Kinetic'], value: 2 },
  { kind: 'Add', tags: ['Damage.Kinetic'], value: .2 },
  { kind: 'Add', tags: ['Damage.Kinetic'], value: .3 },
  { kind: 'More', tags: ['Damage.Kinetic'], value: 2 },
  { kind: 'More', tags: ['Skill.Active'], value: 1.2 },
];
function enemy(overrides = {}) {
  return { id: 9999, kind: 'walker', x: 500, y: 220, hp: 200, maxHp: 200, defense: 0, speed: 0, attack: 0,
    reward: 3, xp: 1, ...freshStatus(),
    hitFlash: 0, ...overrides };
}
// Unit tests start with the opening skill ready; the deployment charge has its own test.
function running() { const run = new DefenseRun(123); run.start(); run.skills[0].cooldown = 0; return run; }
const R = MERCENARIES.rifle.damage;
/** A throwable's damage to one target per cast at the opening skill power (R), from the THROWABLE table. */
const T = id => R * THROWABLE[id] * (B.SKILL_TUNING[id] ?? 1);
/** Card magnitudes at their base rarity, so the tests follow balance changes. */
const V = id => CARDS.find(c => c.id === id).value;
function choose(run, id) { run.phase = 'choice'; run.choices = [CARDS.find(c => c.id === id)]; assert.equal(run.choose(id), true); }
function simulate(seed, active = false) {
  const run = new DefenseRun(seed); run.start();
  for (let i = 0; i < 60 * 180 && run.phase !== 'over'; i++) {
    if (run.phase === 'choice') run.choose(run.choices.find(c => c.id === 'kinetic')?.id ?? run.choices[0].id);
    if (run.phase === 'intermission') run.nextStage();
    if (active && run.elapsed >= 23 && run.skills[0].cooldown === 0) run.cast(0, 690, 230);
    run.advance(1 / 60);
  }
  return run;
}

test('TL003 Flat / Add / More use tag matching and independent multiplication', () => {
  near(calculateValue(10, ['Damage.Kinetic', 'Skill.Active'], mods), 43.2);
  near(calculateValue(10, ['Damage.Fire'], mods), 10);
  near(calculateValue(10, ['Damage.Fire'], [{ kind: 'More', tags: ['Damage.Fire', 'Skill.Active'], value: 3 }]), 10);
});
test('TL003 Toxin lowers armor, resistance cuts elements, and Electric multiplies damage after either', () => {
  // Armor 100 − toxin 50 → ×1/1.5 for physical hits; resistance 1/3 → ×2/3 for elemental ones (the burn).
  const target = { defense: 100, toxin: 50, resist: 1 / 3, vulnerability: 1.25 };
  for (const tags of [['Damage.Kinetic'], ['Damage.Fire', 'Mechanic.DOT']]) {
    const value = calculateDamage({ baseDamage: 100, tags }, target);
    near(value.effectiveDefense, 50); near(value.shockMultiplier, 1.25); near(value.final, 100 / 1.5 * 1.25);
  }
  const late = calculateDamage({ baseDamage: 100, tags: [] }, { defense: 100, toxin: 1e20 });
  near(late.effectiveDefense, 0); near(late.final, 100);
});
test('TL003 two defenses: armor stops physical hits, resistance stops elemental ones, hybrids take the weaker', () => {
  const hazmat = { defense: 10, toxin: 0, resist: 0.75 }, armored = { defense: 130, toxin: 0, resist: 0 };
  near(calculateDamage({ baseDamage: 100, tags: ['Damage.Fire'] }, hazmat).final, 25);
  near(calculateDamage({ baseDamage: 100, tags: ['Damage.Kinetic'] }, hazmat).final, 100 / 1.1);
  near(calculateDamage({ baseDamage: 100, tags: ['Damage.Cold'] }, armored).final, 100);
  near(calculateDamage({ baseDamage: 100, tags: ['Damage.Blast'] }, armored).final, 100 / 2.3);
  near(calculateDamage({ baseDamage: 100, tags: ['Damage.Kinetic', 'Damage.Cold'] }, hazmat).final, 100 / 1.1);
  near(calculateDamage({ baseDamage: 100, tags: ['Damage.Electric'] }, { defense: 0, toxin: 0, resist: 5 }).final, 5, 'resistance tops out at 95%');
  const run = running(); run.stage = 10; run.advance(FIELD.step);
  for (let i = 0; i < 400 && !run.enemies.some(e => e.kind === 'hazmat'); i++) { run.mercenaries[0].shotTimer = 1e9; if (run.phase === 'choice') run.choose(run.choices[0].id); run.advance(FIELD.step); }
  const spawned = run.enemies.find(e => e.kind === 'hazmat'); assert.ok(spawned, 'hazmat zombies join the horde'); near(spawned.resist, 0.75);
});
test('TL003 element families: one Elemental or Physical modifier raises all three of its elements', () => {
  const mods = [{ kind: 'Add', tags: ['Damage.Elemental'], value: 1 }, { kind: 'Add', tags: ['Damage.Physical'], value: 0.5 }];
  for (const t of ['Fire', 'Cold', 'Electric']) near(calculateValue(10, withFamily([`Damage.${t}`]), mods), 20);
  for (const t of ['Kinetic', 'Toxin', 'Blast']) near(calculateValue(10, withFamily([`Damage.${t}`]), mods), 15);
  // A hybrid hit belongs to both families and takes both bonuses once each.
  near(calculateValue(10, withFamily(['Damage.Kinetic', 'Damage.Cold']), mods), 25);
  assert.deepEqual(withFamily(withFamily(['Damage.Fire'])), ['Damage.Fire', 'Damage.Elemental']);
});
test('TL003 matching Special rules are returned as ammo rules, not as extra damage types', () => {
  const result = calculateDamage({ baseDamage: 10, tags: ['Skill.AutoAttack', 'Damage.Kinetic'] }, enemy(), [CARDS.find(c => c.id === 'bio').modifier]);
  assert.equal(result.specials[0].rule, 'toxin'); assert.ok(!MERCENARIES.rifle.tags.includes('Damage.Explosive'));
});
test('TL003 haste has no hard cap or minimum cooldown', () => {
  near(effectiveCooldown(30, 100), 15); near(effectiveCooldown(30, 2900), 1);
  assert.ok(effectiveCooldown(30, 1e9) < .00001); assert.ok(effectiveCooldown(30, 1e12) < effectiveCooldown(30, 1e9));
});
test('TL003 numeric format is separate from gameplay and follows k m b A B', () => {
  assert.deepEqual([985,1250,86400000,3.27e9,11.5e12,2.08e15,1e90].map(formatNumber), ['985','1.25k','86.4m','3.27b','11.5A','2.08B','1AA']);
});
test('TL003 ready, pause, choice and game over never advance combat or cooldowns', () => {
  const run = new DefenseRun(1); run.advance(5); assert.equal(run.elapsed, 0); run.start(); run.start(); assert.equal(run.mercenaries.length, 1);
  run.cast(0, 400, 230); run.pause(); const cooldown = run.skills[0].cooldown;
  run.advance(5); assert.equal(run.elapsed, 0); assert.equal(run.skills[0].cooldown, cooldown);
  run.resume(); run.advance(1); near(run.elapsed, 1);
  run.phase = 'over'; run.advance(20); near(run.elapsed, 1); assert.equal(run.recruit('flame'), false); assert.equal(run.cast(0,400,230), false);
});
test('TL003 recruitment is free, never exceeds three and refuses a second copy of a kind', () => {
  const run = running(); run.money = 1000;
  assert.equal(run.recruit('rifle'), false, 'one of each kind without 制式部隊');
  assert.equal(run.recruit('cryo'), true); assert.equal(run.recruit('chemist'), true); assert.equal(run.recruit('tesla'), false);
  assert.equal(run.money, 1000);
  const before = run.damageFor('rifle'); run.upgrade('rifle');
  assert.equal(run.levels.rifle, 2); near(run.damageFor('rifle'), before * B.MERC_DAMAGE_PER_LEVEL);
  assert.equal(run.upgradeCost('rifle'), Math.ceil(B.UPGRADE_BASE_COST * 1.15 ** 2));
  assert.equal(run.upgrade('tesla'), false);
});
test('TL003 milestone boosts at 10/25/50 coexist with shared levels', () => {
  const run = running(); run.levels.rifle = 10; near(run.damageFor('rifle'), R * B.MERC_DAMAGE_PER_LEVEL ** 9 * B.MILESTONE_LV10);
  run.levels.rifle = 25; near(run.intervalFor('rifle'), MERCENARIES.rifle.interval / B.MILESTONE_LV25_SPEED);
  run.levels.rifle = 50; near(run.damageFor('rifle'), R * B.MERC_DAMAGE_PER_LEVEL ** 49 * B.MILESTONE_LV10 * B.MILESTONE_LV50);
  // The flamer grows on its own (smaller) curve; the sniper fires at its attack-speed tuning.
  run.levels.flame = 10; near(run.damageFor('flame'), MERCENARIES.flame.damage * B.FLAME_DAMAGE_PER_LEVEL ** 9 * B.MILESTONE_LV10);
  near(run.intervalFor('sniper'), MERCENARIES.sniper.interval / B.MERC_SPEED_TUNING.sniper);
  near(run.skillPower, run.damageFor('rifle'), 'skills follow the highest mercenary level');
});
test('TL003 money spending does not change total earnings or score; XP cannot be spent', () => {
  const run = running(); run.money = 200; run.totalEarnedMoney = 200; run.xp = 2;
  const score = run.score; assert.equal(run.upgrade('rifle'), true);
  assert.equal(run.totalEarnedMoney, 200); assert.equal(run.score, score); assert.equal(run.xp, 2);
  assert.equal(runScore(65, 999), 5);
});
test('TL003 repair and fortification charge funds, cap health and cannot buy at Game Over', () => {
  const run = running(); run.money = 100; run.wallHealth = 10;
  assert.equal(run.repair(), true); near(run.wallHealth, 10 + 40 * B.REPAIR_FRACTION); near(run.money, 100 - B.REPAIR_BASE_COST);
  const gain = 40 * B.FORTIFY_HEALTH_GAIN;
  assert.equal(run.fortify(), true); near(run.wallMaxHealth, 40 + gain); near(run.wallHealth, 10 + 40 * B.REPAIR_FRACTION + gain); near(run.money, 100 - B.REPAIR_BASE_COST - B.FORTIFY_BASE_COST);
  run.wallHealth = run.wallMaxHealth; assert.equal(run.repair(), false);
  run.phase = 'over'; assert.equal(run.fortify(), false);
});
test('TL003 auto attacks award exactly one bounty and XP per dead target', () => {
  const run = running(); run.enemies = [enemy({ hp: 1 })]; run.advance(FIELD.step);
  assert.equal(run.kills, 1); near(run.money, 3); assert.equal(run.xp, 1);
  run.advance(FIELD.step); assert.equal(run.kills, 1); near(run.totalEarnedMoney, 3);
});
test('TL003 hits under 0.1% of max HP still count but make no damage event', () => {
  const run = running(); const giant = enemy({ hp: 1e9, maxHp: 1e9 }); run.enemies = [giant]; run.advance(FIELD.step);
  near(1e9 - giant.hp, R); assert.equal(run.events.filter(e => e.kind === 'hit').length, 0);
  const small = running(); const walker = enemy({ hp: 200, maxHp: 200 }); small.enemies = [walker]; small.advance(FIELD.step);
  assert.equal(small.events.filter(e => e.kind === 'hit').length, 1);
});
test('TL003 a level-up is banked mid-battle; its pick opens after the stage and freezes time until a valid choice', () => {
  const run = running(); run.wallHealth = run.wallMaxHealth = 1e12; run.xp = B.xpForLevel(1); run.advance(FIELD.step);
  assert.equal(run.phase, 'running'); assert.equal(run.level, 2); assert.equal(run.pendingPicks, 1); assert.equal(run.choices.length, 0);
  // Run the clock out on an empty road: the stage ends on the next frame.
  run.stageTime = run.stageLength; run.enemies = []; run.advance(FIELD.step);
  assert.equal(run.phase, 'choice'); assert.equal(run.pendingPicks, 0); assert.equal(run.choices.length, 3); assert.equal(new Set(run.choices.map(c => c.id)).size, 3);
  const elapsed = run.elapsed; run.advance(40); assert.equal(run.elapsed, elapsed);
  assert.equal(run.choose('invalid'), false); assert.equal(run.choose(run.choices[0].id), true);
  assert.equal(run.phase, 'intermission'); run.advance(40); assert.equal(run.elapsed, elapsed, 'the rest does not run the clock');
  assert.equal(run.nextStage(), true); run.advance(FIELD.step); near(run.elapsed, elapsed + FIELD.step);
});
test('TL003 Kinetic, Burn, Toxin, Shock and Chill ammo affect actual live enemies', () => {
  for (const id of ['kinetic','burn','bio','shock','chill']) {
    const run = running(); choose(run,id); const target = enemy({ hp: 1e6, maxHp: 1e6, defense: 50 }), side = enemy({ id: 10000, x: 480, hp: 1e6, maxHp: 1e6 }); run.enemies = [target, side]; run.advance(FIELD.step);
    if(id==='kinetic') near(1e6-target.hp,R*(1+V('kinetic'))*100/150);
    // Burn ammo: a fire hit of the shot × value (elemental: armor 50 does not apply) that fills the ignite meter.
    if(id==='burn') { near(1e6-target.hp,R*100/150+R*V('burn')); near(target.meters.ignite.value,R*V('burn')*B.STATUS.ignite.rate); }
    // The rifle's hit lands first (defense 50), then the ammo adds toxin.
    if(id==='bio') { near(target.toxin,V('bio')); near(1e6-target.hp,R*100/150); }
    // Electric and cold ammo add a second, smaller hit of their element; that hit fills its meter.
    // The extra hit is elemental: armor does not stop it (the target has no resistance).
    if(id==='shock') { near(1e6-target.hp,R*100/150+R*V('shock')); assert.ok(target.meters.shock.value>0); }
    if(id==='chill') { near(1e6-target.hp,R*100/150+R*V('chill')); assert.ok(target.meters.chill.value>0); }
  }
});
test('TL003 a full meter triggers its control once, and recent triggers raise the threshold by +200%', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; const target = enemy({ hp: 1e6, maxHp: 1e6, speed: 40 }); run.enemies = [target];
  const base = meterThreshold(target, 'chill', run.elapsed); near(base, 1e6 * B.STATUS.chill.threshold);
  target.meters.chill.value = base * 0.5; run.advance(FIELD.step);
  near(target.x, 500 + 40 * FIELD.step * (1 - B.STATUS.chill.slow * 0.5), 'half a meter slows by a quarter');
  target.meters.chill.value = base; run.learn('cryobomb'); run.cast(1, 500, 220);
  assert.ok(run.isFrozen(target)); near(target.meters.chill.value, 0); near(target.meters.chill.count, 1);
  near(meterThreshold(target, 'chill', run.elapsed), base * 3);
  const x = target.x; run.advance(1); near(target.x, x, 'frozen zombies stand still');
  run.advance(B.STATUS.chill.duration); assert.ok(!run.isFrozen(target)); assert.ok(target.x > x);
  // Ten quiet seconds reset the chain.
  run.advance(B.STATUS_WINDOW + 0.1); near(meterThreshold(target, 'chill', run.elapsed), base);
});
test('TL003 paralysis stops biting but not walking; freeze and stun stop walking but not biting', () => {
  const at = FIELD.wallX - 18;
  for (const [kind, bites, walks] of [['shock', false, true], ['chill', true, false], ['stun', true, false]]) {
    const run = running(); run.mercenaries[0].shotTimer = 1e9; run.wallHealth = run.wallMaxHealth = 1000;
    const biter = enemy({ x: at, attack: 10, hp: 1e9, maxHp: 1e9 }), walker = enemy({ id: 10000, x: 300, speed: 40, hp: 1e9, maxHp: 1e9 });
    biter.meters[kind].timer = 5; walker.meters[kind].timer = 5; run.enemies = [biter, walker]; run.advance(1);
    assert.equal(run.wallHealth < 1000, bites, `${kind} bites`); assert.equal(walker.x > 300, walks, `${kind} walks`);
  }
});
test('TL003 toxin reaching a zombie\'s defense detonates it once for 5% of its max HP around it', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; run.recruit('chemist'); run.mercenaries[1].shotTimer = 0;
  // The chemist shoots the zombie nearest the wall (x 620); its neighbour only takes the burst.
  const target = enemy({ x: 620, hp: 1000, maxHp: 1000, defense: 5 }), side = enemy({ id: 10000, x: 600, hp: 1000, maxHp: 1000 }); run.enemies = [target, side];
  run.advance(FIELD.step); assert.ok(target.toxinBurst);
  near(1000 - side.hp, 1000 * B.TOXIN_BURST); assert.ok(run.events.some(e => e.kind === 'toxic'));
  const hp = side.hp; run.mercenaries[1].shotTimer = 0; run.advance(FIELD.step); near(side.hp, hp, 'no second burst from the same zombie');
});
test('TL003 ranges: the flamer waits for close enemies, the electric gunner reaches the whole road', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; run.recruit('flame'); run.recruit('tesla');
  const far = enemy({ x: 0, hp: 1e6, maxHp: 1e6 }); run.enemies = [far];
  run.mercenaries.forEach(m => { m.shotTimer = 0; }); run.mercenaries[0].shotTimer = 1e9; run.advance(FIELD.step);
  assert.equal(far.meters.ignite.value, 0, 'out of the flamer\'s reach'); assert.ok(far.hp < 1e6, 'the tesla hits at the spawn line');
  assert.ok(MERCENARIES.tesla.range > MERCENARIES.rifle.range && MERCENARIES.rifle.range > MERCENARIES.flame.range);
});
test('TL003 patterns: the flamer burns a cone, the grenadier splashes, the signaller chains', () => {
  // toxinBurst: the signaller's toxin must not set off bursts that would touch the whole group.
  const close = i => enemy({ id: 20000 + i, x: 700 - i * 10, y: 220 + i * 5, hp: 1e6, maxHp: 1e6, toxinBurst: true });
  for (const [kind, expected] of [['flame', 4], ['grenadier', 5], ['signal', 3]]) {
    const run = running(); run.mercenaries[0].shotTimer = 1e9; run.recruit(kind); run.mercenaries[1].shotTimer = 0;
    run.enemies = Array.from({ length: 5 }, (_, i) => close(i)); run.advance(FIELD.step);
    // Only the five placed zombies (a natural spawn may join the list this frame).
    const touched = run.enemies.filter(e => e.id >= 20000 && e.hp < 1e6).length;
    assert.equal(touched, expected, `${kind} reached ${touched}`);
  }
});
test('TL003 the Fire DOT card strengthens burn ticks only, not the burn ammo\'s direct fire hit', () => {
  const run = running(); choose(run,'burn'); choose(run,'fire'); const target = enemy({ hp: 1e6, maxHp: 1e6 }); run.enemies=[target]; run.advance(FIELD.step);
  near(1e6-target.hp,R*(1+V('burn'))); run.mercenaries[0].shotTimer=100;
  target.meters.ignite.value=meterThreshold(target,'ignite',run.elapsed); target.meters.ignite.value-=1e-9; run.mercenaries[0].shotTimer=0; run.advance(FIELD.step); run.mercenaries[0].shotTimer=100;
  assert.ok(run.isBurning(target)); const hp=target.hp; run.advance(1); near(hp-target.hp,1e6*B.STATUS.ignite.tick*(1+V('fire')));
});
test('TL003 Toxin expires on its own clock; an unfed meter drains after a short pause', () => {
  const run=running(); const target=enemy({toxin:2,toxinDuration:.2,hp:1e6,maxHp:1e6}); target.meters.shock.value=1000; run.enemies=[target]; run.mercenaries[0].shotTimer=100;
  run.advance(.3); near(target.toxin,0); near(target.meters.shock.value,1000);
  run.advance(B.METER_IDLE); assert.ok(target.meters.shock.value<1000);
});
test('TL003 Grenade uses Blast + Active modifiers, AOE geometry, knockback and cooldown', () => {
  const run=running(); choose(run,'blastDmg'); choose(run,'active'); const a=enemy({hp:1e6,maxHp:1e6}), b=enemy({id:10000,x:650}); run.enemies=[a,b];
  assert.equal(run.cast(0,500,220),true); near(1e6-a.hp,T('grenade')*(1+V('blastDmg')+V('active'))); near(b.hp,200); near(a.x,460); near(run.skills[0].cooldown,SKILLS.grenade.cooldown);
  assert.ok(a.meters.stun.value>0,'blast fills the stun meter'); assert.equal(run.cast(0,500,220),false);
});
test('TL003 invalid drag releases do not consume cooldown; haste applies to valid casts', () => {
  const run=running(); for(const [x,y] of [[-1,200],[751,200],[200,64],[200,391],[NaN,200],[200,Infinity]]) assert.equal(run.cast(0,x,y),false);
  near(run.skills[0].cooldown,0); run.haste=2900; assert.equal(run.cast(0,500,220),true); near(run.skills[0].cooldown,SKILLS.grenade.cooldown/30);
});
test('TL003 Molotov pulses go through the shared resistance/shock calculator and honor Active tags', () => {
  // Fire is elemental: resistance 1/3 (not armor) gives the ×1/1.5; a half-full shock meter adds +25%.
  const run=running(); run.learn('molotov'); choose(run,'active'); const target=enemy({defense:100,resist:1/3,toxin:50,toxinDuration:10,toxinBurst:true,hp:1000,maxHp:1000});run.enemies=[target];
  target.meters.shock.value=0.5*meterThreshold(target,'shock',0);
  run.mercenaries.forEach(m=>m.shotTimer=100); assert.equal(run.cast(1,500,220),true);
  // The cast is the first pulse; the next comes a second later, not on contact.
  const pulse=T('molotov')/6*(1+V('active'))/1.5*1.25; near(1000-target.hp,pulse);
  run.advance(.5); near(1000-target.hp,pulse); assert.equal(run.zones.length,1); run.advance(6); assert.equal(run.zones.length,0);
});
test('TL003 area falloff: instant blasts split a budget over a crowd and only touch the nearest ones', () => {
  const crowd = (n, spread) => Array.from({ length: n }, (_, i) => enemy({ id: 30000 + i, x: 500 + (i % 10) * spread - 4.5 * spread, y: 225 + Math.floor(i / 10) * spread - spread, hp: 1e6, maxHp: 1e6 }));
  const { full, cap } = B.AREA.skill;
  // Up to the budget: full damage each.
  const small = running(); small.enemies = crowd(full, 6); small.cast(0, 500, 225);
  for (const e of small.enemies) near(1e6 - e.hp, T('grenade'));
  // A bigger crowd inside the radius splits the same total.
  const big = running(); big.enemies = crowd(30, 6); big.cast(0, 500, 225);
  for (const e of big.enemies) near(1e6 - e.hp, T('grenade') * full / 30);
  // Past the cap, only the nearest are processed; the outer ring is untouched.
  const huge = running(); huge.enemies = crowd(60, 6); huge.cast(0, 500, 225);
  const hurt = huge.enemies.filter(e => e.hp < 1e6);
  assert.equal(hurt.length, cap); for (const e of hurt) near(1e6 - e.hp, T('grenade') * full / cap);
  const far = Math.min(...hurt.map(e => Math.hypot(e.x - 500, e.y - 225)));
  assert.ok(huge.enemies.filter(e => e.hp === 1e6).every(e => Math.hypot(e.x - 500, e.y - 225) >= far), 'the untouched ones are the farthest');
});
test('TL003 area falloff: auto-attack splash uses the smaller budget; lingering zones touch at most ZONE_CAP', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; run.recruit('grenadier'); run.mercenaries[1].shotTimer = 0;
  run.enemies = Array.from({ length: 10 }, (_, i) => enemy({ id: 31000 + i, x: 700 - (i % 5) * 6, y: 225 + Math.floor(i / 5) * 6, hp: 1e6, maxHp: 1e6, toxinBurst: true }));
  run.advance(FIELD.step);
  for (const e of run.enemies.filter(e => e.id >= 31000)) near(1e6 - e.hp, run.damageFor('grenadier') * B.AREA.auto.full / 10);
  const fire = running(); fire.learn('molotov');
  fire.enemies = Array.from({ length: 30 }, (_, i) => enemy({ id: 32000 + i, x: 500 + (i % 6) * 12 - 30, y: 225 + Math.floor(i / 6) * 12 - 24, hp: 1e6, maxHp: 1e6 }));
  fire.cast(1, 500, 225);
  // Every pulse hits the same nearest ZONE_CAP at full strength.
  const lit = fire.enemies.filter(e => e.hp < 1e6); assert.equal(lit.length, B.ZONE_CAP);
  for (const e of lit) near(1e6 - e.hp, T('molotov') / 6);
  fire.mercenaries[0].shotTimer = 1e9; fire.advance(1);
  assert.equal(fire.enemies.filter(e => e.id >= 32000 && e.hp < 1e6).length, B.ZONE_CAP);
  for (const e of lit) near(1e6 - e.hp, 2 * T('molotov') / 6);
});
test('TL003 lingering zones: gas settles once a second for six seconds (poison + toxin hit); strafe is three kinetic hits', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; run.learn('gas');
  const target = enemy({ x: 500, y: 225, hp: 1e6, maxHp: 1e6, toxinBurst: true }); run.enemies = [target];
  run.cast(1, 500, 225); near(target.toxin, 6); near(1e6 - target.hp, T('gas') / 6);
  run.advance(0.5); near(target.toxin, 6, 'no contact damage');
  run.advance(7); near(target.toxin, 36); near(1e6 - target.hp, T('gas')); assert.equal(run.zones.length, 0);
  const s = running(); s.mercenaries[0].shotTimer = 1e9; s.learn('strafe');
  // Small enough that each hit makes an event (hits under 0.1% of max HP do not).
  const H = T('strafe') * 100, t = enemy({ x: 500, hp: H, maxHp: H }); s.enemies = [t];
  s.cast(1, 500, 225); near(H - t.hp, T('strafe'));
  const hits = s.events.filter(e => e.kind === 'hit' && e.target === t.id); assert.equal(hits.length, 3); for (const h of hits) near(h.amount, T('strafe') / 3);
});
test('TL003 spikes bite back once a second; a paralysis burst is B.STATUS.shock.burst of max HP', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; choose(run, 'spikes'); const chewer = enemy({ x: FIELD.wallX - 18, hp: 1e6, maxHp: 1e6 }); run.enemies = [chewer];
  run.advance(0.9); near(chewer.hp, 1e6);
  run.advance(0.2); near(1e6 - chewer.hp, V('spikes') * R);
  run.advance(1); near(1e6 - chewer.hp, 2 * V('spikes') * R);
  const emp = running(); emp.mercenaries[0].shotTimer = 1e9; emp.learn('emp'); const t = enemy({ hp: 1e6, maxHp: 1e6 }); emp.enemies = [t];
  emp.cast(1, 500, 220); assert.ok(emp.isParalyzed(t));
  near(emp.stats.damage.shockburst, 1e6 * B.STATUS.shock.burst, 'a flat share: the burst lands before the paralysis bonus');
});
test('TL003 hit events carry the element of their first damage type, for the damage-number colour', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9; run.recruit('flame'); run.recruit('sniper');
  const target = enemy({ x: 640, hp: 1000, maxHp: 1000 }); run.enemies = [target];
  run.mercenaries.forEach(m => m.shotTimer = 0); run.advance(FIELD.step);
  const elements = new Set(run.events.filter(e => e.kind === 'hit').map(e => e.element));
  assert.ok(elements.has('kinetic') && elements.has('fire'), [...elements].join());
  const cold = running(); cold.learn('cryobomb'); const c = enemy({ hp: 1000, maxHp: 1000 }); cold.enemies = [c]; cold.mercenaries[0].shotTimer = 1e9; cold.cast(1, 500, 220);
  assert.ok(cold.events.some(e => e.kind === 'hit' && e.element === 'cold'));
});
test('TL003 Laser hits only enemies along the aimed direction, fills the shock meter and pierces', () => {
  const run=running(); run.learn('laser'); const big={hp:1e6,maxHp:1e6}; const a=enemy({x:500,y:222,...big}), b=enemy({id:10000,x:350,y:222,...big}), c=enemy({id:10001,x:500,y:350,...big}); run.enemies=[a,b,c];
  assert.equal(run.cast(1,200,222),true); assert.ok(a.hp<1e6&&b.hp<1e6);near(c.hp,1e6);assert.ok(a.meters.shock.value>0);near(run.skills[1].cooldown,45);
});
test('TL003 skills are decoupled from mercenaries: three slots, each on its own cooldown', () => {
  const run=running(); assert.equal(run.learn('gas'),true); assert.equal(run.learn('emp'),true); assert.equal(run.learn('mortar'),false); assert.equal(run.learn('gas'),false);
  assert.equal(run.mercenaries.length,1,'no mercenary came with a skill');
  for (let slot=0; slot<3; slot++) assert.equal(run.cast(slot,400,200),true);
  assert.deepEqual(run.skills.map(s=>s.cooldown),[SKILLS.grenade.cooldown,SKILLS.gas.cooldown,SKILLS.emp.cooldown]);
  for (const id of Object.keys(SKILLS)) { const r=running(); r.skills[0]={id,cooldown:0}; r.enemies=[enemy({hp:1e6,maxHp:1e6,x:400,y:200})]; assert.equal(r.cast(0,400,200),true,id);
    // Mortar shells land at random points of the area: count the shells instead of requiring a hit.
    if (id==='mortar') { assert.equal(r.events.filter(e=>e.kind==='blast').length,5); continue; }
    r.advance(1); assert.ok(r.enemies[0].hp<1e6||r.mines.length>0,`${id} did something`); }
});
test('TL003 stage lengths grow a little each stage up to a cap; bosses on 4, 7, …, 19 and a super boss on the last stage', () => {
  assert.equal(B.STAGE_COUNT, 20);
  for (let n = 1; n <= B.STAGE_COUNT; n++) near(B.stageSeconds(n), Math.min(B.STAGE_MAX_SECONDS, B.STAGE_FIRST_SECONDS + B.STAGE_STEP_SECONDS * (n - 1)));
  // About a quarter of an hour of clocks for the whole run (mop-ups and boss fights come on top).
  const clocks = Array.from({ length: B.STAGE_COUNT }, (_, i) => B.stageSeconds(i + 1)).reduce((a, b) => a + b, 0);
  assert.ok(clocks >= 600 && clocks <= 840, `${clocks} s of stage clocks`);
  assert.deepEqual(Array.from({ length: B.STAGE_COUNT }, (_, i) => i + 1).filter(B.isBossStage), [4, 7, 10, 13, 16, 19, 20]);
  const run = running(); assert.equal(run.stage, 1); assert.equal(run.wave, 1); assert.equal(run.clearedWave, 0); near(run.stageLength, B.stageSeconds(1));
  for (const old of ['BOSS_FIRST_SECONDS', 'BOSS_INTERVAL_SECONDS', 'BOSS_RUSH_HP_GROWTH']) assert.equal(old in B, false, `${old} is gone`);
});
test('TL003 a normal stage stops spawning when its clock runs out, then ends on a clear road with a bonus and the banked picks', () => {
  const run = running(); run.wallHealth = run.wallMaxHealth = 1e12; run.mercenaries[0].shotTimer = 1e9;
  run.xp = B.xpForLevel(1) + B.xpForLevel(2); run.advance(FIELD.step); assert.equal(run.pendingPicks, 2); assert.equal(run.phase, 'running');
  run.advance(B.stageSeconds(1)); assert.equal(run.phase, 'running', 'zombies are still on the road'); near(run.stageLeft, 0);
  assert.equal(run.bossWarning, undefined); assert.equal(run.boss, undefined, 'no boss on a normal stage');
  const alive = run.enemies.length; assert.ok(alive > 0); run.advance(3); assert.equal(run.enemies.length, alive, 'no spawns after the clock');
  // Clear the road by hand; a lingering zone fades, a mine stays.
  run.enemies = []; run.zones.push({ kind: 'gas', x: 400, y: 225, radius: 50, remaining: 6, power: 1, pulseTimer: 1, contacts: new Set() });
  run.mines.push({ x: 400, y: 225, damage: 1 });
  const money = run.money, xp = run.xp; run.advance(FIELD.step);
  const share = B.stageSeconds(1) / 30;
  near(run.money - money, calculateValue(5 * share * B.WAVE_REWARD_GROWTH_PER_MINUTE ** run.pace, ['Economy.WaveReward'], run.modifiers));
  assert.equal(run.xp - xp, Math.round(2 * share)); assert.equal(run.level, 3, 'the clear bonus XP alone does not level here');
  assert.equal(run.zones.length, 0); assert.equal(run.mines.length, 1);
  // Two banked picks, one after the other, each with its own reroll; then the rest.
  assert.equal(run.phase, 'choice'); assert.equal(run.pendingPicks, 1); assert.equal(run.clearedWave, 1);
  run.money = 1e6; assert.equal(run.reroll(), true); assert.equal(run.reroll(), false);
  assert.equal(run.choose(run.choices[0].id), true); assert.equal(run.phase, 'choice'); assert.equal(run.pendingPicks, 0);
  assert.equal(run.canReroll, true, 'a new pick allows a new reroll'); assert.equal(run.reroll(), true);
  assert.equal(run.choose(run.choices[0].id), true); assert.equal(run.phase, 'intermission'); assert.equal(run.clearedWave, 1);
  assert.equal(run.nextStage(), true); assert.equal(run.stage, 2); assert.equal(run.wave, 2); assert.equal(run.clearedWave, 1);
  near(run.stageLength, B.stageSeconds(2)); near(run.stageTime, 0);
});
test('TL003 start(true) opens with a rest: stage 0, one pick, then shopping until the first stage starts', () => {
  const run = new DefenseRun(123); run.start(true);
  assert.equal(run.stage, 0); assert.equal(run.phase, 'choice'); assert.equal(run.pendingPicks, 0); assert.equal(run.choices.length, 3);
  assert.equal(run.choices.filter(c => c.kind === 'merc').length, 2, 'the opening pick offers two recruits');
  run.advance(5); assert.equal(run.elapsed, 0); assert.equal(run.upgrade('rifle'), false, 'no shopping while a card is up');
  run.money = 1e6; assert.equal(run.reroll(), true); assert.equal(run.reroll(), false, 'one reroll per pick');
  assert.equal(run.choose(run.choices.find(c => c.kind === 'merc').id), true); assert.equal(run.mercenaries.length, 2);
  assert.equal(run.phase, 'intermission'); assert.equal(run.clearedWave, 0); run.advance(5); assert.equal(run.elapsed, 0);
  // The shop is open in the rest (and in battle).
  assert.equal(run.upgrade('rifle'), true); assert.equal(run.fortify(), true); run.wallHealth = 1; assert.equal(run.repair(), true);
  assert.equal(run.nextStage(), true); assert.equal(run.stage, 1); assert.equal(run.phase, 'running'); assert.equal(run.nextStage(), false);
  run.advance(1); near(run.elapsed, 1); near(run.stageTime, 1); assert.equal(run.upgrade('rifle'), true);
  const plain = new DefenseRun(123); plain.start(); assert.equal(plain.stage, 1); assert.equal(plain.phase, 'running');
});
test('TL003 boss stages: warning, boss and runners when the clock runs out, spawns until the boss is down; the super boss ends the run', () => {
  // v2: everything follows the stage (pace), not the clock.
  const bossHp = stage => ENEMIES.boss.hp * B.ENEMY_HP_SCALE * B.ENEMY_HP_GROWTH_PER_MINUTE ** ((stage - 1) * B.STAGE_PACE_MINUTES) * B.BOSS_HP_FIRST * B.BOSS_HP_PER_STAGE ** (stage - 1);
  const quiet = running(); quiet.stage = 3; quiet.stageTime = quiet.stageLength - 1; quiet.advance(FIELD.step); assert.equal(quiet.bossWarning, undefined, 'no warning on a normal stage');
  const run = running(); run.wallHealth = run.wallMaxHealth = 1e12; run.mercenaries[0].shotTimer = 1e9; run.stage = 4;
  run.stageTime = run.stageLength - B.BOSS_WARNING_SECONDS - 0.5; run.advance(FIELD.step); assert.equal(run.bossWarning, undefined);
  run.advance(1); assert.ok(run.bossWarning > 0 && run.bossWarning <= B.BOSS_WARNING_SECONDS, `${run.bossWarning}`);
  run.stageTime = run.stageLength - FIELD.step / 2; const lastId = Math.max(0, ...run.enemies.map(e => e.id));
  run.advance(FIELD.step); const boss = run.boss; assert.ok(boss, 'the boss charges in'); assert.equal(run.bossWarning, undefined);
  near(boss.maxHp / bossHp(4), 1); assert.ok(!boss.superBoss);
  assert.ok(run.enemies.filter(e => e.id > lastId && e.kind === 'runner').length >= B.BOSS_ESCORT);
  // The horde keeps coming while the boss stands, even with the clock out.
  const before = run.enemies.length; run.advance(10); assert.ok(run.enemies.length > before, 'spawns continue until the boss is down');
  assert.equal(run.phase, 'running'); assert.equal(run.bossDown, false);
  run.boss.hp = 0; run.advance(FIELD.step); assert.equal(run.bossDown, true);
  const left = run.enemies.length; assert.ok(left > 0); run.advance(2); assert.equal(run.enemies.length, left, 'no spawns once the boss is down');
  run.enemies = []; run.advance(FIELD.step); assert.notEqual(run.phase, 'running'); assert.equal(run.clearedWave, 4);
  // The last stage: a super boss; beating it wins.
  const last = running(); last.wallHealth = last.wallMaxHealth = 1e12; last.mercenaries[0].shotTimer = 1e9; last.stage = B.STAGE_COUNT;
  last.stageTime = last.stageLength - FIELD.step / 2; const lastBefore = Math.max(0, ...last.enemies.map(e => e.id)); last.advance(FIELD.step);
  const sup = last.boss; assert.ok(sup && sup.superBoss); near(sup.maxHp / (bossHp(B.STAGE_COUNT) * B.SUPER_BOSS_HP), 1);
  near(sup.attack, ENEMIES.boss.attack * B.ENEMY_ATTACK_GROWTH_PER_MINUTE ** last.pace * B.SUPER_BOSS_ATTACK);
  assert.ok(last.enemies.filter(e => e.id > lastBefore && e.kind === 'runner').length >= B.SUPER_BOSS_ESCORT);
  sup.hp = 0; last.advance(FIELD.step); last.enemies = []; last.advance(FIELD.step);
  assert.equal(last.phase, 'victory'); assert.equal(last.clearedWave, B.STAGE_COUNT);
  const time = last.elapsed; last.advance(10); assert.equal(last.elapsed, time); assert.equal(last.nextStage(), false);
});
test('TL003 past ENEMY_CAP alive zombies a new one merges into the nearest of its kind; bosses always join', () => {
  const run = running(); run.mercenaries[0].shotTimer = 1e9;
  run.enemies = Array.from({ length: B.ENEMY_CAP }, (_, i) => enemy({ id: 40000 + i, x: 20 + (i % 60) * 10, y: 100 + (i % 26) * 10, hp: 50, maxHp: 50, reward: 3, xp: 1 }));
  const total = run.enemies.reduce((sum, e) => sum + e.maxHp, 0), hp = ENEMIES.walker.hp * B.ENEMY_HP_SCALE;
  run.spawn('walker'); assert.equal(run.enemies.length, B.ENEMY_CAP);
  const host = run.enemies.find(e => e.merged); assert.ok(host); assert.equal(host.merged, 2);
  near(host.maxHp, 50 + hp); near(host.hp, 50 + hp); near(host.reward, 3 + ENEMIES.walker.reward); assert.equal(host.xp, 1 + ENEMIES.walker.xp);
  near(run.enemies.reduce((sum, e) => sum + e.maxHp, 0), total + hp);
  assert.equal(host.x, 20, 'it joins a walker nearest the spawn line');
  run.spawn('runner'); assert.equal(run.enemies.length, B.ENEMY_CAP + 1, 'no runner to merge into: it spawns');
  run.spawn('boss'); assert.equal(run.enemies.length, B.ENEMY_CAP + 2, 'a boss is never merged');
});
test('TL003 enemy difficulty is independent of permanent player progress and supports six enemy types', () => {
  const a=running(),b=running();b.modifiers.push({kind:'More',tags:['Damage.Kinetic'],value:1e10});
  a.advance(FIELD.step);b.advance(FIELD.step);near(a.enemies[0].maxHp,b.enemies[0].maxHp);near(a.enemies[0].speed,b.enemies[0].speed);
  const kinds=new Set();for(let seed=1;seed<=128;seed++){const r=new DefenseRun(Math.imul(seed,2654435761));r.start();r.stage=8;r.advance(FIELD.step);kinds.add(r.enemies[0].kind);}assert.equal(kinds.size,6);
});
test('TL003 first-run baseline (no upgrades, no skills) ends before the first boss after a handful of kills', () => {
  const runs=Array.from({length:128},(_,i)=>simulate(Math.imul(i+1,2654435761)));
  // Recruit cards are free since 2026-10-23, so even a no-play run fields a squad; it still never beats the first boss stage.
  assert.ok(runs.every(r=>r.phase==='over'&&r.elapsed>=20&&r.stage<=B.BOSS_FIRST_STAGE&&r.clearedWave<B.BOSS_FIRST_STAGE), runs.map(r=>`${r.stage}@${r.elapsed.toFixed(0)}`).join());
  const mean=runs.reduce((sum,r)=>sum+r.kills,0)/runs.length;assert.ok(mean>=2&&mean<=20,`mean kills ${mean}`);
});
test('TL003 aimed active skill can improve a first run without scripted death or a kill cap', () => {
  const before=simulate(4),after=simulate(4,true);assert.ok(after.kills>before.kills||after.elapsed>before.elapsed);
});
test('TL003 a new run discards every transient combat value', () => {
  const run=simulate(1);assert.ok(run.kills>0);const next=new DefenseRun(1);next.start();assert.equal(next.money,0);assert.equal(next.totalEarnedMoney,0);assert.equal(next.xp,0);assert.equal(next.level,1);assert.equal(next.mercenaries.length,1);assert.equal(next.selectedCards.length,0);assert.equal(next.elapsed,0);assert.equal(next.enemies.length,0);assert.equal(next.wallHealth,40);
});
test('TL003 meta settlement is idempotent and saves only the permanent DTO', () => {
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const mirror=new LocalMetaMirror(storage),run=simulate(1);assert.equal(mirror.settle(run,run.score,run.clearedWave),true);assert.equal(mirror.settle(run,run.score,99),false);
  const saved=JSON.parse(data.get(META_KEY));assert.deepEqual(Object.keys(saved).sort(),['HighestClearedWave','TalentPoints','TalentTreeJson','version']);assert.equal(saved.TalentPoints,run.score);assert.equal(saved.HighestClearedWave,run.clearedWave);
  assert.deepEqual(new LocalMetaMirror(storage).value,saved);assert.equal(data.size,1);
});
test('TL003 broken/unavailable storage leaves combat playable; malformed meta is normalized', () => {
  const mirror=new LocalMetaMirror({getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}});assert.equal(mirror.persistent,false);mirror.settle({},2,1);assert.equal(mirror.value.TalentPoints,2);
  assert.deepEqual(normalizeMeta({version:2}),emptyMeta());
  const value=normalizeMeta({version:1,TalentPoints:-1,HighestClearedWave:NaN,TalentTreeJson:JSON.stringify({nodes:{kinetic_damage:10,bad:-1},unlockedCoreTalents:['coldsteel','layers','agony','rotation','fake'],activeCoreTalents:['coldsteel','layers','layers','agony','rotation','unknown'],enemies:[1]})});
  assert.equal(value.TalentPoints,0);assert.equal(value.HighestClearedWave,0);const tree=JSON.parse(value.TalentTreeJson);assert.deepEqual(tree.activeCoreTalents,['coldsteel','layers','agony']);assert.ok(!tree.unlockedCoreTalents.includes('fake'));assert.equal(tree.nodes.kinetic_damage,10);assert.equal(tree.enemies,undefined);
});

test('TL003 portrait projection moves enemies downwards and enlarges them as they approach', () => {
  const view={width:480,height:660};let previous={y:0,scale:0};
  for(const front of [0,100,300,500,750]){const p=project(front,225,view);assert.ok(p.y>previous.y);assert.ok(p.scale>previous.scale);near(p.x,240);previous=p;}
  const left=project(750,65,view),right=project(750,390,view);assert.ok(left.x<240&&right.x>240);near(left.y,right.y);
});
test('TL003 portrait mouse/touch aim round-trips at multiple screen shapes and depths', () => {
  for(const view of [{width:480,height:660},{width:480,height:480},{width:480,height:290}])for(const front of [1,100,450,749])for(const lateral of [66,150,225,389]){
    const p=project(front,lateral,view),world=unproject(p.x,p.y,view);near(world.x,front);near(world.y,lateral);assert.equal(world.valid,true);
  }
  const view={width:480,height:660};assert.equal(unproject(240,0,view).valid,false);assert.equal(unproject(240,600,view).valid,false);assert.equal(unproject(0,100,view).valid,false);
});
test('TL003 perspective AOE preview maps to the same circle used by hit testing', () => {
  const view={width:480,height:660},points=projectedCircle(500,225,60,view);
  assert.equal(points.length,49);
  for(const p of points){const world=unproject(p.x,p.y,view);near(Math.hypot(world.x-500,world.y-225),60);}
});
test('TL003 reworked throwables: snipe takes the field\'s biggest HP, mines stay until stepped on, EMP and cryo bomb trigger their control', () => {
  const quiet = () => { const r = running(); r.mercenaries.forEach(m => m.shotTimer = 1e9); return r; };
  const s = quiet(); s.learn('snipe'); const small = enemy({ x: 300, y: 225, hp: 5e5, maxHp: 1e6 }), big = enemy({ id: 20000, x: 650, y: 120, hp: 9e5, maxHp: 1e6 }); s.enemies = [small, big];
  assert.equal(s.cast(1, 300, 225), true); near(small.hp, 5e5); assert.ok(big.hp < 9e5, 'the sniper ignores where it was aimed');
  const m = quiet(); m.learn('minefield'); const far = enemy({ x: 100, y: 380, hp: 1e6, maxHp: 1e6, speed: 0 }); m.enemies = [far];
  m.cast(1, 400, 225); assert.equal(m.mines.length, 4); m.advance(5); assert.equal(m.mines.length, 4, 'untouched mines stay');
  for (let i = 0; i < 9; i++) { m.skills[1].cooldown = 0; m.cast(1, 400, 225); } assert.equal(m.mines.length, 32, 'the field keeps at most 32');
  m.enemies.push(enemy({ id: 21000, x: m.mines[31].x, y: m.mines[31].y, hp: 1e6, maxHp: 1e6, speed: 0 })); m.advance(FIELD.step); assert.ok(m.mines.length < 32, 'a stepped-on mine goes off');
  for (const [id, frozen] of [['cryobomb', 'isFrozen'], ['emp', 'isParalyzed']]) {
    const r = quiet(); r.learn(id); const t = enemy({ x: 500, y: 225, hp: 1e9, maxHp: 1e9 }); r.enemies = [t];
    r.cast(1, 500, 225); assert.ok(r[frozen](t), `${id} controls at once`);
  }
});

// ---------- v2 (2026-10-23 retrospective) ----------
test('TL003 v2: enemy strength, spawns and income follow the stage and the danger level, never the clock', () => {
  const at = (stage, danger = 0, elapsed = 0) => { const r = new DefenseRun(9); r.start(false, danger); r.stage = stage; r.elapsed = elapsed; r.mercenaries[0].shotTimer = 1e9; r.advance(FIELD.step); return r; };
  const early = at(5), late = at(5, 0, 900);
  near(early.enemies[0].maxHp, late.enemies[0].maxHp, 'the clock does not grow the horde');
  near(early.pace, 4 * B.STAGE_PACE_MINUTES);
  // Danger builds up: stage 1 is as at danger 0, the last stage is DANGER_STAGE_SHIFT × danger stages later; HP and defense scale too.
  near(at(1, 2).pace, at(1).pace, 'stage 1 plays as at danger 0');
  near(at(B.STAGE_COUNT, 2).pace, at(B.STAGE_COUNT).pace + 2 * B.DANGER_STAGE_SHIFT * B.STAGE_PACE_MINUTES);
  near(at(1, 2).enemies[0].maxHp, at(1).enemies[0].maxHp * B.DANGER_HP ** 2);
  assert.ok(at(12).enemies[0].maxHp >= at(2).enemies[0].maxHp, 'later stages are stronger');
  assert.equal(B.stagePoints(0), 0); assert.equal(B.stagePoints(4), 10); assert.equal(B.stagePoints(20), 210); assert.equal(B.stagePoints(20, 2), 630);
  const r = at(3); r.stage = 3; assert.equal(r.clearedWave, 2); assert.equal(r.score, 3);
});

test('TL003 v2: damage is credited to its source; control seconds and toxin bursts are counted', () => {
  assert.equal(damageSource(MERCENARIES.rifle.tags), 'merc:rifle');
  assert.equal(damageSource(['Damage.Blast', 'Skill.Active', 'Weapon.grenade']), 'skill:grenade');
  assert.equal(damageSource(['Damage.Fire', 'Mechanic.DOT', 'Status.Burning']), 'burn');
  assert.equal(damageSource(['Damage.Cold', 'Status.Frozen']), 'frostbite');
  assert.equal(damageSource(['Damage.Toxin', 'Mechanic.AOE', 'Mechanic.Explosion']), 'toxicburst');
  const run = running(); const target = enemy({ x: 600, hp: 1e6, maxHp: 1e6 }); run.enemies = [target];
  run.mercenaries[0].shotTimer = 0; run.advance(FIELD.step);
  near(run.stats.damage['merc:rifle'], 1e6 - target.hp, 'the rifle shot is credited to the rifle');
  run.learn('cryobomb'); run.cast(1, 600, 225);
  assert.ok(run.stats.damage['skill:cryobomb'] > 0); near(run.stats.control.chill, B.STATUS.chill.duration, 'one freeze');
  // Overkill is not counted: a kill credits only the HP it took.
  const weak = enemy({ id: 30001, x: 600, hp: 1, maxHp: 1e6 }); const before = run.stats.damage['skill:cryobomb'];
  run.enemies = [weak]; run.skills[1].cooldown = 0; run.cast(1, 600, 225); near(run.stats.damage['skill:cryobomb'] - before, 1);
});

test('TL003 v2: the card preview measures panel DPS on a copy and leaves the run untouched', () => {
  const run = running(); run.phase = 'choice'; run.choices = [{ id: 'kinetic' }, { id: 'merc_gunner' }, { id: 'wall' }].map(c => ({ ...c, ...CARDS.find(d => d.id === c.id) }));
  run.choices[1] = { id: 'merc_gunner', kind: 'merc', merc: 'gunner', effect: 'merc', name: '機槍兵' };
  const snapshot = JSON.stringify({ m: run.modifiers, c: run.selectedCards, s: run.mercenaries, w: run.wallMaxHealth, money: run.money, phase: run.phase });
  const dps = run.panelDps(); assert.ok(dps > 0);
  assert.ok(run.previewDps('kinetic') > 0, 'more kinetic damage shows'); assert.ok(run.previewDps('merc_gunner') > 0.2, 'a new gun shows a lot');
  near(run.previewDps('wall'), 0, 'a wall card does not change DPS');
  assert.equal(JSON.stringify({ m: run.modifiers, c: run.selectedCards, s: run.mercenaries, w: run.wallMaxHealth, money: run.money, phase: run.phase }), snapshot);
  near(run.panelDps(), dps);
});

test('TL003 v2: settling records the best stage (core slots) and a full clear unlocks the next danger level', () => {
  const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const meta = new LocalMetaMirror(storage);
  meta.beginRun(); assert.equal(meta.settle({}, 15, 5, { danger: 0 }), true);
  assert.equal(meta.tree.bestStage, 5); assert.equal(meta.tree.danger ?? 0, 0); assert.equal(meta.value.TalentPoints, 15);
  meta.beginRun(); meta.settle({}, 210, 20, { victory: true, danger: 0 }); assert.equal(meta.tree.bestStage, 20); assert.equal(meta.tree.danger, 1);
  meta.beginRun(); meta.settle({}, 30, 4, { danger: 1 }); assert.equal(meta.tree.bestStage, 20, 'a worse run never lowers the best'); assert.equal(meta.tree.danger, 1);
  assert.deepEqual(Object.keys(JSON.parse(data.get(META_KEY))).sort(), ['HighestClearedWave', 'TalentPoints', 'TalentTreeJson', 'version'], 'the save format is unchanged');
});
