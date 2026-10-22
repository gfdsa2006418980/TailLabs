import { calculateDamage, calculateValue, effectiveCooldown, runScore, withFamily } from './Combat.ts';
import type { DamageInstance, Modifier, Tag } from './Combat.ts';
import { CARD_DEFS, ELEMENTS, ENEMIES, MERCENARIES, RARITIES, RARITY_ORDER, SKILLS, cardDef, makeCard } from './Content.ts';
import type { CardDef, Element, EnemyKind, MercKind, Rarity, SkillId, UpgradeCard } from './Content.ts';
import type { CoreId, PermanentEffects } from './Talents.ts';
import { advanceBurn, applyBurn, MAX_FLAMMABILITY } from './Burn.ts';
import * as B from './Balance.ts';
import { SPAWN_GROWTH_SPEED } from './Balance.ts';
export { SPAWN_GROWTH_SPEED };

export const FIELD = { width: 960, height: 420, wallX: 750, step: 1 / 60, waveSeconds: 30, victorySeconds: 1200 } as const;
/** Triple the exponential growth speed, preserving the opening base cadence. */
export function spawnIntervalAt(seconds: number) {
  return (seconds < 12 ? 3 : 1.8) / 1.1 ** (SPAWN_GROWTH_SPEED * Math.max(0, seconds) / 60);
}
export type Phase = 'ready' | 'running' | 'choice' | 'paused' | 'over' | 'victory';
/** The three build-up meters: 冷凍 → 冰凍, 電能 → 麻痺, 爆裂 → 暈眩. */
export type MeterKind = 'chill' | 'shock' | 'stun';
export const METER_KINDS: readonly MeterKind[] = ['chill', 'shock', 'stun'];
export interface Meter {
  value: number;
  /** Seconds the control (freeze / paralysis / stun) still lasts. */
  timer: number;
  /** Triggers in the current escalation chain, and the time of the last one. */
  count: number; last: number;
  /** Seconds since the meter was last fed. */
  idle: number;
}
const newMeter = (): Meter => ({ value: 0, timer: 0, count: 0, last: -Infinity, idle: 0 });
/** A zombie's status fields at spawn: no toxin, empty meters. Tests spread this into hand-built enemies. */
export const freshStatus = () => ({ toxin: 0, toxinDuration: 0, toxinBurst: false, meters: { chill: newMeter(), shock: newMeter(), stun: newMeter() } as Record<MeterKind, Meter> });
export interface Enemy {
  /** `defense`: physical armor (toxin lowers it). `resist`: elemental resistance, a share of fire, cold and electric removed. */
  id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; defense: number; resist: number;
  speed: number; attack: number; reward: number; xp: number; burnPower: number; burnDuration: number; burnFlammability: number;
  /** 毒素: flat points off defense; the zombie detonates once when its defense reaches zero. */
  toxin: number; toxinDuration: number; toxinBurst: boolean;
  meters: Record<MeterKind, Meter>;
  hitFlash: number;
  /** Core 元素輪替: the element of the last hit. Core 千層烈焰: stacked burn layers. */
  lastElement?: string; burnLayers?: number;
}
export interface Mercenary { id: number; kind: MercKind; shotTimer: number; shots?: number; focusTarget?: number; focusStacks?: number }
export interface SkillSlot { id: SkillId; cooldown: number }
/** Core 亡者徵召: a raised corpse walking back up the road to explode in the horde. */
export interface Ally { id: number; x: number; y: number; power: number; age: number }
export interface VisualEvent {
  kind: 'shot' | 'flame' | 'laser' | 'blast' | 'hit' | 'kill' | 'freeze' | 'paralyze' | 'stun' | 'toxic'; x: number; y: number; fromX?: number; fromY?: number; color: string; life: number; maxLife: number; radius: number;
  /** Presentation only: damage dealt ('hit') or money earned ('kill'). */
  amount?: number; enemy?: EnemyKind; target?: number; skill?: boolean; crit?: boolean; merc?: MercKind;
}
/** Ground areas: a fire zone (燃燒瓶, 延燒) or a gas cloud (毒氣彈). */
export interface FireZone { kind?: 'fire' | 'gas'; x: number; y: number; radius: number; remaining: number; power: number; pulseTimer: number; contacts: Set<number>; spread?: boolean }
/** 地雷陣: armed mines that explode when an enemy steps close. */
export interface Mine { x: number; y: number; remaining: number; damage: number }
const mercY = (slot: number) => 130 + slot * 92;
/** The very first choice of a run offers its mercenaries and one ammo card of an element. */
const STARTERS = ['kinetic', 'burn', 'bio', 'shock', 'chill'];
const THORN_TAGS: Tag[] = ['Damage.Kinetic', 'Damage.Physical', 'Defense.Barricade'];
// Synergy strengths, looked up once (hot paths run per enemy per step).
const PHOSPHORUS = cardDef('phosphorus')!.value, ACIDCORE = cardDef('acidcore')!.value, CONDUCTOR = cardDef('conductor')!.value, CHEMFIRE = cardDef('chemfire')!.value;
const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);
/**
 * Rarity weights: common shrinks 0.6 points per tactical level (floor 35); the rest splits uncommon : rare :
 * legendary as 27 : 9 : 2. A legendary roll only offers the few normal cards that allow it (else it falls
 * back to rare); evolutions are legendary on their own track.
 */
export function rarityWeights(level: number) {
  const common = Math.max(35, RARITIES.common.weight - 0.6 * (level - 1)), rest = 100 - common;
  const u = RARITIES.uncommon.weight, r = RARITIES.rare.weight, l = RARITIES.legendary.weight;
  return { common, uncommon: rest * u / (u + r + l), rare: rest * r / (u + r + l), legendary: rest * l / (u + r + l) };
}
/** Draws without rare+ before the next draw guarantees one. */
export const PITY_DRAWS = 6;
export const mercPosition = (slot: number) => ({ x: 824 + (slot === 1 ? 26 : 0), y: mercY(slot) });
/** The searchlight's spot on the road at a game time: the same sweep the renderer used to run on real time. */
export function searchlightAt(seconds: number, wide = false) {
  return { x: 330 + 230 * Math.sin(seconds * 0.21), y: 225 + 150 * Math.sin(seconds * 0.33 + 1), radius: wide ? B.SEARCHLIGHT_WIDE_RADIUS : B.SEARCHLIGHT_RADIUS };
}
/** A meter's current threshold: a share of max HP, +200% of the base for every trigger in the last ten seconds. */
export function meterThreshold(enemy: Enemy, kind: MeterKind, elapsed: number) {
  const m = enemy.meters[kind], recent = elapsed - m.last <= B.STATUS_WINDOW ? m.count : 0;
  return enemy.maxHp * B.STATUS[kind].threshold * (1 + B.STATUS_ESCALATION * recent);
}
const PROC_TAGS: Record<'Cold' | 'Electric', Tag[]> = { Cold: ['Damage.Cold', 'Mechanic.Proc'], Electric: ['Damage.Electric', 'Mechanic.Proc'] };
const BLAST_SPLASH_RADIUS = 40;
/** Share of max HP below which a hit makes no visual event. */
const TINY_HIT = 0.001;
/** Spatial grid cell size (model units) and a numeric key per cell; the field spans x −40…800, y 0…420. */
const GRID_CELL = 50;
const cellKey = (cx: number, cy: number) => (cx + 8) * 64 + (cy + 8);
/** Card categories each tactical core leans towards (draw affinity). */
const CORE_AFFINITY: Partial<Record<CoreId, string[]>> = {
  coldsteel: ['動能'], layers: ['火焰'], cremation: ['火焰'], agony: ['毒素', '冷凍', '電能', '爆裂'], rotation: ['元素', '物理'],
  lonewolf: ['傭兵'], uniform: ['傭兵', '動能'], focusfire: ['傭兵'], pointblank: ['傭兵'], autofire: ['投擲物'],
  bloodprice: ['投擲物', '防守'], plunder: ['防守'], blackmarket: ['防守'], ammoeco: ['動能', '經濟'], corpseblast: ['爆裂'], raisedead: ['毒素'],
};
const nearestFirst = (list: readonly Enemy[], x: number, y: number) => [...list].sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));

/** Deterministic fixed-step model, independent of Canvas, browser storage and network. */
export class DefenseRun {
  phase: Phase = 'ready';
  elapsed = 0; money = 0; totalEarnedMoney = 0; kills = 0; xp = 0; level = 1;
  wallHealth = B.BARRICADE_BASE_HEALTH; wallMaxHealth = B.BARRICADE_BASE_HEALTH; wallReduction = 0; wallLevel = 0;
  /** Max HP at deployment (talents included); cards add fractions of this, so picks never compound. */
  wallStartHealth = B.BARRICADE_BASE_HEALTH;
  /** attackSpeed is the permanent (talent) factor; card bonuses are summed in attackSpeedBonus. */
  haste = 0; attackSpeed = 1; attackSpeedBonus = 0; skillRange = 1; choices: UpgradeCard[] = [];
  selectedCards: UpgradeCard[] = []; modifiers: Modifier[] = [];
  enemies: Enemy[] = []; mercenaries: Mercenary[] = []; skills: SkillSlot[] = [];
  levels = Object.fromEntries(Object.keys(MERCENARIES).map(k => [k, 1])) as Record<MercKind, number>;
  events: VisualEvent[] = []; zones: FireZone[] = []; mines: Mine[] = [];
  endless = false;
  /** Card-driven rules. Bonuses add up; percentages are fractions. */
  critChance = 0; critDamage = 1.5; pierce = 0; burnTimeBonus = 0; toxinGain = 0; shockGain = 0; chillGain = 0; stunGain = 0; thorns = 0;
  synergies = new Set<string>(); evolutions: Partial<Record<SkillId, string>> = {};
  rerollsThisLevel = 0; pity = 0;
  /** Curse penalties: skill cooldown and barricade damage multipliers. */
  cooldownPenalty = 1; wallVulnerability = 1;
  /** Star-map snapshot (§54 multiplicative growth; neutral = no talent). */
  perm: Required<Omit<PermanentEffects, 'modifiers' | 'wallHealth' | 'attackSpeed' | 'haste' | 'cores'>>;
  cores = new Set<CoreId>();
  freeRerolls = 0; picksLeft = 1; allies: Ally[] = [];
  private passiveTimer = 0; private blasts: { x: number; y: number; damage: number; toxic?: boolean }[] = [];
  private seed: number; private combatSeed: number; private cardSeed: number;
  /** Evolutions offered but not taken come back after a few levels instead of blocking a slot forever. */
  private evolutionDeferred: Record<string, number> = {}; private accumulator = 0; private spawnTimer = 0;
  private nextId = 1; private completedWaves = 0; private bossRushes = 0;
  constructor(seed = Math.floor(Math.random() * 0xffffffff), permanent?: PermanentEffects) {
    this.seed = seed >>> 0; this.combatSeed = (Math.imul(seed >>> 0, 2246822519) ^ 0x9e3779b9) >>> 0;
    this.cardSeed = (Math.imul(seed >>> 0, 3266489917) ^ 0x85ebca6b) >>> 0;
    const p = permanent;
    this.perm = { critChance: p?.critChance ?? 0, critDamage: p?.critDamage ?? 1, pierceRetention: p?.pierceRetention ?? 0.6, knockback: p?.knockback ?? 1,
      armorBreaker: p?.armorBreaker ?? 1, burnTime: p?.burnTime ?? 1, molotovRadius: p?.molotovRadius ?? 1, molotovTime: p?.molotovTime ?? 1,
      corrosionGain: p?.corrosionGain ?? 0, corrosionTime: p?.corrosionTime ?? 1, eroder: p?.eroder ?? 1, toxicResidue: p?.toxicResidue ?? 0, bioShield: p?.bioShield ?? 1,
      shockGain: p?.shockGain ?? 0, shockTime: p?.shockTime ?? 1, teslaSpeed: p?.teslaSpeed ?? 1, stunField: p?.stunField ?? 1,
      skillRange: p?.skillRange ?? 1, laserWidth: p?.laserWidth ?? 1, wallReduction: p?.wallReduction ?? 0, thorns: p?.thorns ?? 0,
      fortifyCost: p?.fortifyCost ?? 1, repairCost: p?.repairCost ?? 1, bounty: p?.bounty ?? 1, startMoney: p?.startMoney ?? 0,
      freeRerolls: p?.freeRerolls ?? 0, passiveIncome: p?.passiveIncome ?? 0, luck: p?.luck ?? 1 };
    if (permanent) {
      this.wallHealth = this.wallMaxHealth = this.wallStartHealth = B.BARRICADE_BASE_HEALTH * permanent.wallHealth;
      this.attackSpeed = permanent.attackSpeed; this.haste = permanent.haste;
      this.modifiers = permanent.modifiers.map(modifier => ({ ...modifier, tags: [...modifier.tags] }));
      for (const core of permanent.cores ?? []) this.cores.add(core);
    }
    // Star-map values that start a run at a different baseline than zero.
    this.critChance = this.perm.critChance; this.critDamage = 1.5 * this.perm.critDamage; this.toxinGain = this.perm.corrosionGain; this.shockGain = this.perm.shockGain;
    this.skillRange = this.perm.skillRange; this.wallReduction = this.perm.wallReduction; this.thorns = this.perm.thorns; this.freeRerolls = this.perm.freeRerolls;
    if (this.cores.has('coldsteel')) this.pierce = 2;
    // Core 亡者徵召: the barricade is a single plank (max health 1) for the whole run.
    if (this.cores.has('raisedead')) { this.wallHealth = this.wallMaxHealth = this.wallStartHealth = 1; }
    // Core 以牆為彈 (id kept from 黑市補給 so saves keep it): the wall feeds the guns, and takes more for it.
    if (this.cores.has('blackmarket')) this.wallVulnerability *= B.BULWARK_WALL_DAMAGE;
  }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 0x100000000; }
  /** Card draws have their own stream: rerolling or skipping a card never changes the horde. */
  private cardRandom() { this.cardSeed = (Math.imul(this.cardSeed, 1664525) + 1013904223) >>> 0; return this.cardSeed / 0x100000000; }
  /** A separate stream for crits, so enemy spawns never depend on how many shots landed. */
  private combatRandom() { this.combatSeed = (Math.imul(this.combatSeed, 1664525) + 1013904223) >>> 0; return this.combatSeed / 0x100000000; }
  get wave() { return !this.endless && this.elapsed >= FIELD.victorySeconds ? 40 : Math.floor(this.elapsed / FIELD.waveSeconds) + 1; }
  get clearedWave() { return Math.floor((this.elapsed + 1e-8) / FIELD.waveSeconds); }
  get xpNeeded() { return B.xpForLevel(this.level); }
  get score() { return runScore(this.elapsed, this.totalEarnedMoney); }
  /** When the next boss rush charges in. */
  get nextBossAt() { return B.BOSS_FIRST_SECONDS + this.bossRushes * B.BOSS_INTERVAL_SECONDS; }
  /** Seconds until the next boss rush while it is being announced; undefined otherwise. */
  get bossWarning() { const left = this.nextBossAt - this.elapsed; return left > 0 && left <= B.BOSS_WARNING_SECONDS ? left : undefined; }
  get boss() { return this.enemies.find(e => e.kind === 'boss' && e.hp > 0); }
  /** The opening squad: a rifleman with a grenade, ready at deployment. */
  start() {
    if (this.phase !== 'ready') return;
    this.mercenaries.push({ id: this.nextId++, kind: 'rifle', shotTimer: 0 });
    this.skills.push({ id: 'grenade', cooldown: this.skillCooldown('grenade') * B.SKILL_START_CHARGE });
    this.phase = 'running';
    if (this.perm.startMoney > 0) this.earn(this.perm.startMoney);
  }
  pause() { if (this.phase === 'running') this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = 'running'; }
  continueEndless() { if (this.phase === 'victory') { this.endless = true; this.phase = 'running'; } }
  upgradeCost(kind: MercKind) { return Math.ceil(calculateValue(B.UPGRADE_BASE_COST * B.UPGRADE_COST_GROWTH ** this.levels[kind], ['Economy.UpgradeCost'], this.modifiers)); }
  private get squadScale() { return this.cores.has('lonewolf') ? 4 : this.cores.has('uniform') ? 1.3 ** Math.max(0, this.mercenaries.length - 1) : 1; }
  private static levelScale(level: number, growth: number) { return growth ** (level - 1) * (level >= 10 ? 2 : 1) * (level >= 50 ? 3 : 1); }
  damageFor(kind: MercKind) {
    return MERCENARIES[kind].damage * DefenseRun.levelScale(this.levels[kind], kind === 'flame' ? B.FLAME_DAMAGE_PER_LEVEL : B.MERC_DAMAGE_PER_LEVEL) * this.squadScale * (B.MERC_TUNING[kind] ?? 1);
  }
  /** The squad's reference damage: a rifle shot at the highest mercenary level. Skills and spikes scale with it. */
  get skillPower() {
    const level = Math.max(1, ...this.mercenaries.map(m => this.levels[m.kind]));
    return MERCENARIES.rifle.damage * DefenseRun.levelScale(level, B.MERC_DAMAGE_PER_LEVEL) * this.squadScale;
  }
  intervalFor(kind: MercKind) {
    return MERCENARIES[kind].interval / (this.attackSpeed * (1 + this.attackSpeedBonus)) / (this.levels[kind] >= 25 ? 1.5 : 1)
      / (kind === 'tesla' ? this.perm.teslaSpeed : 1) / (this.cores.has('lonewolf') ? 1.5 : 1);
  }
  /** Seconds to this mercenary's next shot; core 集火射擊 shortens it while it keeps one target. */
  shotInterval(merc: Mercenary) {
    const focus = this.cores.has('focusfire') ? Math.min(4, 1 + 0.15 * (merc.focusStacks ?? 0)) : 1;
    return this.intervalFor(merc.kind) / focus;
  }
  /** Core 彈藥經濟: kinetic damage ×(1 + log₂(1 + money) ÷ 4); ×0.5 with no money left. */
  get ammoFactor() { return this.money > 0 ? 1 + Math.log2(1 + this.money) / 4 : 0.5; }
  /** How far up the road (from the barricade) this kind can shoot. */
  rangeFor(kind: MercKind) { return MERCENARIES[kind].range; }
  /** A skill's full cooldown, with evolutions, curses and cores. */
  skillCooldown(id: SkillId) {
    const evolution = this.evolutions[id], scale = evolution === 'hex' ? 1.3 : evolution === 'overload' ? 1.5 : 1;
    return effectiveCooldown(SKILLS[id].cooldown, this.haste) * scale * this.cooldownPenalty * (this.cores.has('lonewolf') ? 0.5 : 1);
  }
  /** Cores can close recruitment: 孤狼 keeps the opening rifleman alone, 制式部隊 only takes riflemen. */
  canRecruit(kind: MercKind) {
    if (this.mercenaries.length >= B.MAX_SQUAD || this.cores.has('lonewolf')) return false;
    if (this.cores.has('uniform')) return kind === 'rifle';
    return !this.mercenaries.some(m => m.kind === kind);
  }
  /** Adds a mercenary (from a recruit card). Free: the card is the price. */
  recruit(kind: MercKind): boolean {
    if (this.phase !== 'running' && this.phase !== 'choice') return false;
    if (!this.canRecruit(kind)) return false;
    this.mercenaries.push({ id: this.nextId++, kind, shotTimer: 0 }); return true;
  }
  canLearn(id: SkillId) { return this.skills.length < B.MAX_SKILLS && !this.skills.some(s => s.id === id); }
  learn(id: SkillId): boolean {
    if (!this.canLearn(id)) return false;
    this.skills.push({ id, cooldown: 0 }); return true;
  }
  upgrade(kind: MercKind): boolean {
    const cost = this.upgradeCost(kind);
    if (this.phase !== 'running' || !this.mercenaries.some(m => m.kind === kind) || this.money < cost) return false;
    this.money -= cost; this.levels[kind]++; return true;
  }
  get repairCost() { return Math.ceil(B.REPAIR_BASE_COST * B.REPAIR_COST_GROWTH ** this.wallLevel * this.perm.repairCost); }
  get fortifyCost() { return Math.ceil(B.FORTIFY_BASE_COST * B.FORTIFY_COST_GROWTH ** this.wallLevel * this.perm.fortifyCost * (this.cores.has('plunder') ? 0.6 : 1)); }
  /** Core 掠奪者 disables paid repairs. */
  get canRepair() { return !this.cores.has('plunder'); }
  repair(): boolean {
    if (!this.canRepair || this.phase !== 'running' || this.wallHealth >= this.wallMaxHealth || this.money < this.repairCost) return false;
    this.money -= this.repairCost; this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + calculateValue(this.wallMaxHealth * B.REPAIR_FRACTION, ['Defense.Repair'], this.modifiers)); return true;
  }
  /** Core 亡者徵召 locks the barricade at 1 max health. */
  get canFortify() { return !this.cores.has('raisedead'); }
  fortify(): boolean {
    if (!this.canFortify || this.phase !== 'running' || this.money < this.fortifyCost) return false;
    this.money -= this.fortifyCost; const increase = this.wallMaxHealth * B.FORTIFY_HEALTH_GAIN;
    this.wallMaxHealth += increase; this.wallHealth += increase; this.wallLevel++; return true;
  }
  choose(id: string): boolean {
    if (this.phase !== 'choice') return false;
    const card = this.choices.find(c => c.id === id); if (!card) return false;
    for (const offer of this.choices) if (offer.kind === 'evolution' && offer.id !== id) this.evolutionDeferred[offer.id] = this.level + 3;
    this.selectedCards.push(card);
    if (card.modifier) this.modifiers.push({ ...card.modifier, tags: [...card.modifier.tags] });
    // Cards without a value (hand-made in tests) take their definition at this level and base rarity.
    const fallback = cardDef(card.id), v = card.value ?? (fallback ? makeCard(fallback, undefined, this.level).value ?? 0 : 0);
    switch (card.effect) {
      case 'speed': this.attackSpeedBonus += v; break;
      case 'haste': this.haste += v; break;
      case 'radius': this.skillRange *= 1 + v; break;
      case 'wall': { if (!this.canFortify) break; const n = this.wallMaxHealth * v; this.wallHealth += n; this.wallMaxHealth += n; break; }
      case 'crit': this.critChance += v; break;
      case 'critDamage': this.critDamage += v; break;
      case 'pierce': this.pierce += Math.max(1, Math.floor(v)); break;
      case 'reduction': this.wallReduction = 1 - (1 - this.wallReduction) * (1 - Math.min(0.95, v)); break;
      case 'thorns': this.thorns += v; break;
      case 'airdrop': this.earn(calculateValue(25 * v * B.INCOME_GROWTH_PER_MINUTE ** (this.elapsed / 60), ['Economy.WaveReward'], this.modifiers)); break;
      case 'burnTime': this.burnTimeBonus += v; break;
      case 'toxinGain': this.toxinGain += v; break;
      case 'shockGain': this.shockGain += v; break;
      case 'chillGain': this.chillGain += v; break;
      case 'stunGain': this.stunGain += v; break;
      case 'synergy': this.synergies.add(card.id); break;
      case 'evolution': { const skill = card.skill ?? cardDef(card.id)?.skill; if (skill) this.evolutions[skill] = card.id; break; }
      case 'curse': this.applyCurse(card.id, v); break;
      case 'merc': { const kind = card.merc ?? cardDef(card.id)?.merc; if (kind) this.recruit(kind); break; }
      case 'skill': { const skill = card.skill ?? cardDef(card.id)?.skill; if (skill) this.learn(skill); break; }
    }
    // Core 黑市補給: two picks from five, then the battle resumes.
    if (this.picksLeft > 1) { this.picksLeft--; this.choices = this.choices.filter(c => c !== card); return true; }
    this.choices = []; this.phase = 'running'; this.checkLevel(); return true;
  }
  /** Black-market curses: the bonus now, the penalty for the rest of the run. */
  private applyCurse(id: string, v: number) {
    const add = (tags: Tag[], value: number) => this.modifiers.push({ kind: 'Add', tags, value });
    const shrinkWall = (k: number) => { this.wallMaxHealth *= k; this.wallStartHealth *= k; this.wallHealth = Math.min(this.wallHealth, this.wallMaxHealth); };
    if (id === 'curse_powder') { add(['Damage.Kinetic'], v); shrinkWall(0.85); }
    if (id === 'curse_fuel') { add(['Damage.Fire', 'Mechanic.DOT'], v); this.attackSpeedBonus -= 0.1; }
    if (id === 'curse_salvage') { add(['Economy.KillReward'], v); this.modifiers.push({ kind: 'More', tags: ['Defense.Repair'], value: 0.7 }); }
    if (id === 'curse_battery') { add(['Skill.Active'], v); this.cooldownPenalty *= 1.2; }
    if (id === 'curse_contract') { this.modifiers.push({ kind: 'More', tags: ['Economy.UpgradeCost'], value: 1 - v }); this.wallVulnerability *= 1.15; }
    if (id === 'curse_stim') { this.critChance += v; shrinkWall(0.8); }
  }
  private earn(amount: number) { this.money += amount; this.totalEarnedMoney += amount; }
  private checkLevel() {
    if (this.phase !== 'running' || this.xp < this.xpNeeded) return;
    this.xp -= this.xpNeeded; this.level++;
    this.rerollsThisLevel = 0; this.choices = this.draw(); this.phase = 'choice';
  }
  private count(id: string) { return this.selectedCards.filter(c => c.id === id).length; }
  /** Elements already in the build: from cards, mercenaries and skills. Synergies need two of them. */
  ownedElements(): Set<Element> {
    const owned = new Set<Element>();
    for (const card of this.selectedCards) if ((ELEMENTS as readonly string[]).includes(card.category)) owned.add(card.category as Element);
    for (const merc of this.mercenaries) for (const e of MERCENARIES[merc.kind].elements) owned.add(e);
    for (const skill of this.skills) for (const e of SKILLS[skill.id].elements) owned.add(e);
    return owned;
  }
  /** Evolutions whose recipe is complete, for owned skills that have not evolved yet. */
  readyEvolutions(): CardDef[] {
    if (this.level < B.EVOLUTION_MIN_LEVEL) return [];
    return CARD_DEFS.filter(def => def.kind === 'evolution' && def.skill && !this.evolutions[def.skill]
      && this.skills.some(s => s.id === def.skill)
      && Object.entries((def.recipe ?? []).reduce<Record<string, number>>((n, id) => ({ ...n, [id]: (n[id] ?? 0) + 1 }), {})).every(([id, need]) => this.count(id) >= need));
  }
  private rollRarity(forceRare: boolean): Rarity {
    if (forceRare) return 'rare';
    const w = rarityWeights(this.level), u = w.uncommon * this.perm.luck, r = w.rare * this.perm.luck, l = w.legendary * this.perm.luck;
    const roll = this.cardRandom() * (w.common + u + r + l);
    return roll < w.common ? 'common' : roll < w.common + u ? 'uncommon' : roll < w.common + u + r ? 'rare' : 'legendary';
  }
  /**
   * Draw weight per card category (2026-10-23 "讓玩家玩得爽"): the build pulls its own kind of cards.
   * Each mercenary of an element +0.6, each skill of it +0.4 (families get half for each member element),
   * each core that leans that way +0.6, each card already picked in the category +0.15 (at most +1.5).
   */
  affinity() {
    const w = new Map<string, number>();
    const add = (category: string, amount: number) => w.set(category, (w.get(category) ?? 1) + amount);
    const family = (e: Element) => (['火焰', '冷凍', '電能'] as Element[]).includes(e) ? '元素' : '物理';
    for (const merc of this.mercenaries) for (const e of MERCENARIES[merc.kind].elements) { add(e, 0.6); add(family(e), 0.3); }
    for (const skill of this.skills) for (const e of SKILLS[skill.id].elements) { add(e, 0.4); add(family(e), 0.2); }
    for (const core of this.cores) for (const category of CORE_AFFINITY[core] ?? []) add(category, 0.6);
    const picked = new Map<string, number>();
    for (const card of this.selectedCards) picked.set(card.category, (picked.get(card.category) ?? 0) + 1);
    for (const [category, n] of picked) add(category, Math.min(1.5, 0.15 * n));
    return w;
  }
  /** Recruit cards still on offer: kinds that could join the squad now. */
  private recruitPool() { return CARD_DEFS.filter(def => def.kind === 'merc' && def.merc && this.canRecruit(def.merc)); }
  /**
   * Three different cards. Until the squad is full, 1–2 of them recruit a mercenary (two on the very
   * first choice); a ready evolution takes a slot; the rest roll rarity and weighted picks.
   */
  private draw(): UpgradeCard[] {
    const offers: UpgradeCard[] = [], owned = this.ownedElements();
    const first = this.selectedCards.length === 0;
    this.picksLeft = 1;
    const size = 3;
    const take = (pool: CardDef[]) => { const pick = pool[Math.floor(this.cardRandom() * pool.length)]; if (pick) offers.push(makeCard(pick, undefined, this.level)); };
    const recruits = this.recruitPool();
    if (recruits.length) {
      const count = Math.min(recruits.length, first ? 2 : this.cardRandom() < 0.5 ? 1 : 2);
      for (let i = 0; i < count; i++) take(recruits.filter(def => !offers.some(o => o.id === def.id)));
    }
    const ready = this.readyEvolutions();
    const due = ready.filter(def => (this.evolutionDeferred[def.id] ?? 0) <= this.level);
    if (due.length && offers.length < size) offers.push(makeCard(due[Math.floor(this.cardRandom() * due.length)]!));
    let forceRare = this.pity >= PITY_DRAWS - 1;
    while (offers.length < size) {
      const rarity = this.rollRarity(forceRare); forceRare = false;
      const allowed = (def: CardDef, r: Rarity) => !offers.some(o => o.id === def.id) && (first ? STARTERS.includes(def.id)
        // A legendary roll is only for the normal cards that can be legendary (not skills or synergies).
        : r === 'legendary' ? def.kind === 'normal' && def.maxRarity === 'legendary'
        : def.kind === 'normal' ? rank(def.minRarity ?? 'common') <= rank(r) && rank(r) <= rank(def.maxRarity ?? 'rare')
        : def.kind === 'skill' ? this.canLearn(def.skill!)
        : def.kind === 'synergy' ? this.level >= B.SYNERGY_MIN_LEVEL && rank(r) >= rank('rare') && !this.synergies.has(def.id) && def.elements!.every(e => owned.has(e)) : false);
      let rolled = rarity, pool = CARD_DEFS.filter(def => allowed(def, rolled));
      if (!pool.length && rolled === 'legendary') { rolled = 'rare'; pool = CARD_DEFS.filter(def => allowed(def, rolled)); }
      if (!pool.length) { rolled = 'common'; pool = CARD_DEFS.filter(def => allowed(def, rolled)); }
      if (!pool.length) break;
      // Synergies are favoured when unlocked, skills while slots are free; every card leans towards the build
      // (affinity): the squad's and skills' elements, the equipped cores and the categories already picked.
      const affinity = this.affinity();
      const weight = (def: CardDef) => (def.kind === 'synergy' ? 1.5 : def.kind === 'skill' ? 0.8 : 1) * (affinity.get(def.category) ?? 1) * 0.95 ** this.count(def.id);
      let roll = this.cardRandom() * pool.reduce((sum, def) => sum + weight(def), 0), pick = pool[pool.length - 1]!;
      for (const def of pool) { roll -= weight(def); if (roll <= 0) { pick = def; break; } }
      const lowest = pick.minRarity ?? 'common', highest = pick.maxRarity ?? 'rare';
      offers.push(makeCard(pick, pick.fixedRarity ?? (rank(rolled) < rank(lowest) ? lowest : rank(rolled) > rank(highest) ? highest : rolled), this.level));
    }
    // Evolutions are guaranteed separately, so they do not count towards the rare-card pity.
    this.pity = offers.some(o => o.kind !== 'evolution' && rank(o.rarity ?? 'common') >= rank('rare')) ? 0 : this.pity + 1;
    return offers;
  }
  /** §11: re-draw the three cards for battlefield money; the price follows income and rises per reroll. */
  get rerollCost() { return this.freeRerolls > 0 ? 0 : Math.ceil(8 * B.INCOME_GROWTH_PER_MINUTE ** (this.elapsed / 60) * 1.6 ** this.rerollsThisLevel); }
  /** Kept for the UI; every core allows rerolls since 黑市補給 became 以牆為彈 (2026-10-23). */
  get canReroll() { return true; }
  reroll(): boolean {
    if (this.phase !== 'choice' || this.money < this.rerollCost) return false;
    if (this.freeRerolls > 0) this.freeRerolls--; else { this.money -= this.rerollCost; this.rerollsThisLevel++; }
    this.choices = this.draw(); return true;
  }
  private visual(kind: VisualEvent['kind'], x: number, y: number, color: string, radius = 0, fromX?: number, fromY?: number) {
    const life = kind === 'shot' ? 0.13 : kind === 'blast' || kind === 'toxic' ? 0.55 : 0.4;
    const event: VisualEvent = { kind, x, y, color, radius, fromX, fromY, life, maxLife: life };
    this.events.push(event); return event;
  }
  // ---------- statuses ----------
  /** Core 痛苦精通: while a crit resolves, the statuses it applies are this much stronger. */
  private statusBoost = 1;
  private get burnTimeScale() { return (1 + this.burnTimeBonus) * this.perm.burnTime; }
  /** The strongest-burn rule, or stacked layers with core 千層烈焰. */
  private applyBurnRun(enemy: Enemy, power: number, duration: number) {
    if (!this.cores.has('layers')) { applyBurn(enemy, power, duration); return; }
    if (!(power > 0) || !(duration > 0)) return;
    if (enemy.burnDuration <= 0) { enemy.burnPower = 0; enemy.burnLayers = 0; enemy.burnFlammability = 0; }
    if ((enemy.burnLayers ?? 0) < 10) { enemy.burnPower += power * 0.35; enemy.burnLayers = (enemy.burnLayers ?? 0) + 1; }
    enemy.burnDuration = Math.max(enemy.burnDuration, duration);
  }
  private burn(enemy: Enemy, power: number, duration: number, sourceTags: readonly Tag[]) {
    const tags = withFamily([...sourceTags.filter(t => !t.startsWith('Damage.') && t !== 'Mechanic.Projectile'), 'Damage.Fire', 'Mechanic.DOT', 'Status.Burning']);
    this.applyBurnRun(enemy, calculateValue(power, tags, this.modifiers) * this.statusBoost, duration * this.burnTimeScale);
  }
  /** 毒素: flat points off defense. Reaching zero detonates the zombie once (queued, resolved after the step's hits). */
  private poison(enemy: Enemy, value: number) {
    if (!(value > 0) || enemy.hp <= 0) return;
    enemy.toxin += value * (1 + this.toxinGain) * this.statusBoost; enemy.toxinDuration = B.TOXIN_DURATION * this.perm.corrosionTime;
    if (!enemy.toxinBurst && enemy.toxin >= enemy.defense) {
      enemy.toxinBurst = true;
      if (this.blasts.length < 300) this.blasts.push({ x: enemy.x, y: enemy.y, damage: enemy.maxHp * B.TOXIN_BURST, toxic: true });
    }
  }
  /** Electric: the shock meter raises damage taken; a paralysed zombie takes the full bonus. */
  vulnerability(enemy: Enemy) {
    const m = enemy.meters.shock, k = B.STATUS.shock.vulnerability;
    if (m.timer > 0) return 1 + k;
    return m.value > 0 ? 1 + k * Math.min(1, m.value / meterThreshold(enemy, 'shock', this.elapsed)) : 1;
  }
  isFrozen(enemy: Enemy) { return enemy.meters.chill.timer > 0; }
  isStunned(enemy: Enemy) { return enemy.meters.stun.timer > 0; }
  isParalyzed(enemy: Enemy) { return enemy.meters.shock.timer > 0; }
  /** Fills a meter; a full one triggers its control, empties, and escalates the next threshold. */
  private build(enemy: Enemy, kind: MeterKind, amount: number) {
    const m = enemy.meters[kind];
    if (m.timer > 0 || !(amount > 0) || enemy.hp <= 0) return;
    m.value += amount; m.idle = 0;
    if (m.value < meterThreshold(enemy, kind, this.elapsed)) return;
    m.count = (this.elapsed - m.last <= B.STATUS_WINDOW ? m.count : 0) + 1; m.last = this.elapsed; m.value = 0;
    const def = B.STATUS[kind];
    m.timer = def.duration * (kind === 'shock' ? this.perm.shockTime : 1);
    const tags: Tag[] = kind === 'chill' ? ['Damage.Cold', 'Status.Frozen'] : kind === 'shock' ? ['Damage.Electric', 'Status.Paralyzed'] : ['Damage.Blast', 'Status.Stunned'];
    this.visual(kind === 'chill' ? 'freeze' : kind === 'shock' ? 'paralyze' : 'stun', enemy.x, enemy.y, kind === 'chill' ? '#bfe8ff' : kind === 'shock' ? '#c7f5ff' : '#ffe9a8', 20).target = enemy.id;
    if (def.burst > 0) this.hit(enemy, { baseDamage: enemy.maxHp * def.burst, tags }, { build: 0 });
  }
  /** Fills the meters of the elements this hit carried, from the damage it dealt. */
  private buildFrom(enemy: Enemy, tags: readonly Tag[], dealt: number, scale: number) {
    if (!(dealt > 0) || scale <= 0) return;
    const k = scale * this.statusBoost;
    if (tags.includes('Damage.Cold')) this.build(enemy, 'chill', dealt * B.STATUS.chill.rate * (1 + this.chillGain) * k);
    if (tags.includes('Damage.Electric')) {
      const conductor = this.synergies.has('conductor') ? Math.min(3, 1 + CONDUCTOR * enemy.toxin / 10) : 1;
      this.build(enemy, 'shock', dealt * B.STATUS.shock.rate * (1 + this.shockGain) * conductor * k);
    }
    if (tags.includes('Damage.Blast')) this.build(enemy, 'stun', dealt * B.STATUS.stun.rate * (1 + this.stunGain) * k);
  }
  /**
   * Grenade push. Bosses only budge a quarter (a hasted grenade spam held them in place for good), and
   * nobody is pushed back off the road (x < 0), where no gun can aim at them.
   */
  private knockBack(enemy: Enemy, distance: number) {
    if (enemy.x <= 0) return;
    enemy.x = Math.max(0, enemy.x - distance * (enemy.kind === 'boss' ? 0.25 : 1)); this.invalidateGrid();
  }
  /** Where the searchlight points now; core 探照獵殺 widens it. */
  get searchlight() { return searchlightAt(this.elapsed, this.cores.has('pointblank')); }
  isLit(enemy: Enemy, light = this.searchlight) { return Math.abs(enemy.x - light.x) <= light.radius && Math.hypot(enemy.x - light.x, enemy.y - light.y) <= light.radius; }
  /**
   * Multipliers every source of damage takes from cores, burns and spikes included: 血債血償 grows as the
   * barricade falls; 探照獵殺 doubles damage in the light and halves it outside.
   */
  dealtScale(enemy: Enemy) {
    let k = 1;
    if (this.cores.has('bloodprice')) k *= 1 + (B.BLOOD_MAX - 1) * Math.max(0, 1 - this.wallHealth / this.wallMaxHealth);
    if (this.cores.has('pointblank')) k *= this.isLit(enemy) ? B.SEARCHLIGHT_FACTOR : 1 / B.SEARCHLIGHT_FACTOR;
    return k;
  }
  /** Multipliers that depend on the target or on cores, after defense. */
  private damageScale(enemy: Enemy, tags: readonly Tag[], direct: boolean) {
    let k = 1;
    if (enemy.kind === 'armored' || enemy.kind === 'elite' || enemy.kind === 'boss') k *= this.perm.armorBreaker;
    if (enemy.defense >= 50) k *= this.perm.eroder;
    k *= this.dealtScale(enemy);
    if (this.cores.has('autofire') && tags.includes('Skill.Active')) k *= 0.85;
    if (this.cores.has('rotation') && direct) {
      const element = (['Electric', 'Cold', 'Fire', 'Toxin', 'Blast'] as const).find(t => tags.includes(`Damage.${t}`)) ?? 'Kinetic';
      if (enemy.lastElement) k *= enemy.lastElement === element ? 0.7 : 1.6;
      enemy.lastElement = element;
    }
    return k;
  }
  /** Lingering areas act on at most ZONE_CAP enemies, the nearest to their centre. */
  private igniteZone(zone: FireZone, pulse: boolean) {
    const contacts = new Set<number>();
    let inside = this.within(zone.x, zone.y, zone.radius);
    if (inside.length > B.ZONE_CAP) inside = nearestFirst(inside, zone.x, zone.y).slice(0, B.ZONE_CAP);
    for (const enemy of inside) {
      contacts.add(enemy.id);
      // First contact is immediate; remaining inside reapplies at 1 Hz, never once per frame.
      if (zone.kind === 'gas') {
        if (pulse || !zone.contacts.has(enemy.id)) { this.poison(enemy, 6); this.hit(enemy, { baseDamage: zone.power, tags: ['Damage.Toxin', 'Mechanic.AOE', 'Skill.Active', 'Weapon.gas'] }); }
        continue;
      }
      if (zone.spread && enemy.burnDuration > 0) continue;
      if (pulse || !zone.contacts.has(enemy.id)) this.applyBurnRun(enemy, zone.power, 3 * this.burnTimeScale);
    }
    zone.contacts = contacts;
  }
  /**
   * One hit. `forceCrit` is the rifle's Lv100 third shot and the sniper skill; `build` scales how much the
   * hit fills the status meters (0 for control bursts, so they never chain into themselves).
   */
  private hit(enemy: Enemy, hit: DamageInstance, opts: { forceCrit?: boolean; build?: number } = {}): number {
    if (enemy.hp <= 0) return 0;
    const tags = withFamily(hit.tags);
    const direct = hit.baseDamage > 0 && !tags.includes('Mechanic.DOT') && !tags.some(t => t.startsWith('Status.'));
    // Core 冷鋼紀律 never crits but its kinetic damage ignores half the armor; core 痛苦精通 moves the crit onto statuses.
    const crit = direct && !this.cores.has('coldsteel') && (!!opts.forceCrit || (this.critChance > 0 && this.combatRandom() < this.critChance));
    const agony = crit && this.cores.has('agony');
    const kinetic = tags.includes('Damage.Kinetic');
    const defense = kinetic && this.cores.has('coldsteel') ? enemy.defense * 0.5 : enemy.defense;
    const result = calculateDamage({ baseDamage: crit && !agony ? hit.baseDamage * this.critDamage : hit.baseDamage, tags },
      { defense, toxin: enemy.toxin, resist: enemy.resist, vulnerability: this.vulnerability(enemy) }, this.modifiers);
    let final = result.final * this.damageScale(enemy, tags, direct);
    // Synergy (kinetic + electric): shocked targets take the shock multiplier once more on direct kinetic hits.
    if (this.synergies.has('railgun') && direct && kinetic) final *= result.shockMultiplier;
    // Core 彈藥經濟: money is ammunition for every kinetic hit.
    if (this.cores.has('ammoeco') && kinetic) final *= this.ammoFactor;
    // Core 焚化協議: every direct hit becomes a burn at 80% instead of damage.
    let cremation = 0;
    if (direct && this.cores.has('cremation')) { cremation = final * 0.8; final = 0; }
    enemy.hp -= final; enemy.hitFlash = 0.1;
    // Hits under 0.1% of the target's max HP still count but create no event: late waves land thousands of
    // them a second, and their damage numbers were most of the drawing work.
    if (final > 0 && (crit || final >= enemy.maxHp * TINY_HIT)) this.events.push({ kind: 'hit', x: enemy.x, y: enemy.y, color: '', life: 0.12, maxLife: 0.12, radius: 0,
      amount: final, enemy: enemy.kind, target: enemy.id, skill: tags.includes('Skill.Active'), crit });
    // A killing blow lands before any on-hit effect, so "died while burning" means it was already burning.
    if (enemy.hp <= 0) { this.kill(enemy); return final; }
    this.statusBoost = agony ? this.critDamage : 1;
    this.buildFrom(enemy, tags, final, opts.build ?? 1);
    if (cremation > 0) this.burn(enemy, cremation, 3, tags);
    // Several copies of a status card merge into one stronger application per hit (powers add up):
    // ten ignite cards must not mean ten burns a shot, each adding a layer of flammability.
    // Core 千層烈焰 keeps one layer per card, so its ten-layer cap still means ten cards' worth.
    let ignite = 0, toxin = 0, shock = 0, chill = 0, blast = 0;
    const layered = this.cores.has('layers');
    for (const modifier of result.specials) {
      if (modifier.rule === 'ignite') { if (layered) this.burn(enemy, modifier.value * hit.baseDamage, 4, tags); else ignite += modifier.value; }
      if (modifier.rule === 'toxin') toxin += modifier.value;
      if (modifier.rule === 'shock') shock += modifier.value;
      if (modifier.rule === 'chill') chill += modifier.value;
      if (modifier.rule === 'blast') blast += modifier.value;
    }
    if (ignite > 0 && hit.baseDamage > 0) this.burn(enemy, ignite * hit.baseDamage, 4, tags);
    if (toxin > 0) this.poison(enemy, toxin);
    const auto = tags.includes('Skill.AutoAttack');
    if (auto && direct && tags.includes('Damage.Kinetic')) {
      if (this.synergies.has('phosphorus')) this.burn(enemy, final * PHOSPHORUS, 3, tags.filter(t => t !== 'Skill.AutoAttack'));
      if (this.synergies.has('acidcore')) this.poison(enemy, ACIDCORE);
    }
    if (this.synergies.has('overheat') && auto && (enemy.meters.shock.value > 0 || enemy.meters.shock.timer > 0) && enemy.burnDuration > 0)
      enemy.burnFlammability = Math.min(MAX_FLAMMABILITY, enemy.burnFlammability + 1);
    this.statusBoost = 1;
    // Ammo that adds another element: a second, smaller hit of that element (never an auto attack itself, so no loops).
    const extra = (type: 'Cold' | 'Electric', share: number) => {
      if (share > 0 && hit.baseDamage > 0 && enemy.hp > 0) this.hit(enemy, { baseDamage: hit.baseDamage * share, tags: [...PROC_TAGS[type], ...tags.filter(t => t.startsWith('Mercenary.'))] });
    };
    extra('Electric', shock); extra('Cold', chill);
    if (blast > 0 && hit.baseDamage > 0) {
      const splash = this.within(enemy.x, enemy.y, BLAST_SPLASH_RADIUS).filter(o => o !== enemy);
      for (const { enemy: other, k } of this.share(splash, enemy.x, enemy.y, 'auto'))
        this.hit(other, { baseDamage: hit.baseDamage * blast * k, tags: ['Damage.Blast', 'Mechanic.AOE', 'Mechanic.Explosion', 'Mechanic.Proc'] });
    }
    if (enemy.hp <= 0 && !this.dead.has(enemy)) this.kill(enemy);
    return final;
  }
  /** Zombies already paid out this step (a proc can finish one that its own hit already killed). */
  private dead = new WeakSet<Enemy>();
  private kill(enemy: Enemy) {
    if (this.dead.has(enemy)) return;
    this.dead.add(enemy);
    const boss = enemy.kind === 'elite' || enemy.kind === 'boss';
    const reward = calculateValue(enemy.reward, ['Economy.KillReward'], this.modifiers) * (boss ? this.perm.bounty : 1) * (this.cores.has('corpseblast') ? 0.7 : 1);
    if (this.cores.has('plunder')) this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + this.wallMaxHealth * 0.01);
    // Talent 毒霧殘留: a poisoned death spreads toxin to its neighbours.
    if (this.perm.toxicResidue > 0 && enemy.toxin > 0)
      for (const e of this.enemies) if (e !== enemy && e.hp > 0 && Math.abs(e.x - enemy.x) < 50 && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 50) this.poison(e, this.perm.toxicResidue * 10);
    // Core 屍爆連鎖: queued so chains resolve over the step instead of recursing.
    if (this.cores.has('corpseblast') && this.blasts.length < 300) this.blasts.push({ x: enemy.x, y: enemy.y, damage: enemy.maxHp * 0.2 });
    // Core 亡者徵召: some ordinary corpses get back up on our side.
    if (this.cores.has('raisedead') && (enemy.kind === 'walker' || enemy.kind === 'runner') && this.allies.length < 40 && this.combatRandom() < 0.3)
      this.allies.push({ id: this.nextId++, x: enemy.x, y: enemy.y, power: enemy.maxHp * 1.5, age: 0 });
    // Evolution (wildfire): a burning death leaves a small fire behind. It only lights enemies that are not
    // burning yet, at 40% of the dead one's burn, so the chain dies out instead of running through every wave.
    if (this.evolutions.molotov === 'wildfire' && enemy.burnDuration > 0 && enemy.burnPower > 0)
      this.zones.push({ x: enemy.x, y: enemy.y, radius: 35, remaining: 3, power: enemy.burnPower * 0.4, pulseTimer: 1, contacts: new Set(), spread: true });
    this.kills++; this.earn(reward); this.xp += enemy.xp;
    Object.assign(this.visual('kill', enemy.x, enemy.y, ENEMIES[enemy.kind].color, 22), { amount: reward, enemy: enemy.kind, target: enemy.id });
  }
  /**
   * Instant area damage (see Balance.AREA): the `cap` targets nearest (cx, cy), each with its share `k` of
   * a budget of `full` hits. Up to `full` targets take full damage; a bigger crowd splits the same total.
   */
  private share(targets: readonly Enemy[], cx: number, cy: number, rule: keyof typeof B.AREA) {
    const { full, cap } = B.AREA[rule];
    const list = targets.length > cap ? nearestFirst(targets, cx, cy).slice(0, cap) : targets;
    const k = list.length > full ? full / list.length : 1;
    return list.map(enemy => ({ enemy, k }));
  }
  /** Everyone inside a circle. */
  /**
   * Spatial grid for circle queries: rebuilt lazily after anyone moves, spawns or is pushed. Late waves hold
   * thousands of zombies and hundreds of fire zones; a whole-field scan per zone per step was 85% of the time.
   */
  private grid?: Map<number, Enemy[]>; private gridSource?: Enemy[];
  private invalidateGrid() { this.grid = undefined; }
  private gridOf() {
    if (this.grid && this.gridSource === this.enemies) return this.grid;
    this.gridSource = this.enemies;
    const grid = new Map<number, Enemy[]>();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const key = cellKey(Math.floor(e.x / GRID_CELL), Math.floor(e.y / GRID_CELL));
      const cell = grid.get(key); if (cell) cell.push(e); else grid.set(key, [e]);
    }
    return this.grid = grid;
  }
  /** Everyone inside a circle (in spawn order, like a scan of the enemy list). */
  private within(x: number, y: number, radius: number) {
    const grid = this.gridOf(), out: Enemy[] = [];
    const x0 = Math.floor((x - radius) / GRID_CELL), x1 = Math.floor((x + radius) / GRID_CELL);
    const y0 = Math.floor((y - radius) / GRID_CELL), y1 = Math.floor((y + radius) / GRID_CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const cell = grid.get(cellKey(cx, cy)); if (!cell) continue;
      for (const e of cell) if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= radius) out.push(e);
    }
    // Keep the old order (spawn order = id order) so results never depend on the grid layout.
    return out.length > 1 ? out.sort((a, b) => a.id - b.id) : out;
  }
  cast(slot: number, x: number, y: number): boolean {
    this.invalidateGrid();
    const skill = this.skills[slot];
    if (!skill || this.phase !== 'running' || skill.cooldown > 1e-8 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > FIELD.wallX || y < 65 || y > 390) return false;
    // Core 血債血償: every cast costs a share of the barricade, but never the last point of it.
    if (this.cores.has('bloodprice')) this.wallHealth = Math.max(Math.min(1, this.wallHealth), this.wallHealth - this.wallMaxHealth * B.BLOOD_SKILL_COST);
    const def = SKILLS[skill.id], evolution = this.evolutions[skill.id];
    const origin = mercPosition(slot), base = this.skillPower * (B.SKILL_TUNING[skill.id] ?? 1), range = this.skillRange;
    const weapon = `Weapon.${skill.id}` as Tag;
    switch (skill.id) {
      case 'grenade': {
        const tags: Tag[] = ['Damage.Blast', 'Mechanic.AOE', 'Mechanic.Explosion', 'Mechanic.Knockback', 'Skill.Active', weapon];
        const radius = def.radius * range * (evolution === 'hex' ? 1.5 : 1);
        const damage = base * 5 * (evolution === 'hex' ? 1.5 : evolution === 'double' ? cardDef('double')!.value : 1);
        const blast = (bx: number, by: number) => {
          for (const { enemy, k } of this.share(this.within(bx, by, radius), bx, by, 'skill')) { this.hit(enemy, { baseDamage: damage * k, tags }); this.knockBack(enemy, 40 * this.perm.knockback); }
          this.visual('blast', bx, by, def.color, radius);
          if (evolution === 'frag') {
            // Six fragments, each striking the living enemy nearest the blast.
            const struck = new Set<Enemy>();
            for (let i = 0; i < 6; i++) {
              let near: Enemy | undefined, best = radius * 2;
              for (const e of this.enemies) { const d = Math.hypot(e.x - bx, e.y - by); if (e.hp > 0 && !struck.has(e) && d < best) { best = d; near = e; } }
              if (!near) { if (!struck.size) break; struck.clear(); i--; continue; }
              struck.add(near); this.hit(near, { baseDamage: damage * cardDef('frag')!.value, tags });
            }
          }
        };
        blast(x, y);
        if (evolution === 'double') blast(Math.max(0, x - 45), Math.min(390, Math.max(65, y + (y > 225 ? -50 : 50))));
        break;
      }
      case 'molotov': {
        const tags: Tag[] = ['Damage.Fire', 'Mechanic.AOE', 'Mechanic.DOT', 'Skill.Active', weapon];
        const radius = def.radius * range * this.perm.molotovRadius * (evolution === 'inferno' ? 1.6 : 1);
        const power = calculateValue(base * 3, withFamily(tags), this.modifiers) * (evolution === 'napalm' ? 2 : 1);
        const zone: FireZone = { kind: 'fire', x, y, radius, remaining: (evolution === 'napalm' ? 4.2 : evolution === 'inferno' ? 8 : 6) * this.perm.molotovTime, power, pulseTimer: 1, contacts: new Set() };
        this.igniteZone(zone, false); this.zones.push(zone);
        this.visual('blast', x, y, def.color, radius);
        break;
      }
      case 'laser': {
        const radius = def.radius * range * this.perm.laserWidth;
        const tags: Tag[] = ['Damage.Electric', 'Mechanic.Pierce', 'Skill.Active', weapon];
        const ticks = evolution === 'hifreq' ? 5 : 1;
        const damage = base * 9 * (evolution === 'overload' ? 2.5 : evolution === 'hifreq' ? cardDef('hifreq')!.value : 1);
        const mainHits = new Set<Enemy>();
        const beam = (ox: number, oy: number, ux: number, uy: number, width: number, scale: number, skip?: Set<Enemy>, record?: Set<Enemy>) => {
          let first: Enemy | undefined, firstAlong = Infinity;
          const struck: Enemy[] = [];
          for (const enemy of this.enemies) {
            if (enemy.hp <= 0 || skip?.has(enemy)) continue;
            const ex = enemy.x - ox, ey = enemy.y - oy, along = ex * ux + ey * uy;
            if (along >= 0 && Math.abs(ex * uy - ey * ux) <= width) {
              if (along < firstAlong) { firstAlong = along; first = enemy; }
              record?.add(enemy); struck.push(enemy);
            }
          }
          for (const { enemy, k } of this.share(struck, ox, oy, 'skill'))
            for (let t = 0; t < ticks; t++) this.hit(enemy, { baseDamage: damage * scale * k, tags }, { build: 2 });
          return first;
        };
        const dx = x - origin.x, dy = y - origin.y, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
        const first = beam(origin.x, origin.y, ux, uy, radius, 1, undefined, mainHits);
        this.visual('laser', origin.x + ux * 1100, origin.y + uy * 1100, def.color, radius, origin.x, origin.y);
        if (evolution === 'refract' && first) {
          // Two side beams split off the first enemy hit, angled away from the main line.
          for (const turn of [-0.45, 0.45]) {
            const c = Math.cos(turn), sn = Math.sin(turn), vx = ux * c - uy * sn, vy = ux * sn + uy * c;
            beam(first.x, first.y, vx, vy, radius * 0.6, cardDef('refract')!.value, mainHits);
            this.visual('laser', first.x + vx * 700, first.y + vy * 700, def.color, radius * 0.6, first.x, first.y);
          }
        }
        break;
      }
      case 'cryobomb': {
        const radius = def.radius * range, tags: Tag[] = ['Damage.Cold', 'Mechanic.AOE', 'Skill.Active', weapon];
        for (const { enemy, k } of this.share(this.within(x, y, radius), x, y, 'skill')) this.hit(enemy, { baseDamage: base * 4 * k, tags }, { build: 2 });
        this.visual('blast', x, y, def.color, radius);
        break;
      }
      case 'gas': {
        const radius = def.radius * range;
        const zone: FireZone = { kind: 'gas', x, y, radius, remaining: 6, power: base * 0.6, pulseTimer: 1, contacts: new Set() };
        this.igniteZone(zone, false); this.zones.push(zone);
        this.visual('toxic', x, y, def.color, radius);
        break;
      }
      case 'mortar': {
        const radius = def.radius * range, tags: Tag[] = ['Damage.Blast', 'Mechanic.AOE', 'Mechanic.Explosion', 'Skill.Active', weapon];
        for (let i = 0; i < 5; i++) {
          const a = this.combatRandom() * Math.PI * 2, r = Math.sqrt(this.combatRandom()) * radius;
          const sx = Math.min(FIELD.wallX, Math.max(0, x + Math.cos(a) * r)), sy = Math.min(390, Math.max(65, y + Math.sin(a) * r));
          for (const { enemy, k } of this.share(this.within(sx, sy, 40 * range), sx, sy, 'skill')) this.hit(enemy, { baseDamage: base * 2.5 * k, tags });
          this.visual('blast', sx, sy, def.color, 40 * range);
        }
        break;
      }
      case 'emp': {
        const radius = def.radius * range, tags: Tag[] = ['Damage.Electric', 'Mechanic.AOE', 'Skill.Active', weapon];
        for (const { enemy, k } of this.share(this.within(x, y, radius), x, y, 'skill')) this.hit(enemy, { baseDamage: base * 3 * k, tags }, { build: 3 });
        this.visual('blast', x, y, def.color, radius);
        break;
      }
      case 'strafe': {
        // A band across the whole road at the chosen depth.
        const depth = def.radius * range, tags: Tag[] = ['Damage.Kinetic', 'Mechanic.RapidFire', 'Skill.Active', weapon];
        const band = this.enemies.filter(e => e.hp > 0 && Math.abs(e.x - x) <= depth);
        for (const { enemy, k } of this.share(band, x, 225, 'skill'))
          for (let i = 0; i < 6 && enemy.hp > 0; i++) this.hit(enemy, { baseDamage: base * 0.8 * k, tags });
        this.visual('laser', x, 390, def.color, depth, x, 65);
        break;
      }
      case 'snipe': {
        const tags: Tag[] = ['Damage.Kinetic', 'Damage.Cold', 'Skill.Active', weapon];
        const target = this.within(x, y, def.radius * range).sort((a, b) => b.hp - a.hp)[0];
        if (target) { this.hit(target, { baseDamage: base * 30, tags }, { forceCrit: true }); this.visual('shot', target.x, target.y, def.color, 0, origin.x, origin.y); }
        break;
      }
      case 'minefield': {
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + i * Math.PI / 2, r = def.radius * range;
          this.mines.push({ x: Math.min(FIELD.wallX - 20, Math.max(0, x + Math.cos(a) * r)), y: Math.min(390, Math.max(65, y + Math.sin(a) * r)), remaining: 20, damage: base * 4 });
        }
        break;
      }
    }
    skill.cooldown = this.skillCooldown(skill.id);
    this.resolveBlasts();
    this.enemies = this.enemies.filter(e => e.hp > 0); this.checkLevel(); return true;
  }
  /** 地雷陣: a mine goes off when a zombie steps within reach, burning and blasting everyone near. */
  private advanceMines(dt: number) {
    if (!this.mines.length) return;
    const tags: Tag[] = ['Damage.Blast', 'Damage.Fire', 'Mechanic.AOE', 'Mechanic.Explosion', 'Skill.Active', 'Weapon.minefield'];
    for (const mine of this.mines) {
      mine.remaining -= dt;
      if (mine.remaining <= 0 || !this.enemies.some(e => e.hp > 0 && Math.abs(e.x - mine.x) < 22 && Math.abs(e.y - mine.y) < 22)) continue;
      for (const { enemy, k } of this.share(this.within(mine.x, mine.y, 50 * this.skillRange), mine.x, mine.y, 'skill')) { this.hit(enemy, { baseDamage: mine.damage * k, tags }); this.burn(enemy, mine.damage * 0.5 * k, 3, tags); }
      this.visual('blast', mine.x, mine.y, SKILLS.minefield.color, 50 * this.skillRange);
      mine.remaining = 0;
    }
    this.mines = this.mines.filter(m => m.remaining > 0);
  }
  /** Queued explosions: 毒爆 (toxin, once per zombie) and core 屍爆連鎖 (kinetic). Each may queue more; bounded per step. */
  private resolveBlasts() {
    for (let n = 0; n < 200 && this.blasts.length; n++) {
      const b = this.blasts.shift()!;
      const radius = b.toxic ? B.TOXIN_BURST_RADIUS : 45;
      const tags: Tag[] = b.toxic ? ['Damage.Toxin', 'Mechanic.AOE', 'Mechanic.Explosion'] : ['Damage.Kinetic', 'Mechanic.AOE', 'Mechanic.Explosion'];
      for (const { enemy: e, k } of this.share(this.within(b.x, b.y, radius), b.x, b.y, 'auto')) this.hit(e, { baseDamage: b.damage * k, tags });
      if (b.toxic || n % 3 === 0) this.visual(b.toxic ? 'toxic' : 'blast', b.x, b.y, b.toxic ? '#a6c46a' : '#f8b968', radius);
    }
  }
  /** Core 亡者徵召: raised corpses walk back up the road and explode on the first enemy they reach. */
  private advanceAllies(dt: number) {
    const tags: Tag[] = ['Damage.Kinetic', 'Mechanic.AOE', 'Mechanic.Explosion'];
    for (const ally of this.allies) {
      ally.age += dt; ally.x -= 70 * dt;
      const contact = this.enemies.find(e => e.hp > 0 && Math.abs(e.x - ally.x) < 20 && Math.abs(e.y - ally.y) < 24);
      if (!contact && ally.x > -10 && ally.age < 15) continue;
      if (contact) {
        for (const { enemy: e, k } of this.share(this.within(ally.x, ally.y, 50), ally.x, ally.y, 'auto')) this.hit(e, { baseDamage: ally.power * k, tags });
        this.visual('blast', ally.x, ally.y, '#b5cc7f', 50);
      }
      ally.age = Infinity;
    }
    this.allies = this.allies.filter(a => a.age !== Infinity);
  }
  /** Core 自動火控: a ready skill fires at the densest group (a sample of the enemies closest to the wall). */
  private autoCast() {
    for (let slot = 0; slot < this.skills.length; slot++) {
      const skill = this.skills[slot]!;
      if (skill.cooldown > 1e-8) continue;
      const pool = this.enemies.filter(e => e.hp > 0 && e.x >= 20 && e.x <= FIELD.wallX).sort((a, b) => b.x - a.x).slice(0, 30);
      if (!pool.length) return;
      const r = SKILLS[skill.id].radius * this.skillRange;
      let best = pool[0]!, score = -1;
      for (const e of pool) { let n = 0; for (const o of pool) if (Math.hypot(o.x - e.x, o.y - e.y) <= r) n++; if (n > score) { score = n; best = e; } }
      this.cast(slot, Math.min(FIELD.wallX, best.x), Math.min(390, Math.max(65, best.y)));
      if (this.phase !== 'running') return;
    }
  }
  private nearest(from: Enemy, range: number, skip?: Set<Enemy>) {
    let best: Enemy | undefined, distance = range;
    for (const e of this.enemies) { const d = Math.hypot(e.x - from.x, e.y - from.y); if (e !== from && e.hp > 0 && !skip?.has(e) && d <= distance) { distance = d; best = e; } }
    return best;
  }
  private spawn(forced?: EnemyKind) {
    let kind: EnemyKind = forced ?? 'walker';
    if (!forced) {
      const roll = this.random();
      let threshold = 0;
      // Hazmat (elemental resistance) arrives a little before the armored (physical) specialist.
      const roster: [EnemyKind, number, number][] = [['elite', 150, 0.07], ['armored', 75, 0.12], ['hazmat', 60, 0.1], ['brute', 45, 0.18], ['runner', 22, 0.22]];
      for (const [candidate, unlock, weight] of roster) {
        if (this.elapsed < unlock) continue;
        threshold += weight;
        if (roll < threshold) { kind = candidate; break; }
      }
    }
    const def = ENEMIES[kind], minutes = this.elapsed / 60;
    const hp = def.hp * B.ENEMY_HP_SCALE * B.ENEMY_HP_GROWTH_PER_MINUTE ** minutes * (kind === 'boss' ? B.BOSS_RUSH_HP_GROWTH ** (this.bossRushes - 1) : 1);
    // The boss charges down the centre of the road; everyone else picks a random lane.
    const y = kind === 'boss' ? 200 + this.random() * 50 : 100 + this.random() * 260;
    // Each zombie's defense varies a little around its kind's value (drawn from the combat stream: the horde stays the same).
    const defense = def.defense * (1 - B.DEFENSE_SPREAD + 2 * B.DEFENSE_SPREAD * this.combatRandom());
    this.invalidateGrid();
    this.enemies.push({ id: this.nextId++, kind, x: -20, y, hp, maxHp: hp, defense, resist: def.resist,
      speed: def.speed * (0.96 + this.random() * 0.08), attack: def.attack * B.ENEMY_ATTACK_GROWTH_PER_MINUTE ** minutes,
      reward: def.reward * B.KILL_REWARD_GROWTH_PER_MINUTE ** minutes, xp: def.xp, burnPower: 0, burnDuration: 0, burnFlammability: 0,
      toxin: 0, toxinDuration: 0, toxinBurst: false, meters: { chill: newMeter(), shock: newMeter(), stun: newMeter() }, hitFlash: 0 });
  }
  /** A boss and its runner pack, on a fixed schedule independent of the player's power. */
  private bossRush() {
    this.bossRushes++;
    this.spawn('boss');
    for (let i = 0; i < B.BOSS_ESCORT; i++) this.spawn('runner');
  }
  advance(seconds: number) {
    if (this.phase !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.accumulator += seconds;
    while (this.accumulator + 1e-10 >= FIELD.step && this.phase === 'running') { this.accumulator -= FIELD.step; this.step(FIELD.step); }
    // Modal time never becomes catch-up time after choosing a card.
    if (this.phase !== 'running') this.accumulator = 0;
  }
  /** Targets in range for a mercenary, by its pattern. The first one is where the shot lands. */
  private targetsFor(kind: MercKind): Enemy[] {
    const def = MERCENARIES[kind], reach = Math.max(0, FIELD.wallX - this.rangeFor(kind));
    let front: Enemy | undefined;
    const pick = (accept: (e: Enemy) => boolean) => {
      let best: Enemy | undefined;
      if (def.pattern === 'heaviest') { for (const e of this.enemies) if (e.hp > 0 && e.x >= reach && accept(e) && (!best || e.hp > best.hp)) best = e; }
      // Closest living enemy to the wall; first in spawn order on ties. O(n), no per-frame sort.
      else for (const e of this.enemies) if (e.hp > 0 && e.x >= reach && accept(e) && (!best || e.x > best.x)) best = e;
      return best;
    };
    // Core 探照獵殺: the guns look for a target in the light first.
    if (this.cores.has('pointblank')) { const light = this.searchlight; front = pick(e => this.isLit(e, light)); }
    front ??= pick(() => true);
    if (!front) return [];
    if (def.pattern === 'cone') {
      const extra = (def.targets ?? 1) - 1 + (this.levels[kind] >= 100 ? 2 : 0);
      const near = this.enemies.filter(e => e !== front && e.hp > 0 && e.x >= reach && Math.hypot(e.x - front!.x, e.y - front!.y) <= def.area!)
        .sort((a, b) => Math.hypot(a.x - front!.x, a.y - front!.y) - Math.hypot(b.x - front!.x, b.y - front!.y)).slice(0, extra);
      return [front, ...near];
    }
    if (def.pattern === 'aoe') return [front, ...nearestFirst(this.within(front.x, front.y, def.area!).filter(e => e !== front), front.x, front.y)].slice(0, B.AREA.auto.cap);
    if (def.pattern === 'chain') {
      const chain = [front], seen = new Set(chain);
      for (let i = 0; i < (def.targets ?? 0) + (this.levels[kind] >= 100 ? 1 : 0); i++) {
        const next = this.nearest(chain.at(-1)!, def.area!, seen); if (!next) break;
        chain.push(next); seen.add(next);
      }
      return chain;
    }
    return [front];
  }
  /** One auto attack: damage by pattern, then the kind's own extras (burn, toxin), pierce and Lv100 bonuses. */
  private fire(merc: Mercenary, slot: number) {
    const targets = this.targetsFor(merc.kind);
    const target = targets[0];
    if (!target) return false;
    const def = MERCENARIES[merc.kind], origin = mercPosition(slot), master = this.levels[merc.kind] >= 100;
    merc.shots = (merc.shots ?? 0) + 1;
    // Core 集火射擊: consecutive shots on one target fire faster, +15% a shot up to ×4 (see step); a new target resets.
    if (this.cores.has('focusfire')) {
      merc.focusStacks = merc.focusTarget === target.id ? Math.min(20, (merc.focusStacks ?? 0) + 1) : 0; merc.focusTarget = target.id;
    }
    // Core 彈藥經濟: every kinetic shot spends 1% of the money (the damage factor is applied per kinetic hit).
    if (this.cores.has('ammoeco') && def.tags.includes('Damage.Kinetic')) this.money = Math.max(0, this.money * 0.99);
    // Core 以牆為彈: a share of the barricade's current health per second, split over this mercenary's shots.
    const bulwark = this.cores.has('blackmarket') ? this.wallHealth * B.BULWARK_SHARE * this.shotInterval(merc) : 0;
    const damage = this.damageFor(merc.kind) + bulwark;
    if (merc.kind === 'flame') {
      // The flamer only sets fire: a zero hit carries the ammo cards, then each target in the cone burns.
      for (const t of targets) { this.hit(t, { baseDamage: 0, tags: def.tags }); this.burn(t, damage, 3, def.tags); this.visual('flame', t.x, t.y, def.color, 0, origin.x, origin.y).merc = merc.kind; }
    } else if (def.pattern === 'chain') {
      let from = origin;
      targets.forEach((t, i) => {
        this.hit(t, { baseDamage: damage * (i ? 0.7 : 1), tags: def.tags }); this.poison(t, def.toxin ?? 0);
        this.visual('shot', t.x, t.y, def.color, 0, from.x, from.y).merc = merc.kind; from = { x: t.x, y: t.y };
      });
    } else {
      // Single shots and splash: the first target takes the shot, splash hits the rest of the area. A crowd
      // splits the splash budget (Balance.AREA.auto).
      const k = def.pattern === 'aoe' && targets.length > B.AREA.auto.full ? B.AREA.auto.full / targets.length : 1;
      targets.forEach((t, i) => {
        this.hit(t, { baseDamage: damage * k, tags: def.tags }, { forceCrit: i === 0 && master && merc.kind === 'rifle' && merc.shots! % 3 === 0 });
        if (def.toxin) this.poison(t, def.toxin);
        if (def.ignite) this.burn(t, damage * k * def.ignite, 3, def.tags);
      });
      if (def.pattern === 'aoe') this.visual('blast', target.x, target.y, def.color, def.area!);
      this.visual('shot', target.x, target.y, def.color, 0, origin.x, origin.y).merc = merc.kind;
      // Pierce: a single shot carries on through enemies behind the target, 40% weaker each time.
      if (this.pierce > 0 && (def.pattern === 'single' || def.pattern === 'heaviest')) {
        const behind = this.enemies.filter(e => e !== target && e.hp > 0 && e.x >= 0 && e.x < target.x && Math.abs(e.y - target.y) < 45).sort((a, b) => b.x - a.x).slice(0, this.pierce);
        behind.forEach((e, i) => this.hit(e, { baseDamage: damage * this.perm.pierceRetention ** (i + 1), tags: def.tags }));
      }
      // Lv100: the tesla shot chains to a second enemy.
      if (master && merc.kind === 'tesla') { const n = this.nearest(target, 90); if (n) this.hit(n, { baseDamage: damage * 0.6, tags: def.tags }); }
    }
    return true;
  }
  private step(dt: number) {
    this.invalidateGrid();
    this.elapsed += dt;
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) { this.spawn(); this.spawnTimer += spawnIntervalAt(this.elapsed); }
    if (this.elapsed + 1e-8 >= this.nextBossAt) this.bossRush();
    for (const event of this.events) event.life -= dt;
    this.events = this.events.filter(e => e.life > 0);
    for (const zone of this.zones) {
      zone.remaining -= dt;
      if (zone.remaining <= 1e-9) continue;
      zone.pulseTimer -= dt;
      const pulse = zone.pulseTimer <= 1e-9;
      if (pulse) zone.pulseTimer += 1;
      this.igniteZone(zone, pulse);
    }
    this.zones = this.zones.filter(z => z.remaining > 1e-9);
    this.advanceMines(dt);
    // Talent 軍需運輸: passive income every 10 seconds, growing with the income curve.
    if (this.perm.passiveIncome > 0) {
      this.passiveTimer += dt;
      if (this.passiveTimer >= 10) { this.passiveTimer -= 10; this.earn(this.perm.passiveIncome * B.INCOME_GROWTH_PER_MINUTE ** (this.elapsed / 60)); }
    }
    // Thorn damage only depends on run-wide modifiers: compute it once per step, apply defense per enemy.
    let thornRaw: number | undefined;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.toxinDuration = Math.max(0, enemy.toxinDuration - dt);
      if (!enemy.toxinDuration) enemy.toxin = 0;
      for (const kind of METER_KINDS) {
        const m = enemy.meters[kind];
        if (m.timer > 0) m.timer = Math.max(0, m.timer - dt);
        m.idle += dt;
        if (m.value > 0 && m.idle > B.METER_IDLE) m.value = Math.max(0, m.value - meterThreshold(enemy, kind, this.elapsed) * B.METER_DRAIN * dt);
      }
      // All fire sources share the strongest burn; flammability changes its clock, not its base power.
      const dot = advanceBurn(enemy, dt);
      if (dot) {
        // Synergy (fire + toxin): every 10 toxin deepens burns, at most ×3.
        const chem = this.synergies.has('chemfire') ? Math.min(3, 1 + CHEMFIRE * enemy.toxin / 10) : 1;
        enemy.hp -= calculateDamage({ baseDamage: dot * chem * this.dealtScale(enemy), tags: ['Damage.Fire', 'Damage.Elemental', 'Mechanic.DOT', 'Status.Burning'] },
          { defense: enemy.defense, toxin: enemy.toxin, resist: enemy.resist, vulnerability: this.vulnerability(enemy) }).final;
        if (enemy.hp <= 0) { this.kill(enemy); continue; }
      }
      const shocked = enemy.meters.shock.value > 0 || this.isParalyzed(enemy);
      if (enemy.x < FIELD.wallX - 18) {
        // Frozen and stunned zombies stand still; the chill meter slows them while it fills.
        if (!this.isFrozen(enemy) && !this.isStunned(enemy)) {
          const chill = Math.min(1, enemy.meters.chill.value / meterThreshold(enemy, 'chill', this.elapsed));
          enemy.x = Math.min(FIELD.wallX - 18, enemy.x + enemy.speed * dt * (1 - B.STATUS.chill.slow * chill) * (shocked ? this.perm.stunField : 1));
        }
      } else if (!this.isParalyzed(enemy)) {
        // Paralysed zombies cannot bite; frozen or stunned ones at the barricade still do.
        this.wallHealth -= enemy.attack * dt * (1 - this.wallReduction) * this.wallVulnerability * (enemy.toxin > 0 ? this.perm.bioShield : 1);
        if (this.wallHealth <= 0) { this.wallHealth = 0; this.phase = 'over'; break; }
        if (this.thorns > 0) {
          // Spikes: a share of the squad's reference shot per second, as kinetic damage (no per-tick events).
          thornRaw ??= calculateValue(this.thorns * this.skillPower * dt, THORN_TAGS, this.modifiers);
          enemy.hp -= calculateDamage({ baseDamage: thornRaw * this.dealtScale(enemy), tags: THORN_TAGS }, { defense: enemy.defense, toxin: enemy.toxin, resist: enemy.resist }).final;
          if (enemy.hp <= 0) { this.kill(enemy); continue; }
        }
      }
      if (this.wallHealth <= 0) { this.wallHealth = 0; this.phase = 'over'; break; }
    }
    if (this.phase !== 'running') return;
    // Everyone has moved this step.
    this.invalidateGrid();
    this.resolveBlasts(); this.advanceAllies(dt);
    for (const skill of this.skills) skill.cooldown = Math.max(0, skill.cooldown - dt);
    if (this.cores.has('autofire')) this.autoCast();
    this.mercenaries.forEach((merc, slot) => {
      merc.shotTimer -= dt;
      if (merc.shotTimer > 0) return;
      if (this.fire(merc, slot)) merc.shotTimer = this.shotInterval(merc);
    });
    this.resolveBlasts();
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (this.clearedWave > this.completedWaves) { this.earn(calculateValue(5 * B.WAVE_REWARD_GROWTH_PER_MINUTE ** (this.elapsed / 60), ['Economy.WaveReward'], this.modifiers)); this.xp += 2; this.completedWaves = this.clearedWave; }
    if (!this.endless && this.elapsed + 1e-8 >= FIELD.victorySeconds) { this.elapsed = FIELD.victorySeconds; this.phase = 'victory'; return; }
    this.checkLevel();
  }
}
