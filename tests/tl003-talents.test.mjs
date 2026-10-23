import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalMetaMirror, META_KEY, emptyMeta, emptyTree } from '../src/tl003/Meta.ts';
import { CORES, TALENTS, TALENT_LINKS, canBreakthrough, compileTalents, coreSlots, deploymentStats, isCoreRevealed, isRevealed, talentCost, talentMultiplier } from '../src/tl003/Talents.ts';
import { calculateDamage, calculateValue, effectiveCooldown } from '../src/tl003/Combat.ts';
import { MERCENARIES, SKILLS } from '../src/tl003/Content.ts';
import { MERC_TUNING } from '../src/tl003/Balance.ts';
import { DefenseRun, FIELD, SPAWN_GROWTH_SPEED, spawnIntervalAt , freshStatus } from '../src/tl003/Run.ts';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function mirror(points = 1000, tree = emptyTree()) {
  const data = new Map([[META_KEY, JSON.stringify({ ...emptyMeta(), TalentPoints: points, TalentTreeJson: JSON.stringify(tree) })]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
  return { meta: new LocalMetaMirror(storage), storage, data };
}
const treeWith = nodes => ({ ...emptyTree(), nodes });
/** Every node at one level (breakthrough needs all of them at the cap). */
const allAt = level => Object.fromEntries(TALENTS.map(n => [n.id, level]));
const target = { defense: 0, toxin: 0 };
const pick = run => run.choose(run.choices.find(c => c.id === 'kinetic')?.id ?? run.choices[0].id);
/** One frame of a no-shopping player: picks cards, leaves each rest at once. */
const step = run => {
  if(run.phase === 'choice')pick(run);
  if(run.phase === 'intermission')run.nextStage();
  run.advance(FIELD.step);
};
function simulate(seed, effects) {
  // The game's opening (a rest with the first pick) so the squad can clear stages; points come from cleared stages.
  const run = new DefenseRun(seed, effects);run.start(true);
  for(let i=0;i<60*300 && run.phase!=='over';i++)step(run);
  return run;
}

test('TL003 star map has 47 distinct connected nodes (the 9 originals kept); zero investment reveals only the root', () => {
  assert.equal(new Set(TALENTS.map(n=>n.id)).size,47);
  for(const id of ['mercenary_damage','kinetic_damage','barricade_health','economy_income','fire_dot','repair_efficiency','attack_speed','active_skill_damage','active_skill_haste'])assert.ok(TALENTS.some(n=>n.id===id),id);
  const tree=emptyTree();assert.deepEqual(TALENTS.filter(n=>isRevealed(tree,n.id)).map(n=>n.id),['mercenary_damage']);
  const visited=new Set(['mercenary_damage']);for(let i=0;i<TALENTS.length;i++)for(const[a,b]of TALENT_LINKS){if(visited.has(a))visited.add(b);if(visited.has(b))visited.add(a);}
  assert.equal(visited.size,TALENTS.length);
});
test('TL003 the first point reveals every directly adjacent node without requiring level ten', () => {
  const {meta}=mirror(2);assert.equal(meta.buyTalent('mercenary_damage').ok,true);assert.equal(meta.tree.nodes.mercenary_damage,1);
  assert.equal(meta.value.TalentPoints,1);
  assert.deepEqual(TALENTS.filter(n=>isRevealed(meta.tree,n.id)).map(n=>n.id),['mercenary_damage','kinetic_damage','fire_dot','corrosion_power','shock_power','attack_speed','active_skill_damage','barricade_health','economy_income']);
  assert.equal(isRevealed(meta.tree,'crit_rate'),false);
  assert.equal(meta.buyTalent('kinetic_damage').ok,true);assert.equal(isRevealed(meta.tree,'crit_rate'),true);
});
test('TL003 masked, unknown, capped and unaffordable purchases never mutate the save', () => {
  const {meta}=mirror(1);const before=structuredClone(meta.value);
  assert.equal(meta.buyTalent('fire_dot').ok,false);assert.equal(meta.buyTalent('unknown').ok,false);assert.deepEqual(meta.value,before);
  meta.buyTalent('mercenary_damage');const spent=structuredClone(meta.value);assert.equal(meta.buyTalent('mercenary_damage').ok,false);assert.deepEqual(meta.value,spent);
  const capped=mirror(100,treeWith({mercenary_damage:10})).meta;const full=structuredClone(capped.value);assert.equal(capped.buyTalent('mercenary_damage').ok,false);assert.deepEqual(capped.value,full);
});
test('TL003 costs are ceil(1.12^Level) and repeated purchases spend the actual current cost', () => {
  assert.deepEqual([0,1,2,10,20].map(talentCost),[1,2,2,4,10]);
  const {meta}=mirror(10);for(let i=0;i<3;i++)assert.equal(meta.buyTalent('mercenary_damage').ok,true);
  assert.equal(meta.value.TalentPoints,5);assert.equal(meta.tree.nodes.mercenary_damage,3);
});
test('TL003 breakthrough needs every node at the current cap', () => {
  const {meta}=mirror(100);const before=structuredClone(meta.value);const refused=meta.breakthrough();assert.equal(refused.ok,false);assert.deepEqual(meta.value,before);
  assert.ok(refused.message.includes('所有節點'),refused.message);
  assert.equal(TALENTS.length,47);
  assert.equal(canBreakthrough(treeWith({mercenary_damage:10})),false,'one node at the cap is no longer enough');
  assert.equal(canBreakthrough(treeWith({...allAt(10),mercenary_damage:9})),false,'one node short blocks it');
  assert.equal(canBreakthrough(treeWith(allAt(10))),true);
  assert.equal(canBreakthrough({...treeWith(allAt(10)),tier:2,maxNodeLevel:20}),false,'the cap rises with the tier');
});
test('TL003 breakthrough keeps all levels and points, increases the tier and cap, and allows level eleven', () => {
  const tree=treeWith(allAt(10));tree.unlockedCoreTalents=['coldsteel'];tree.activeCoreTalents=['coldsteel'];
  const {meta}=mirror(100,tree);assert.equal(meta.breakthrough().ok,true);assert.equal(meta.tree.tier,2);assert.equal(meta.tree.maxNodeLevel,20);assert.equal(meta.value.TalentPoints,100);
  assert.deepEqual(meta.tree.nodes,tree.nodes);assert.deepEqual(meta.tree.activeCoreTalents,['coldsteel']);
  assert.equal(meta.buyTalent('mercenary_damage').ok,true);assert.equal(meta.tree.nodes.mercenary_damage,11);assert.equal(meta.value.TalentPoints,100-talentCost(10));
  assert.equal(meta.breakthrough().ok,false);
});
test('TL003 later breakthroughs continue beyond tier two without resetting progress', () => {
  const tree={...treeWith(allAt(30)),tier:3,maxNodeLevel:30};const {meta}=mirror(100,tree);
  assert.equal(meta.breakthrough().ok,true);assert.equal(meta.tree.tier,4);assert.equal(meta.tree.maxNodeLevel,40);assert.equal(meta.tree.nodes.mercenary_damage,30);
  assert.equal(meta.buyTalent('mercenary_damage').ok,true);assert.equal(meta.tree.nodes.mercenary_damage,31);
});
test('TL003 battles lock both purchases and breakthroughs, including while paused or choosing', () => {
  const {meta}=mirror(100,treeWith({mercenary_damage:10}));assert.equal(meta.beginRun(),true);assert.equal(meta.beginRun(),false);
  const run=new DefenseRun(1,meta.effects);run.start();run.pause();
  const before=structuredClone(meta.value);assert.equal(meta.buyTalent('kinetic_damage').ok,false);assert.equal(meta.breakthrough().ok,false);assert.deepEqual(meta.value,before);
  run.phase='choice';assert.equal(meta.buyTalent('kinetic_damage').ok,false);
  meta.settle(run,2,1);assert.equal(meta.inRun,false);assert.equal(meta.buyTalent('kinetic_damage').ok,true);
});
test('TL003 settlement awards points once and immediately permits camp investment', () => {
  const {meta}=mirror(0);meta.beginRun();const run={};assert.equal(meta.settle(run,2,1),true);assert.equal(meta.settle(run,2,1),false);
  assert.equal(meta.value.TalentPoints,2);assert.equal(meta.buyTalent('mercenary_damage').ok,true);assert.equal(meta.value.TalentPoints,1);
});
test('TL003 neutral talent snapshots preserve the original first-run stats and contain no modifiers', () => {
  const effects=compileTalents(emptyTree());assert.deepEqual(effects,{modifiers:[],wallHealth:1,attackSpeed:1,haste:0});
  const stats=deploymentStats(effects);near(stats.damage,MERCENARIES.rifle.damage);near(stats.dps,MERCENARIES.rifle.damage/MERCENARIES.rifle.interval);near(stats.wallHealth,40);near(stats.income,1);near(stats.grenadeCooldown,SKILLS.grenade.cooldown);
});
test('TL003 permanent damage uses multiplicative tag stages and strengthens all mercenaries and actives', () => {
  const effects=compileTalents(treeWith({mercenary_damage:2,kinetic_damage:3,active_skill_damage:1}));
  const kinetic=calculateDamage({baseDamage:10,tags:MERCENARIES.rifle.tags},target,effects.modifiers);
  near(kinetic.final,10*1.06**2*1.08**3);
  // Skills belong to no mercenary: the hub and 軍火專精 reach them, the kinetic node does not touch a blast grenade.
  const grenade=calculateDamage({baseDamage:26,tags:['Damage.Blast','Skill.Active','Weapon.grenade']},target,effects.modifiers);
  near(grenade.final,26*1.06**2*1.08);
  const laser=calculateDamage({baseDamage:54,tags:['Damage.Electric','Skill.Active','Weapon.laser']},target,effects.modifiers);
  near(laser.final,54*1.06**2*1.08);
});
test('TL003 permanent Fire damage strengthens actual Burn and Molotov without double application', () => {
  const effects=compileTalents(treeWith({mercenary_damage:1,fire_dot:2,active_skill_damage:1}));const run=new DefenseRun(1,effects);run.start();run.recruit('flame');run.learn('molotov');
  const victim={id:999,kind:'walker',x:600,y:220,hp:200,maxHp:200,defense:0,speed:0,attack:0,reward:3,xp:1,burnPower:0,burnDuration:0,burnFlammability:0,...freshStatus(),hitFlash:0};run.enemies=[victim];run.advance(FIELD.step);
  near(victim.burnPower,MERCENARIES.flame.damage*MERC_TUNING.flame*1.06*1.08**2);run.mercenaries.forEach(m=>m.shotTimer=100);const hp=victim.hp;run.advance(1);near(victim.hp,hp-victim.burnPower);
  run.cast(1,600,220);near(run.zones[0].power,MERCENARIES.rifle.damage*3*1.06*1.08**2*1.08);
});
test('TL003 permanent wall health, repair and attack speed enter the actual Run', () => {
  const effects=compileTalents(treeWith({barricade_health:2,repair_efficiency:3,attack_speed:4}));const run=new DefenseRun(1,effects);run.start();
  near(run.wallMaxHealth,40*1.08**2);near(run.wallHealth,run.wallMaxHealth);near(run.intervalFor('rifle'),1.25/1.03**4);
  run.wallHealth=1;run.money=100;run.repair();near(run.wallHealth,1+run.wallMaxHealth*.4*1.06**3);
});
test('TL003 permanent income multiplies real kill and completed stage rewards and score earnings', () => {
  const a=new DefenseRun(123),b=new DefenseRun(123,compileTalents(treeWith({economy_income:3})));a.start();b.start();a.wallHealth=b.wallHealth=1e10;
  // Play stage 1 to its rest (the clear bonus is paid when the road is clear after the clock).
  const toRest = run => { if(run.phase === 'choice')pick(run); run.advance(FIELD.step); };
  for(let i=0;i<60*120&&(a.phase!=='intermission'||b.phase!=='intermission');i++){toRest(a);toRest(b);}
  assert.equal(a.phase,'intermission');assert.equal(b.phase,'intermission');assert.equal(a.kills,b.kills);assert.ok(a.kills>0);assert.equal(a.clearedWave,1);
  near(b.totalEarnedMoney,a.totalEarnedMoney*1.06**3);near(b.money,a.money*1.06**3);
});
test('TL003 permanent haste stays unbounded and matches the displayed cooldown prediction', () => {
  const effects=compileTalents(treeWith({active_skill_haste:200}));const run=new DefenseRun(1,effects);run.start();run.cast(0,500,220);
  near(run.skills[0].cooldown,SKILLS.grenade.cooldown/1.06**200);near(deploymentStats(effects).grenadeCooldown,effectiveCooldown(SKILLS.grenade.cooldown,run.haste));assert.ok(run.skills[0].cooldown<.001);
});
test('TL003 a run owns a snapshot; later camp changes and input-object mutation cannot change its stats', () => {
  const tree=treeWith({mercenary_damage:1,barricade_health:1}),effects=compileTalents(tree);const run=new DefenseRun(1,effects);
  const modifiers=structuredClone(run.modifiers),health=run.wallMaxHealth;tree.nodes.mercenary_damage=10;effects.modifiers[0].value=999;effects.modifiers[0].tags.push('Skill.Active');effects.wallHealth=999;
  assert.deepEqual(run.modifiers,modifiers);assert.equal(run.wallMaxHealth,health);
});
test('TL003 permanent progress never increases the HP, speed, attack or bounty of an old Wave', () => {
  const a=new DefenseRun(99),b=new DefenseRun(99,compileTalents(treeWith({mercenary_damage:30,barricade_health:30,economy_income:30})));a.start();b.start();a.advance(FIELD.step);b.advance(FIELD.step);
  assert.deepEqual(a.enemies,b.enemies);assert.ok(b.wallMaxHealth>a.wallMaxHealth);
});
test('TL003 two earned points can buy a real improvement under the same seed', () => {
  const {meta}=mirror(0);const first=simulate(4);assert.ok(first.score>=2);meta.settle(first,first.score,first.clearedWave);
  meta.buyTalent('mercenary_damage');meta.buyTalent('kinetic_damage');const second=simulate(4,meta.effects);
  assert.ok(second.kills>first.kills||second.elapsed>first.elapsed);assert.ok(deploymentStats(meta.effects).dps>4.16);
});
test('TL003 five repeat runs can earn, spend, retain growth and leave every new Run transient', () => {
  const {meta,storage}=mirror(0);let runs=0,earned=0,spent=0;
  for(let i=0;i<5;i++){
    meta.beginRun();const run=simulate(123,meta.effects);earned+=run.score;meta.settle(run,run.score,run.clearedWave);
    for(const id of ['mercenary_damage','kinetic_damage','barricade_health','economy_income']){const before=meta.value.TalentPoints;if(meta.buyTalent(id).ok)spent+=before-meta.value.TalentPoints;}
    const reload=new LocalMetaMirror(storage);assert.deepEqual(reload.value,meta.value);assert.equal(reload.value.TalentPoints,earned-spent);
    const next=new DefenseRun(123,reload.effects);next.start();assert.equal(next.money,0);assert.equal(next.elapsed,0);assert.equal(next.xp,0);assert.equal(next.level,1);assert.equal(next.mercenaries.length,1);assert.equal(next.selectedCards.length,0);runs++;
  }
  assert.equal(runs,5);assert.ok(meta.tree.nodes.mercenary_damage>=2);assert.ok(deploymentStats(meta.effects).dps>4.16);
});
test('TL003 save round trip preserves purchases, revealed neighbors, tiers and reserved core data', () => {
  const {meta,storage,data}=mirror(100,treeWith(allAt(10)));assert.equal(meta.breakthrough().ok,true);assert.equal(meta.buyTalent('kinetic_damage').ok,true);
  const fresh=new LocalMetaMirror(storage);assert.equal(fresh.tree.tier,2);assert.equal(fresh.tree.nodes.kinetic_damage,11);assert.equal(isRevealed(fresh.tree,'fire_dot'),true);
  assert.deepEqual(Object.keys(JSON.parse(data.get(META_KEY))).sort(),['HighestClearedWave','TalentPoints','TalentTreeJson','version']);
  assert.deepEqual(Object.keys(fresh.tree).sort(),['activeCoreTalents','bestStage','danger','maxNodeLevel','nodes','tier','unlockedCoreTalents']);
});
test('TL003 separate mirrors refresh before spending and settling to avoid stale local-tab overwrites', () => {
  const {meta:a,storage}=mirror(5),b=new LocalMetaMirror(storage);a.buyTalent('mercenary_damage');assert.equal(b.buyTalent('kinetic_damage').ok,true);
  assert.equal(b.value.TalentPoints,3);a.settle({},2,1);assert.equal(a.value.TalentPoints,5);assert.equal(a.tree.nodes.kinetic_damage,1);
});
test('TL003 unavailable storage permits in-session camp investment after settlement', () => {
  const meta=new LocalMetaMirror({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});meta.beginRun();meta.settle({},2,1);
  assert.equal(meta.buyTalent('mercenary_damage').ok,true);assert.equal(meta.value.TalentPoints,1);assert.equal(meta.tree.nodes.mercenary_damage,1);assert.equal(meta.persistent,false);
});
test('TL003 proposed multipliers follow the mother spec rather than additive permanent growth', () => {
  const tree=treeWith({kinetic_damage:10,fire_dot:10,mercenary_damage:10,barricade_health:10,economy_income:10,repair_efficiency:10,attack_speed:10});
  for(const id of ['kinetic_damage','fire_dot','barricade_health'])near(talentMultiplier(tree,id),1.08**10);
  for(const id of ['mercenary_damage','economy_income','repair_efficiency'])near(talentMultiplier(tree,id),1.06**10);
  near(talentMultiplier(tree,'attack_speed'),1.03**10);
  near(calculateValue(1,['Economy.WaveReward'],compileTalents(tree).modifiers),1.06**10);
});

test('TL003 spawn frequency grows at three times its former exponential speed without tripling the opening wave', () => {
  assert.equal(SPAWN_GROWTH_SPEED,3);near(spawnIntervalAt(0),3);
  for(const minutes of [1,3,5,10,20])near(1.8/spawnIntervalAt(minutes*60),1.1**(3*minutes));
  near(spawnIntervalAt(60),1.8/1.331);assert.ok(spawnIntervalAt(300)<1.8/1.1**5);
});
test('TL003 late-wave spawn growth can produce multiple enemies per simulation step', () => {
  const run=new DefenseRun(1);run.start(false,3);run.stage=20;run.advance(FIELD.step);
  assert.ok(run.enemies.length>1);assert.equal(new Set(run.enemies.map(e=>e.id)).size,run.enemies.length);
});

test('TL003 tactical cores: unlock spends points, forget refunds in full, slots open on the first clears of stages 10 and 20, no exclusives', () => {
  assert.ok(CORES.every(c=>c.exclusive.length===0),'no core blocks another (2026-10-23)');
  const tip=CORES.find(c=>c.id==='coldsteel').links[0];
  const {meta}=mirror(200,treeWith({[tip]:1}));assert.equal(isCoreRevealed(meta.tree,'coldsteel'),true);
  const before=meta.value.TalentPoints;assert.equal(meta.unlockCore('coldsteel').ok,true);assert.equal(meta.value.TalentPoints,before-15);
  assert.equal(meta.equipCore('coldsteel').ok,true);assert.deepEqual(compileTalents(meta.tree).cores,['coldsteel']);
  // one slot before stage 10 is cleared
  const other=CORES.find(c=>c.id==='layers');const t2=meta.tree;t2.nodes[other.links[0]]=1;
  const {meta:m2}=mirror(200,t2);assert.equal(m2.unlockCore('layers').ok,true);assert.equal(m2.equipCore('layers').ok,false,'one slot before stage 10');
  assert.equal(coreSlots({...m2.tree,bestStage:9}),1);assert.equal(coreSlots({...m2.tree,bestStage:10}),2);assert.equal(coreSlots({...m2.tree,tier:5,bestStage:19}),2,'the tier no longer opens slots');
  // formerly exclusive pairs (cold steel + cremation) now share a loadout
  const t3=structuredClone(m2.tree);t3.bestStage=20;for(const id of CORES.find(c=>c.id==='cremation').links)t3.nodes[id]=1;
  const {meta:m3}=mirror(200,t3);assert.equal(m3.unlockCore('cremation').ok,true);assert.equal(m3.equipCore('cremation').ok,true,'cremation and cold steel together');
  assert.equal(m3.equipCore('layers').ok,true);assert.equal(coreSlots(m3.tree),3);
  assert.equal(m3.unequipCore('cremation').ok,true);
  // forget refunds and unequips
  const points=m3.value.TalentPoints;assert.equal(m3.forgetCore('coldsteel').ok,true);assert.equal(m3.value.TalentPoints,points+15);assert.ok(!m3.tree.activeCoreTalents.includes('coldsteel'));
  assert.equal(m3.equipCore('cremation').ok,true);
  // locked during a run
  m3.beginRun();assert.equal(m3.unequipCore('cremation').ok,false);
});
test('TL003 star map: 16 cores, all reachable; an empty map still compiles to the original four effects', () => {
  assert.equal(CORES.length,16);assert.equal(new Set(CORES.map(c=>c.id)).size,16);
  for(const core of CORES)for(const link of core.links)assert.ok(TALENTS.some(n=>n.id===link),`${core.id} links ${link}`);
  assert.deepEqual(Object.keys(compileTalents(emptyTree())).sort(),['attackSpeed','haste','modifiers','wallHealth']);
});
