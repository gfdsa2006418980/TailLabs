import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBurn, applyBurn, burnSpeed, MAX_FLAMMABILITY } from '../src/tl003/Burn.ts';
import { DefenseRun, FIELD , freshStatus } from '../src/tl003/Run.ts';
import { CARDS, MERCENARIES } from '../src/tl003/Content.ts';
import { MERC_TUNING } from '../src/tl003/Balance.ts';

// Flamer auto-attack burn power and the Molotov's power (3× the flamer's damage).
// The flamer's own burn (F) and the Molotov's (3 × the squad's reference shot), which is stronger.
const F=MERCENARIES.flame.damage*MERC_TUNING.flame,M=3*MERCENARIES.rifle.damage;

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const state=()=>({burnPower:0,burnDuration:0,burnFlammability:0});
function target(overrides={}) {
  return {id:9999,kind:'walker',x:600,y:220,hp:1000,maxHp:1000,defense:0,speed:0,attack:0,reward:3,xp:1,
    ...state(),...freshStatus(),hitFlash:0,...overrides};
}
function fireRun(victim=target()) {
  // A flamer in slot 1 (short range: the victim stands 150 from the wall) and a Molotov in skill slot 1.
  const run=new DefenseRun(123);run.start();run.recruit('flame');run.learn('molotov');run.enemies=[victim];
  run.mercenaries.forEach(m=>m.shotTimer=100);return {run,victim};
}

test('TL003 first burn immediately installs its full baseline without an extra direct hit',()=>{
  const s=state();applyBurn(s,20,4);assert.deepEqual(s,{burnPower:20,burnDuration:4,burnFlammability:0});near(advanceBurn(s,.5),10);
});
test('TL003 weaker and equal burns refresh duration and flammability without adding base power',()=>{
  const s=state();applyBurn(s,20,4);advanceBurn(s,3);applyBurn(s,4,3);near(s.burnPower,20);near(s.burnDuration,3);near(s.burnFlammability,1);
  applyBurn(s,20,2);near(s.burnPower,20);near(s.burnDuration,3);near(s.burnFlammability,2);near(burnSpeed(s),1.5);
});
test('TL003 flammability increases DPS and spends remaining burn time by the same factor',()=>{
  const s=state();applyBurn(s,20,4);applyBurn(s,5,4);applyBurn(s,5,4);
  near(advanceBurn(s,1),30);near(s.burnDuration,2.5);near(s.burnPower,20);
  near(advanceBurn(s,100),50);assert.deepEqual(s,state());near(advanceBurn(s,100),0);
});
test('TL003 stronger burn replaces immediately, retains episode flammability, and cannot be downgraded',()=>{
  const s=state();applyBurn(s,10,4);applyBurn(s,5,4);applyBurn(s,30,2);
  near(s.burnPower,30);near(s.burnDuration,4);near(s.burnFlammability,1);near(advanceBurn(s,1),37.5);
  applyBurn(s,10,3);near(s.burnPower,30);near(s.burnFlammability,2);
});
test('TL003 expiration clears flammability so a weaker burn starts a fresh episode',()=>{
  const s=state();applyBurn(s,100,1);applyBurn(s,10,1);advanceBurn(s,1);
  assert.deepEqual(s,state());applyBurn(s,2,4);assert.deepEqual(s,{burnPower:2,burnDuration:4,burnFlammability:0});
});
test('TL003 rejected burn values and invalid elapsed time do not corrupt an active burn',()=>{
  const s=state();applyBurn(s,10,4);const before={...s};
  for(const [power,duration]of[[0,4],[-1,4],[NaN,4],[Infinity,4],[10,0],[10,NaN]])applyBurn(s,power,duration);
  for(const dt of [0,-1,NaN,Infinity])near(advanceBurn(s,dt),0);assert.deepEqual(s,before);
});
test('TL003 Molotov ignites immediately and pulses once per second rather than once per frame',()=>{
  const {run,victim}=fireRun();run.cast(1,600,220);near(victim.hp,1000);near(victim.burnPower,M);
  run.advance(.5);near(victim.hp,1000-M*.5);near(victim.burnFlammability,0);
  run.advance(.5);near(victim.burnFlammability,1);near(victim.burnPower,M);
  run.advance(.5);near(victim.burnFlammability,1);
});
test('TL003 an enemy entering a burning area ignites on contact and keeps burning after leaving',()=>{
  const {run,victim}=fireRun(target({x:730}));run.cast(1,600,220);near(victim.burnPower,0);
  victim.x=600;run.advance(FIELD.step);near(victim.burnPower,M);near(victim.burnFlammability,0);
  victim.x=730;const hp=victim.hp;run.advance(.5);near(victim.hp,hp-M*.5);near(victim.burnFlammability,0);
  victim.x=600;run.advance(FIELD.step);near(victim.burnFlammability,1);
});
test('TL003 overlapping Molotovs share one burn instead of dealing two independent area DOTs',()=>{
  const {run,victim}=fireRun();run.cast(1,600,220);run.skills[1].cooldown=0;run.cast(1,600,220);
  near(victim.burnPower,M);near(victim.burnFlammability,1);run.advance(.5);near(victim.hp,1000-M*1.25*.5);
});
test('TL003 flamer weak hits cannot overwrite a stronger Molotov and pause freezes its full state',()=>{
  const {run,victim}=fireRun();run.cast(1,600,220);run.mercenaries[1].shotTimer=0;run.advance(FIELD.step);
  near(victim.burnPower,M);near(victim.burnFlammability,1);const before={...victim};
  run.pause();run.advance(10);assert.deepEqual(victim,before);run.resume();run.advance(.5);assert.ok(victim.hp<before.hp);
});
test('TL003 stronger later Fire modifiers replace a snapshot once; defense and shock stay dynamic',()=>{
  const {run,victim}=fireRun();run.mercenaries[1].shotTimer=0;run.advance(FIELD.step);near(victim.burnPower,F);
  run.modifiers.push(CARDS.find(c=>c.id==='fire').modifier);run.mercenaries[1].shotTimer=0;run.advance(FIELD.step);near(victim.burnPower,F*(1+CARDS.find(c=>c.id==='fire').value));
  run.mercenaries.forEach(m=>m.shotTimer=100);victim.defense=100;victim.resist=1/3;victim.toxin=50;victim.toxinDuration=10;victim.meters.shock.value=0.5*0.6*victim.maxHp;
  // Burns are elemental: resistance 1/3 gives ×1/1.5 (armor does not apply); a half-full shock meter adds +25% damage taken.
  const hp=victim.hp;run.advance(.5);near(victim.hp,hp-F*(1+CARDS.find(c=>c.id==='fire').value)*.5/1.5*1.25);near(victim.burnPower,F*(1+CARDS.find(c=>c.id==='fire').value));
});
test('TL003 accelerated DOT death awards one bounty and one XP even inside overlapping fire',()=>{
  const {run,victim}=fireRun(target({hp:.1}));run.cast(1,600,220);run.skills[1].cooldown=0;run.cast(1,600,220);
  const money=run.money;run.advance(FIELD.step);near(run.kills,1);near(run.money,money+3);near(run.xp,1);
  run.advance(.5);near(run.kills,1);near(run.totalEarnedMoney,3);
});

test('TL003 flammability stops at twelve stacks (×4 burn speed)',()=>{
  const s=state();applyBurn(s,20,4);for(let i=0;i<40;i++)applyBurn(s,1,4);
  assert.equal(s.burnFlammability,MAX_FLAMMABILITY);near(burnSpeed(s),1+MAX_FLAMMABILITY*0.25);near(burnSpeed({...s,burnFlammability:99}),4);
});
