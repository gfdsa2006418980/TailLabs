import test from 'node:test';
import assert from 'node:assert/strict';
import { DefenseRun, FIELD, THROWABLE, freshStatus, meterThreshold } from '../src/tl003/Run.ts';
import { MERCENARIES, cardDef, makeCard } from '../src/tl003/Content.ts';
import { compileTalents, talentMultiplier } from '../src/tl003/Talents.ts';
import { emptyTree } from '../src/tl003/Meta.ts';
import * as B from '../src/tl003/Balance.ts';

// Fire works like cold: fire hits fill the ignite meter; a full one burns tick × max HP once a second.
const IG = B.STATUS.ignite;
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const target = (over = {}) => ({ id: 9999, kind: 'walker', x: 600, y: 220, hp: 1e6, maxHp: 1e6, defense: 0, speed: 0, attack: 0, reward: 3, xp: 1,
  ...freshStatus(), hitFlash: 0, ...over });
const take = (run, id) => { run.phase = 'choice'; run.choices = [makeCard(cardDef(id))]; assert.equal(run.choose(id), true); };
/** A quiet run: nobody shoots unless a test says so. */
const quiet = effects => { const run = new DefenseRun(123, effects); run.start(); run.mercenaries.forEach(m => m.shotTimer = 1e9); return run; };
/** A flamer in slot 1 (the victim at x 600 is in its reach); `flame` fires one shot. */
const flamer = (victim, effects) => { const run = quiet(effects); run.recruit('flame'); run.mercenaries.forEach(m => m.shotTimer = 1e9); run.enemies = [victim]; return run; };
const flame = run => { run.mercenaries[1].shotTimer = 0; run.advance(FIELD.step); run.mercenaries[1].shotTimer = 1e9; };
/** Fills the meter to just under its threshold, then one flamer shot ignites. */
const igniteNow = (run, e) => { e.meters.ignite.value = meterThreshold(e, 'ignite', run.elapsed) - 1e-9; flame(run); assert.ok(run.isBurning(e)); };
/** Every HP drop of `e` over `seconds`, with the time it happened. */
function drops(run, e, seconds) {
  const out = []; let hp = e.hp;
  for (let i = 0; i < Math.round(seconds / FIELD.step); i++) { run.advance(FIELD.step); if (e.hp !== hp) { out.push({ t: run.elapsed, d: hp - e.hp }); hp = e.hp; } }
  return out;
}
const ticksIn = seconds => Math.floor(seconds + 1e-9);

test('TL003 burn: fire hits fill the ignite meter by final damage × rate; the flamer hits each target directly', () => {
  assert.ok(!MERCENARIES.flame.tags.includes('Mechanic.DOT'), 'the flamer is direct fire, not a DOT');
  const e = target(), run = flamer(e); flame(run);
  const dealt = run.damageFor('flame');
  near(1e6 - e.hp, dealt); near(e.meters.ignite.value, dealt * IG.rate); assert.ok(!run.isBurning(e));
  near(run.stats.damage['merc:flame'], dealt);
    // Fire is elemental: resistance cuts it (and the meter fills from what is left), armor does not.
  const r = target({ defense: 100, resist: 0.5 }), rr = flamer(r); flame(rr);
  near(1e6 - r.hp, dealt * 0.5); near(r.meters.ignite.value, dealt * 0.5 * IG.rate);
  // Its damage number is coloured as fire (events skip hits under 0.1% of max HP, so a small target).
  const small = target({ hp: 1000, maxHp: 1000 }), sr = flamer(small); flame(sr);
  assert.ok(sr.events.some(v => v.kind === 'hit' && v.target === small.id && v.element === 'fire'));
});

test('TL003 burn: a full meter ignites; burn ticks of tick × max HP land one second apart until it goes out', () => {
  const e = target({ hp: 1000, maxHp: 1000 }), run = flamer(e);
  igniteNow(run, e); near(e.meters.ignite.value, 0); near(e.meters.ignite.timer, IG.duration);
  near(run.stats.control.ignite, IG.duration);
  const lit = run.elapsed; run.critChance = 1;
  const ds = drops(run, e, IG.duration + 2);
  assert.equal(ds.length, ticksIn(IG.duration), `${ds.length} ticks`);
  ds.forEach((d, i) => { near(d.d, 1000 * IG.tick); near(d.t - lit, i + 1, FIELD.step); });
  assert.ok(!run.isBurning(e)); near(e.meters.ignite.value, 0, 1e-9);
  // Ticks are a DOT: credited to 'burn', never crit, never fill a meter.
  near(run.stats.damage.burn, ds.length * 1000 * IG.tick);
  assert.ok(run.events.filter(v => v.kind === 'hit' && v.target === e.id).every(v => !v.crit));
});

test('TL003 burn: ignition escalates the next threshold like chill; a burning zombie\'s meter does not fill', () => {
  const e = target(), run = flamer(e), base = e.maxHp * IG.threshold;
  near(meterThreshold(e, 'ignite', run.elapsed), base);
  igniteNow(run, e); assert.equal(e.meters.ignite.count, 1);
  near(meterThreshold(e, 'ignite', run.elapsed), base * (1 + B.STATUS_ESCALATION));
  flame(run); near(e.meters.ignite.value, 0);
  run.advance(IG.duration + B.STATUS_WINDOW + 0.1); assert.ok(!run.isBurning(e));
  near(meterThreshold(e, 'ignite', run.elapsed), base);
});

test('TL003 burn: fire DOT bonuses (card 高濃度燃料, talent 高效燃料) and resistance apply to ticks; armor does not; the flamer hit is no DOT', () => {
  const tree = { ...emptyTree(), nodes: { fire_dot: 2 } }, talent = talentMultiplier(tree, 'fire_dot');
  assert.ok(talent > 1);
  const e = target({ defense: 100, resist: 1 / 3 }), run = flamer(e, compileTalents(tree)); take(run, 'fire');
  const fire = run.selectedCards.find(c => c.id === 'fire')?.value ?? makeCard(cardDef('fire')).value;
  igniteNow(run, e);
  near(1e6 - e.hp, run.damageFor('flame') * (2 / 3), 1e-6);
  const hp = e.hp; run.advance(1);
  near(hp - e.hp, e.maxHp * IG.tick * (1 + fire) * talent * (2 / 3));
});

test('TL003 burn: 持久燃劑 lengthens the ignition, so it burns more seconds', () => {
  const e = target(), run = flamer(e); take(run, 'burnTime');
  const seconds = IG.duration * (1 + run.burnTimeBonus) * run.perm.burnTime;
  assert.ok(seconds > IG.duration);
  igniteNow(run, e); near(e.meters.ignite.timer, seconds); near(run.stats.control.ignite, seconds);
  assert.equal(drops(run, e, seconds + 2).length, ticksIn(seconds));
});

test('TL003 burn: Molotov settles once a second (the cast is the first pulse): THROWABLE.molotov per target over six seconds', () => {
  const run = quiet(); run.learn('molotov');
  const H = 5000, e = target({ x: 500, hp: H, maxHp: H }), late = target({ id: 10000, x: 730, hp: H, maxHp: H }); run.enemies = [e, late];
  const base = run.skillPower * (B.SKILL_TUNING.molotov ?? 1), pulse = base * THROWABLE.molotov / 6;
  assert.equal(run.cast(1, 500, 220), true);
  near(H - e.hp, pulse); near(e.meters.ignite.value, pulse * IG.rate, 1e-6); near(late.hp, H);
  assert.ok(pulse * IG.rate * 6 < H * IG.threshold, 'six pulses do not ignite this target');
  assert.ok(run.events.some(v => v.kind === 'hit' && v.target === e.id && v.element === 'fire' && v.skill));
  // A zombie stepping in takes nothing until the next pulse: no damage on contact.
  run.advance(0.5); late.x = 500; run.advance(0.25); near(late.hp, H);
  const ds = drops(run, e, 7);
  assert.equal(ds.length, 5); ds.forEach(d => near(d.d, pulse));
  near(H - e.hp, base * THROWABLE.molotov); near(H - late.hp, pulse * 5);
  assert.equal(run.zones.length, 0); near(run.stats.damage['skill:molotov'], (H - e.hp) + (H - late.hp));
  // 凝固汽油: twice the fire a pulse.
  const napalm = quiet(); napalm.learn('molotov'); napalm.evolutions.molotov = 'napalm'; const n = target({ x: 500, hp: 1e9, maxHp: 1e9 }); napalm.enemies = [n];
  napalm.cast(1, 500, 220); near(1e9 - n.hp, pulse * 2);
});

test('TL003 burn: burn ammo adds one fire hit of the shot × value (copies merge); the sapper and white phosphorus add fire hits', () => {
  const R = MERCENARIES.rifle.damage;
  const ammo = quiet(); take(ammo, 'burn'); take(ammo, 'burn'); const v = ammo.selectedCards.filter(c => c.id === 'burn').reduce((s, c) => s + c.value, 0);
  const e = target({ defense: 50, hp: 1000, maxHp: 1000 }); ammo.enemies = [e]; ammo.mercenaries[0].shotTimer = 0; ammo.advance(FIELD.step);
  // The rifle's shot meets armor 50; its fire hit is elemental and does not.
  near(1000 - e.hp, R * 100 / 150 + R * v); near(e.meters.ignite.value, R * v * IG.rate);
  assert.equal(ammo.events.filter(x => x.kind === 'hit' && x.target === e.id).length, 2, 'two copies, one fire hit');
  near(ammo.stats.damage['merc:rifle'], 1000 - e.hp, 1e-6);
  const p = quiet(); p.synergies.add('phosphorus'); const f = target(); p.enemies = [f]; p.mercenaries[0].shotTimer = 0; p.advance(FIELD.step);
  near(1e6 - f.hp, R * (1 + cardDef('phosphorus').value)); assert.ok(f.meters.ignite.value > 0);
  const sapper = quiet(); sapper.recruit('engineer'); const s = target(); sapper.enemies = [s]; sapper.mercenaries[1].shotTimer = 0; sapper.advance(FIELD.step);
  const d = sapper.damageFor('engineer'); near(1e6 - s.hp, d * (1 + MERCENARIES.engineer.ignite)); assert.ok(s.meters.ignite.value > 0);
});

test('TL003 burn: 過熱電弧 doubles the ignite fill on shocked targets; 化學火災 strengthens ticks with toxin', () => {
  const e = target(), run = flamer(e); run.synergies.add('overheat'); e.meters.shock.value = 1; flame(run);
  near(e.meters.ignite.value, (1e6 - e.hp) * IG.rate * 2);
  const c = target({ toxin: 10, toxinDuration: 100 }), chem = flamer(c); chem.synergies.add('chemfire'); igniteNow(chem, c);
  const hp = c.hp; chem.advance(1);
  near(hp - c.hp, c.maxHp * IG.tick * Math.min(3, 1 + cardDef('chemfire').value));
});

test('TL003 burn: a zombie that burns to death pays out once and only its last HP is credited', () => {
  const e = target({ hp: 1000, maxHp: 1000 }), run = flamer(e); igniteNow(run, e);
  e.hp = 1; const money = run.money; run.advance(IG.duration + 1);
  assert.equal(run.kills, 1); near(run.money, money + 3); near(run.stats.damage.burn, 1);
});
