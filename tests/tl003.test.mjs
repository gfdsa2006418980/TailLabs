import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateValue, calculateDamage, effectiveCooldown, runScore, formatNumber } from '../src/tl003/Combat.ts';
import { DefenseRun, FIELD } from '../src/tl003/Run.ts';
import { MERCENARIES, CARDS } from '../src/tl003/Content.ts';
import { LocalMetaMirror, META_KEY, emptyMeta, normalizeMeta } from '../src/tl003/Meta.ts';
import { project, unproject, projectedCircle } from '../src/tl003/Projection.ts';

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
    reward: 3, xp: 1, burnPower: 0, burnDuration: 0, burnFlammability: 0, corrosionPower: 0, corrosionDuration: 0,
    shockPower: 0, shockDuration: 0, hitFlash: 0, ...overrides };
}
function running() { const run = new DefenseRun(123); run.start(); return run; }
function choose(run, id) { run.phase = 'choice'; run.choices = [CARDS.find(c => c.id === id)]; assert.equal(run.choose(id), true); }
function simulate(seed, active = false) {
  const run = new DefenseRun(seed); run.start();
  for (let i = 0; i < 60 * 180 && run.phase !== 'over'; i++) {
    if (run.phase === 'choice') run.choose(run.choices.find(c => c.id === 'kinetic')?.id ?? run.choices[0].id);
    if (active && run.elapsed >= 23 && run.mercenaries[0].cooldown === 0) run.cast(0, 690, 230);
    run.advance(1 / 60);
  }
  return run;
}

test('TL003 Flat / Add / More use tag matching and independent multiplication', () => {
  near(calculateValue(10, ['Damage.Kinetic', 'Skill.Active'], mods), 43.2);
  near(calculateValue(10, ['Damage.Fire'], mods), 10);
  near(calculateValue(10, ['Damage.Fire'], [{ kind: 'More', tags: ['Damage.Fire', 'Skill.Active'], value: 3 }]), 10);
});
test('TL003 Bio modifies Defense while Electric multiplies damage after Defense for direct and DOT hits', () => {
  const target = { defense: 100, corrosionPower: 1, shockPower: 1 };
  for (const tags of [['Damage.Kinetic'], ['Damage.Fire', 'Mechanic.DOT']]) {
    const value = calculateDamage({ baseDamage: 100, tags }, target);
    near(value.effectiveDefense, 50); near(value.shockMultiplier, 1.25); near(value.final, 100 / 1.5 * 1.25);
  }
  const late = calculateDamage({ baseDamage: 100, tags: [] }, { defense: 100, corrosionPower: 1e20, shockPower: 1e20 });
  assert.ok(late.effectiveDefense >= 0 && late.effectiveDefense < 1e-15); assert.ok(Number.isFinite(late.final));
});
test('TL003 matching Special rules are returned without creating a fifth damage element', () => {
  const result = calculateDamage({ baseDamage: 10, tags: ['Skill.AutoAttack', 'Damage.Kinetic'] }, enemy(), [CARDS.find(c => c.id === 'bio').modifier]);
  assert.equal(result.specials[0].rule, 'corrode'); assert.ok(!MERCENARIES.rifle.tags.includes('Damage.Explosive'));
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
  run.cast(0, 400, 230); run.pause(); const cooldown = run.mercenaries[0].cooldown;
  run.advance(5); assert.equal(run.elapsed, 0); assert.equal(run.mercenaries[0].cooldown, cooldown);
  run.resume(); run.advance(1); near(run.elapsed, 1);
  run.phase = 'over'; run.advance(20); near(run.elapsed, 1); assert.equal(run.recruit('flame'), false); assert.equal(run.cast(0,400,230), false);
});
test('TL003 recruitment never exceeds three; duplicate type shares its level and costs 1.35^Owned', () => {
  const run = running(); run.money = 1000;
  assert.equal(run.recruitCost('rifle'), Math.ceil(12 * 1.35));
  assert.equal(run.recruit('rifle'), true); assert.equal(run.recruit('flame'), true); assert.equal(run.recruit('tesla'), false);
  const before = run.damageFor('rifle'); run.upgrade('rifle');
  assert.equal(run.levels.rifle, 2); near(run.damageFor('rifle'), before * 1.18);
  assert.equal(run.upgradeCost('rifle'), Math.ceil(5 * 1.15 ** 2));
  assert.equal(run.upgrade('tesla'), false);
});
test('TL003 milestone boosts at 10/25/50 coexist with shared levels', () => {
  const run = running(); run.levels.rifle = 10; near(run.damageFor('rifle'), 5.2 * 1.18 ** 9 * 2);
  run.levels.rifle = 25; near(run.intervalFor('rifle'), 1.25 / 1.5);
  run.levels.rifle = 50; near(run.damageFor('rifle'), 5.2 * 1.18 ** 49 * 6);
});
test('TL003 money spending does not change total earnings or score; XP cannot be spent', () => {
  const run = running(); run.money = 20; run.totalEarnedMoney = 20; run.xp = 2;
  const score = run.score; assert.equal(run.upgrade('rifle'), true);
  assert.equal(run.totalEarnedMoney, 20); assert.equal(run.score, score); assert.equal(run.xp, 2);
  assert.equal(runScore(65, 999), 5);
});
test('TL003 repair and fortification charge funds, cap health and cannot buy at Game Over', () => {
  const run = running(); run.money = 100; run.wallHealth = 10;
  assert.equal(run.repair(), true); near(run.wallHealth, 26); near(run.money, 94);
  assert.equal(run.fortify(), true); near(run.wallMaxHealth, 54); near(run.wallHealth, 40); near(run.money, 84);
  run.wallHealth = run.wallMaxHealth; assert.equal(run.repair(), false);
  run.phase = 'over'; assert.equal(run.fortify(), false);
});
test('TL003 auto attacks award exactly one bounty and XP per dead target', () => {
  const run = running(); run.enemies = [enemy({ hp: 1 })]; run.advance(FIELD.step);
  assert.equal(run.kills, 1); near(run.money, 3); assert.equal(run.xp, 1);
  run.advance(FIELD.step); assert.equal(run.kills, 1); near(run.totalEarnedMoney, 3);
});
test('TL003 a level-up offers three unique cards and freezes time until a valid choice', () => {
  const run = running(); run.xp = 3; run.advance(FIELD.step);
  assert.equal(run.phase, 'choice'); assert.equal(run.choices.length, 3); assert.equal(new Set(run.choices.map(c => c.id)).size, 3);
  const elapsed = run.elapsed; run.advance(40); assert.equal(run.elapsed, elapsed);
  assert.equal(run.choose('invalid'), false); assert.equal(run.choose(run.choices[0].id), true); run.advance(FIELD.step); near(run.elapsed, elapsed + FIELD.step);
});
test('TL003 Kinetic, Burn, Corrosion and Shock upgrades affect actual live enemies', () => {
  for (const id of ['kinetic','burn','bio','shock']) {
    const run = running(); choose(run,id); const target = enemy(); run.enemies = [target]; run.advance(FIELD.step);
    if(id==='kinetic') near(target.hp,200-5.2*1.45);
    if(id==='burn') { near(target.burnPower,4); const hp=target.hp; run.mercenaries[0].shotTimer=100; run.advance(1); near(target.hp,hp-4); }
    if(id==='bio') near(target.corrosionPower,1);
    if(id==='shock') near(target.shockPower,1);
  }
});
test('TL003 equal Burn refreshes and accelerates the strongest power, applying Fire bonuses once', () => {
  const run = running(); choose(run,'burn'); choose(run,'fire'); const target = enemy(); run.enemies=[target]; run.advance(FIELD.step);
  near(target.burnPower,6.4); run.mercenaries[0].shotTimer=0; run.advance(FIELD.step); near(target.burnPower,6.4); near(target.burnFlammability,1);
  run.mercenaries[0].shotTimer=100; const hp=target.hp; run.advance(1); near(target.hp,hp-8);
  run.advance(4); near(target.burnPower,0); near(target.burnDuration,0); near(target.burnFlammability,0);
});
test('TL003 Corrosion and Shock expire independently', () => {
  const run=running(); const target=enemy({corrosionPower:2,corrosionDuration:.2,shockPower:3,shockDuration:.5}); run.enemies=[target]; run.mercenaries[0].shotTimer=100;
  run.advance(.3); near(target.corrosionPower,0); near(target.shockPower,3); run.advance(.3); near(target.shockPower,0);
});
test('TL003 Grenade uses Kinetic + Active modifiers, AOE geometry, knockback and cooldown', () => {
  const run=running(); choose(run,'kinetic'); choose(run,'active'); const a=enemy(), b=enemy({id:10000,x:650}); run.enemies=[a,b];
  assert.equal(run.cast(0,500,220),true); near(a.hp,200-5.2*5*(1+.45+.6)); near(b.hp,200); near(a.x,460); near(run.mercenaries[0].cooldown,30);
  assert.equal(run.cast(0,500,220),false);
});
test('TL003 invalid drag releases do not consume cooldown; haste applies to valid casts', () => {
  const run=running(); for(const [x,y] of [[-1,200],[751,200],[200,64],[200,391],[NaN,200],[200,Infinity]]) assert.equal(run.cast(0,x,y),false);
  near(run.mercenaries[0].cooldown,0); run.haste=2900; assert.equal(run.cast(0,500,220),true); near(run.mercenaries[0].cooldown,1);
});
test('TL003 Molotov deals DOT through the shared defense/shock calculator and honors Active tags', () => {
  const run=running(); run.money=100; run.recruit('flame'); choose(run,'active'); const target=enemy({defense:100,corrosionPower:1,corrosionDuration:10,shockPower:1,shockDuration:10});run.enemies=[target];
  run.mercenaries.forEach(m=>m.shotTimer=100); assert.equal(run.cast(1,500,220),true); near(target.hp,200);
  near(target.burnPower,24); run.advance(.5); near(target.hp,200-.5*5*3*1.6/1.5*1.25); assert.equal(run.zones.length,1); run.advance(6); assert.equal(run.zones.length,0);
});
test('TL003 Laser hits only enemies along the aimed direction, applies Shock and pierces', () => {
  const run=running(); run.money=100; run.recruit('tesla'); const a=enemy({x:500,y:222}), b=enemy({id:10000,x:350,y:222}), c=enemy({id:10001,x:500,y:350}); run.enemies=[a,b,c];
  assert.equal(run.cast(1,200,222),true); assert.ok(a.hp<200&&b.hp<200);near(c.hp,200);near(a.shockPower,3);near(run.mercenaries[1].cooldown,45);
});
test('TL003 all three mercenary types can be deployed, with one independent skill each', () => {
  const run=running(); run.money=100;run.recruit('flame');run.recruit('tesla');assert.equal(run.mercenaries.length,3);
  assert.equal(run.cast(0,400,200),true);near(run.mercenaries[1].cooldown,0);assert.equal(run.cast(1,400,200),true);assert.equal(run.cast(2,400,200),true);
  assert.deepEqual(run.mercenaries.map(m=>m.cooldown),[30,35,45]);
});
test('TL003 wave rewards occur only after a full 30 seconds and 20 minutes ends in victory', () => {
  const run=running();run.wallHealth=1e100;run.elapsed=29.98;run.mercenaries[0].shotTimer=100;run.advance(.016667);assert.equal(run.clearedWave,0);
  run.advance(.016667);assert.equal(run.clearedWave,1);assert.ok(run.money>0);assert.ok(run.xp>=2);
  run.elapsed=1199.99;run.advance(.016667);assert.equal(run.phase,'victory');near(run.elapsed,1200);assert.equal(run.wave,40);assert.equal(run.clearedWave,40);
  const time=run.elapsed;run.advance(10);assert.equal(run.elapsed,time);
});
test('TL003 enemy difficulty is independent of permanent player progress and supports five enemy types', () => {
  const a=running(),b=running();b.modifiers.push({kind:'More',tags:['Damage.Kinetic'],value:1e10});
  a.advance(FIELD.step);b.advance(FIELD.step);near(a.enemies[0].maxHp,b.enemies[0].maxHp);near(a.enemies[0].speed,b.enemies[0].speed);
  const kinds=new Set();for(let seed=1;seed<=128;seed++){const r=new DefenseRun(Math.imul(seed,2654435761));r.start();r.elapsed=180;r.advance(FIELD.step);kinds.add(r.enemies[0].kind);}assert.equal(kinds.size,5);
});
test('TL003 first-run baseline across 128 seeds is 20–40 seconds and approximately five kills', () => {
  const runs=Array.from({length:128},(_,i)=>simulate(Math.imul(i+1,2654435761)));
  assert.ok(runs.every(r=>r.phase==='over'&&r.elapsed>=20&&r.elapsed<=40));
  const mean=runs.reduce((sum,r)=>sum+r.kills,0)/runs.length;assert.ok(mean>=4.5&&mean<=5.5,`mean kills ${mean}`);
  assert.ok(runs.every(r=>r.kills>=3&&r.kills<=8));
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
  const value=normalizeMeta({version:1,TalentPoints:-1,HighestClearedWave:NaN,TalentTreeJson:JSON.stringify({nodes:{kinetic_damage:10,bad:-1},unlockedCoreTalents:['a','b','c','d'],activeCoreTalents:['a','b','b','c','d','unknown'],enemies:[1]})});
  assert.equal(value.TalentPoints,0);assert.equal(value.HighestClearedWave,0);const tree=JSON.parse(value.TalentTreeJson);assert.deepEqual(tree.activeCoreTalents,['a','b','c']);assert.equal(tree.nodes.kinetic_damage,10);assert.equal(tree.enemies,undefined);
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
