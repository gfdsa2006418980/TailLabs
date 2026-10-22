import { calculateDamage, calculateValue, effectiveCooldown, runScore } from './Combat.ts';
import type { DamageInstance, Modifier, Tag } from './Combat.ts';
import { CARD_DEFS, ENEMIES, MERCENARIES, RARITIES, RARITY_ORDER, cardDef, makeCard } from './Content.ts';
import type { CardDef, EnemyKind, MercKind, Rarity, UpgradeCard } from './Content.ts';
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
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; defense: number;
  speed: number; attack: number; reward: number; xp: number; burnPower: number; burnDuration: number; burnFlammability: number;
  corrosionPower: number; corrosionDuration: number; shockPower: number; shockDuration: number; hitFlash: number;
  /** Core 元素輪替: the element of the last hit. Core 千層烈焰: stacked burn layers. */
  lastElement?: string; burnLayers?: number;
}
export interface Mercenary { id: number; kind: MercKind; shotTimer: number; cooldown: number; shots?: number; focusTarget?: number; focusStacks?: number }
/** Core 亡者徵召: a raised corpse walking back up the road to explode in the horde. */
export interface Ally { id: number; x: number; y: number; power: number; age: number }
export interface VisualEvent {
  kind: 'shot' | 'flame' | 'laser' | 'blast' | 'hit' | 'kill'; x: number; y: number; fromX?: number; fromY?: number; color: string; life: number; maxLife: number; radius: number;
  /** Presentation only: damage dealt ('hit') or money earned ('kill'). */
  amount?: number; enemy?: EnemyKind; target?: number; skill?: boolean; crit?: boolean;
}
export interface FireZone { x: number; y: number; radius: number; remaining: number; power: number; pulseTimer: number; contacts: Set<number>; spread?: boolean }
const mercY = (slot: number) => 130 + slot * 92;
/** The very first choice of a run offers one card of each element. */
const STARTERS = ['kinetic', 'burn', 'bio', 'shock'];
const THORN_TAGS: Tag[] = ['Damage.Kinetic', 'Defense.Barricade'];
// Synergy strengths, looked up once (hot paths run per enemy per step).
const PHOSPHORUS = cardDef('phosphorus')!.value, ACIDCORE = cardDef('acidcore')!.value, CONDUCTOR = cardDef('conductor')!.value, CHEMFIRE = cardDef('chemfire')!.value;
const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);
/** Rarity weights: common shrinks 0.6 points per tactical level (floor 35); legendary is reserved for evolutions. */
export function rarityWeights(level: number) {
  const common = Math.max(35, RARITIES.common.weight - 0.6 * (level - 1)), rest = 100 - common;
  const u = RARITIES.uncommon.weight, r = RARITIES.rare.weight + RARITIES.legendary.weight;
  return { common, uncommon: rest * u / (u + r), rare: rest * r / (u + r) };
}
/** Draws without rare+ before the next draw guarantees one. */
export const PITY_DRAWS = 6;
export const mercPosition = (slot: number) => ({ x: 824 + (slot === 1 ? 26 : 0), y: mercY(slot) });

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
  enemies: Enemy[] = []; mercenaries: Mercenary[] = [];
  levels: Record<MercKind, number> = { rifle: 1, flame: 1, tesla: 1 };
  events: VisualEvent[] = []; zones: FireZone[] = [];
  endless = false;
  /** Card-driven rules. Bonuses add up; percentages are fractions. */
  critChance = 0; critDamage = 1.5; pierce = 0; burnTimeBonus = 0; corrosionGain = 0; shockGain = 0; thorns = 0;
  synergies = new Set<string>(); evolutions: Partial<Record<MercKind, string>> = {};
  rerollsThisLevel = 0; pity = 0;
  /** Curse penalties: skill cooldown and barricade damage multipliers. */
  cooldownPenalty = 1; wallVulnerability = 1;
  /** Star-map snapshot (§54 multiplicative growth; neutral = no talent). */
  perm: Required<Omit<PermanentEffects, 'modifiers' | 'wallHealth' | 'attackSpeed' | 'haste' | 'cores'>>;
  cores = new Set<CoreId>();
  freeRerolls = 0; picksLeft = 1; allies: Ally[] = [];
  private passiveTimer = 0; private blasts: { x: number; y: number; damage: number }[] = [];
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
    this.critChance = this.perm.critChance; this.critDamage = 1.5 * this.perm.critDamage; this.corrosionGain = this.perm.corrosionGain; this.shockGain = this.perm.shockGain;
    this.skillRange = this.perm.skillRange; this.wallReduction = this.perm.wallReduction; this.thorns = this.perm.thorns; this.freeRerolls = this.perm.freeRerolls;
    if (this.cores.has('coldsteel')) this.pierce = 1;
    if (this.cores.has('raisedead')) { this.wallHealth *= 0.6; this.wallMaxHealth *= 0.6; this.wallStartHealth *= 0.6; }
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
  start() {
    if (this.phase !== 'ready') return;
    // The opening squad deploys with its active skill still charging; later recruits arrive ready.
    const cooldown = effectiveCooldown(MERCENARIES.rifle.cooldown, this.haste) * B.SKILL_START_CHARGE;
    this.mercenaries.push({ id: this.nextId++, kind: 'rifle', shotTimer: 0, cooldown }); this.phase = 'running';
    if (this.perm.startMoney > 0) this.earn(this.perm.startMoney);
  }
  pause() { if (this.phase === 'running') this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = 'running'; }
  continueEndless() { if (this.phase === 'victory') { this.endless = true; this.phase = 'running'; } }
  recruitCost(kind: MercKind) { return Math.ceil(calculateValue(B.RECRUIT_BASE_COST[kind] * B.RECRUIT_COST_GROWTH ** this.mercenaries.filter(m => m.kind === kind).length, ['Economy.RecruitCost'], this.modifiers)); }
  upgradeCost(kind: MercKind) { return Math.ceil(calculateValue(B.UPGRADE_BASE_COST * B.UPGRADE_COST_GROWTH ** this.levels[kind], ['Economy.UpgradeCost'], this.modifiers)); }
  damageFor(kind: MercKind) {
    const level = this.levels[kind];
    const squad = this.cores.has('lonewolf') ? 4 : this.cores.has('uniform') ? 1.3 ** Math.max(0, this.mercenaries.length - 1) : 1;
    return MERCENARIES[kind].damage * (kind === 'flame' ? B.FLAME_DAMAGE_PER_LEVEL : B.MERC_DAMAGE_PER_LEVEL) ** (level - 1) * (level >= 10 ? 2 : 1) * (level >= 50 ? 3 : 1) * squad;
  }
  intervalFor(kind: MercKind) {
    return MERCENARIES[kind].interval / (this.attackSpeed * (1 + this.attackSpeedBonus)) / (this.levels[kind] >= 25 ? 1.5 : 1)
      / (kind === 'tesla' ? this.perm.teslaSpeed : 1) / (this.cores.has('lonewolf') ? 1.5 : 1);
  }
  /** A skill's full cooldown for this kind, with evolutions, curses and cores. */
  skillCooldown(kind: MercKind) {
    if (this.cores.has('bloodprice')) return 0;
    const evolution = this.evolutions[kind], scale = evolution === 'hex' ? 1.3 : evolution === 'overload' ? 1.5 : 1;
    return effectiveCooldown(MERCENARIES[kind].cooldown, this.haste) * scale * this.cooldownPenalty * (this.cores.has('lonewolf') ? 0.5 : 1);
  }
  /** Cores can close recruitment: 孤狼 keeps the opening rifleman alone, 制式部隊 only takes riflemen. */
  canRecruit(kind: MercKind) {
    if (this.cores.has('lonewolf')) return false;
    if (this.cores.has('uniform')) return kind === 'rifle';
    return !this.mercenaries.some(m => m.kind === kind);
  }
  recruit(kind: MercKind): boolean {
    const cost = this.recruitCost(kind);
    if (this.phase !== 'running' || this.mercenaries.length >= 3 || this.money < cost) return false;
    if ((this.cores.has('lonewolf') || this.cores.has('uniform')) && !this.canRecruit(kind)) return false;
    this.money -= cost; this.mercenaries.push({ id: this.nextId++, kind, shotTimer: 0, cooldown: 0 }); return true;
  }
  upgrade(kind: MercKind): boolean {
    const cost = this.upgradeCost(kind);
    if (this.phase !== 'running' || !this.mercenaries.some(m => m.kind === kind) || this.money < cost) return false;
    this.money -= cost; this.levels[kind]++; return true;
  }
  get repairCost() { return Math.ceil(B.REPAIR_BASE_COST * B.REPAIR_COST_GROWTH ** this.wallLevel * this.perm.repairCost * (this.cores.has('bloodprice') ? 0.5 : 1)); }
  get fortifyCost() { return Math.ceil(B.FORTIFY_BASE_COST * B.FORTIFY_COST_GROWTH ** this.wallLevel * this.perm.fortifyCost * (this.cores.has('plunder') ? 0.6 : 1)); }
  /** Core 掠奪者 disables paid repairs. */
  get canRepair() { return !this.cores.has('plunder'); }
  repair(): boolean {
    if (!this.canRepair || this.phase !== 'running' || this.wallHealth >= this.wallMaxHealth || this.money < this.repairCost) return false;
    this.money -= this.repairCost; this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + calculateValue(this.wallMaxHealth * B.REPAIR_FRACTION, ['Defense.Repair'], this.modifiers)); return true;
  }
  fortify(): boolean {
    if (this.phase !== 'running' || this.money < this.fortifyCost) return false;
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
      case 'wall': { const n = this.wallStartHealth * v; this.wallHealth += n; this.wallMaxHealth += n; break; }
      case 'repair': this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + this.wallMaxHealth * v); break;
      case 'crit': this.critChance += v; break;
      case 'critDamage': this.critDamage += v; break;
      case 'pierce': this.pierce += Math.max(1, Math.floor(v)); break;
      case 'reduction': this.wallReduction = 1 - (1 - this.wallReduction) * (1 - Math.min(0.95, v)); break;
      case 'thorns': this.thorns += v; break;
      case 'airdrop': this.earn(calculateValue(25 * v * B.INCOME_GROWTH_PER_MINUTE ** (this.elapsed / 60), ['Economy.WaveReward'], this.modifiers)); break;
      case 'burnTime': this.burnTimeBonus += v; break;
      case 'corrosionGain': this.corrosionGain += v; break;
      case 'shockGain': this.shockGain += v; break;
      case 'synergy': this.synergies.add(card.id); break;
      case 'evolution': { const merc = card.merc ?? cardDef(card.id)?.merc; if (merc) this.evolutions[merc] = card.id; break; }
      case 'curse': this.applyCurse(card.id, v); break;
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
  /** Evolutions whose recipe is complete, for recruited mercenaries whose skill has not evolved yet. */
  readyEvolutions(): CardDef[] {
    if (this.level < B.EVOLUTION_MIN_LEVEL) return [];
    return CARD_DEFS.filter(def => def.kind === 'evolution' && def.merc && !this.evolutions[def.merc]
      && this.mercenaries.some(m => m.kind === def.merc)
      && Object.entries((def.recipe ?? []).reduce<Record<string, number>>((n, id) => ({ ...n, [id]: (n[id] ?? 0) + 1 }), {})).every(([id, need]) => this.count(id) >= need));
  }
  private rollRarity(forceRare: boolean): Rarity {
    if (forceRare) return 'rare';
    const w = rarityWeights(this.level), u = w.uncommon * this.perm.luck, r = w.rare * this.perm.luck, roll = this.cardRandom() * (w.common + u + r);
    return roll < w.common ? 'common' : roll < w.common + u ? 'uncommon' : 'rare';
  }
  /** Three different cards: a ready evolution takes a slot first, then rarity rolls and weighted picks. */
  private draw(): UpgradeCard[] {
    const offers: UpgradeCard[] = [], owned = new Set(this.selectedCards.map(c => c.category));
    const ready = this.readyEvolutions();
    const due = ready.filter(def => (this.evolutionDeferred[def.id] ?? 0) <= this.level);
    if (due.length) offers.push(makeCard(due[Math.floor(this.cardRandom() * due.length)]!));
    const first = this.selectedCards.length === 0, market = this.cores.has('blackmarket') && !first;
    this.picksLeft = market ? 2 : 1;
    const size = market ? 5 : 3;
    if (market) {
      const curses = CARD_DEFS.filter(def => def.kind === 'curse'), count = this.cardRandom() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const pool = curses.filter(def => !offers.some(o => o.id === def.id));
        offers.push(makeCard(pool[Math.floor(this.cardRandom() * pool.length)]!, 'rare', this.level));
      }
    }
    let forceRare = this.pity >= PITY_DRAWS - 1;
    while (offers.length < size) {
      const rarity = this.rollRarity(forceRare); forceRare = false;
      const allowed = (def: CardDef, r: Rarity) => !offers.some(o => o.id === def.id) && (first ? STARTERS.includes(def.id)
        : def.kind === 'normal' ? rank(def.minRarity ?? 'common') <= rank(r)
        : def.kind === 'synergy' ? this.level >= B.SYNERGY_MIN_LEVEL && rank(r) >= rank('rare') && !this.synergies.has(def.id) && def.elements!.every(e => owned.has(e)) : false);
      let pool = CARD_DEFS.filter(def => allowed(def, rarity));
      if (!pool.length) pool = CARD_DEFS.filter(def => allowed(def, 'common'));
      if (!pool.length) break;
      // Repeats get rarer each time they are taken; synergies are favoured when unlocked.
      const weight = (def: CardDef) => (def.kind === 'synergy' ? 1.5 : 1) * 0.8 ** this.count(def.id);
      let roll = this.cardRandom() * pool.reduce((sum, def) => sum + weight(def), 0), pick = pool[pool.length - 1]!;
      for (const def of pool) { roll -= weight(def); if (roll <= 0) { pick = def; break; } }
      offers.push(makeCard(pick, pick.fixedRarity ?? (rank(pick.minRarity ?? 'common') > rank(rarity) ? pick.minRarity! : rarity), this.level));
    }
    // Evolutions are guaranteed separately, so they do not count towards the rare-card pity.
    this.pity = offers.some(o => o.kind !== 'evolution' && rank(o.rarity ?? 'common') >= rank('rare')) ? 0 : this.pity + 1;
    return offers;
  }
  /** §11: re-draw the three cards for battlefield money; the price follows income and rises per reroll. */
  get rerollCost() { return this.freeRerolls > 0 ? 0 : Math.ceil(8 * B.INCOME_GROWTH_PER_MINUTE ** (this.elapsed / 60) * 1.6 ** this.rerollsThisLevel); }
  /** Core 黑市補給 has no rerolls. */
  get canReroll() { return !this.cores.has('blackmarket'); }
  reroll(): boolean {
    if (!this.canReroll || this.phase !== 'choice' || this.picksLeft < (this.cores.has('blackmarket') ? 2 : 1) || this.money < this.rerollCost) return false;
    if (this.freeRerolls > 0) this.freeRerolls--; else { this.money -= this.rerollCost; this.rerollsThisLevel++; }
    this.choices = this.draw(); return true;
  }
  private visual(kind: VisualEvent['kind'], x: number, y: number, color: string, radius = 0, fromX?: number, fromY?: number) {
    const life = kind === 'shot' ? 0.13 : kind === 'blast' ? 0.55 : 0.4;
    this.events.push({ kind, x, y, color, radius, fromX, fromY, life, maxLife: life });
  }
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
    const tags: Tag[] = [...sourceTags.filter(t => !t.startsWith('Damage.') && t !== 'Mechanic.Projectile'), 'Damage.Fire', 'Mechanic.DOT', 'Status.Burning'];
    this.applyBurnRun(enemy, calculateValue(power, tags, this.modifiers) * this.statusBoost, duration * this.burnTimeScale);
  }
  private corrode(enemy: Enemy, value: number) { enemy.corrosionPower += value * (1 + this.corrosionGain) * this.statusBoost; enemy.corrosionDuration = 6 * this.perm.corrosionTime; }
  private shock(enemy: Enemy, value: number) {
    const conductor = this.synergies.has('conductor') ? 1 + CONDUCTOR * enemy.corrosionPower : 1;
    enemy.shockPower += value * (1 + this.shockGain) * conductor * this.statusBoost; enemy.shockDuration = 6 * this.perm.shockTime;
  }
  /**
   * Grenade push. Bosses only budge a quarter (a hasted grenade spam held them in place for good), and
   * nobody is pushed back off the road (x < 0), where no gun can aim at them.
   */
  private knockBack(enemy: Enemy, distance: number) {
    if (enemy.x <= 0) return;
    enemy.x = Math.max(0, enemy.x - distance * (enemy.kind === 'boss' ? 0.25 : 1));
  }
  /** Core 定點防禦: ×0.4 far away up to ×2.5 at the barricade. */
  private pointBlank(enemy: Enemy) { const k = Math.min(1, Math.max(0, enemy.x / (FIELD.wallX - 18))); return 0.4 + 2.1 * k * k; }
  /** Multipliers that depend on the target or on cores, after defense. */
  private damageScale(enemy: Enemy, hit: DamageInstance, direct: boolean) {
    let k = 1;
    if (enemy.kind === 'armored' || enemy.kind === 'elite' || enemy.kind === 'boss') k *= this.perm.armorBreaker;
    if (enemy.defense >= 50) k *= this.perm.eroder;
    if (this.cores.has('pointblank')) k *= this.pointBlank(enemy);
    if (this.cores.has('autofire') && hit.tags.includes('Skill.Active')) k *= 0.85;
    if (this.cores.has('rotation') && direct) {
      const element = hit.tags.includes('Damage.Electric') ? 'electric' : hit.tags.includes('Damage.Fire') ? 'fire' : hit.tags.includes('Damage.Bio') ? 'bio' : 'kinetic';
      if (enemy.lastElement) k *= enemy.lastElement === element ? 0.7 : 1.6;
      enemy.lastElement = element;
    }
    return k;
  }
  private igniteZone(zone: FireZone, pulse: boolean) {
    const contacts = new Set<number>();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || Math.abs(enemy.x - zone.x) > zone.radius || Math.abs(enemy.y - zone.y) > zone.radius
        || Math.hypot(enemy.x - zone.x, enemy.y - zone.y) > zone.radius) continue;
      contacts.add(enemy.id);
      // First contact is immediate; remaining inside reapplies at 1 Hz, never once per frame.
      if (zone.spread && enemy.burnDuration > 0) continue;
      if (pulse || !zone.contacts.has(enemy.id)) this.applyBurnRun(enemy, zone.power, 3 * this.burnTimeScale);
    }
    zone.contacts = contacts;
  }
  /** One direct hit. `forceCrit` is the rifle's Lv100 third shot. Returns the damage dealt. */
  private hit(enemy: Enemy, hit: DamageInstance, forceCrit = false): number {
    if (enemy.hp <= 0) return 0;
    const direct = hit.baseDamage > 0 && !hit.tags.includes('Mechanic.DOT');
    // Core 冷鋼紀律 never crits but ignores 60% of defense; core 痛苦精通 moves the crit onto statuses.
    const crit = direct && !this.cores.has('coldsteel') && (forceCrit || (this.critChance > 0 && this.combatRandom() < this.critChance));
    const agony = crit && this.cores.has('agony');
    const target = direct && this.cores.has('coldsteel') ? { defense: enemy.defense * 0.4, corrosionPower: enemy.corrosionPower, shockPower: enemy.shockPower } : enemy;
    const result = calculateDamage(crit && !agony ? { ...hit, baseDamage: hit.baseDamage * this.critDamage } : hit, target, this.modifiers);
    let final = result.final * this.damageScale(enemy, hit, direct);
    // Synergy (kinetic + electric): shocked targets take the shock multiplier once more on direct kinetic hits.
    if (this.synergies.has('railgun') && direct && hit.tags.includes('Damage.Kinetic') && enemy.shockPower > 0) final *= result.shockMultiplier;
    // Core 焚化協議: every direct hit becomes a burn at 120% instead of damage.
    let cremation = 0;
    if (direct && this.cores.has('cremation')) { cremation = final * 1.2; final = 0; }
    enemy.hp -= final; enemy.hitFlash = 0.1;
    if (final > 0) this.events.push({ kind: 'hit', x: enemy.x, y: enemy.y, color: '', life: 0.12, maxLife: 0.12, radius: 0,
      amount: final, enemy: enemy.kind, target: enemy.id, skill: hit.tags.includes('Skill.Active'), crit });
    // A killing blow lands before any on-hit effect, so "died while burning" means it was already burning.
    if (enemy.hp <= 0) { this.kill(enemy); return final; }
    this.statusBoost = agony ? this.critDamage : 1;
    if (cremation > 0) this.burn(enemy, cremation, 3, hit.tags);
    // Several copies of a status card merge into one stronger application per hit (powers add up):
    // ten ignite cards must not mean ten burns a shot, each adding a layer of flammability.
    // Core 千層烈焰 keeps one layer per card, so its ten-layer cap still means ten cards' worth.
    let ignite = 0, corrode = 0, shock = 0;
    const layered = this.cores.has('layers');
    for (const modifier of result.specials) {
      if (modifier.rule === 'ignite') { if (layered) this.burn(enemy, modifier.value, 4, hit.tags); else ignite += modifier.value; }
      if (modifier.rule === 'corrode') corrode += modifier.value;
      if (modifier.rule === 'shock') shock += modifier.value;
    }
    if (ignite > 0) this.burn(enemy, ignite, 4, hit.tags);
    if (corrode > 0) this.corrode(enemy, corrode);
    if (shock > 0) this.shock(enemy, shock);
    const auto = hit.tags.includes('Skill.AutoAttack');
    if (auto && direct && hit.tags.includes('Damage.Kinetic')) {
      if (this.synergies.has('phosphorus')) this.burn(enemy, final * PHOSPHORUS, 3, hit.tags.filter(t => t !== 'Skill.AutoAttack'));
      if (this.synergies.has('acidcore')) this.corrode(enemy, ACIDCORE);
    }
    if (this.synergies.has('overheat') && auto && enemy.shockPower > 0 && enemy.burnDuration > 0) enemy.burnFlammability = Math.min(MAX_FLAMMABILITY, enemy.burnFlammability + 1);
    this.statusBoost = 1;
    if (enemy.hp <= 0) this.kill(enemy);
    return final;
  }
  private kill(enemy: Enemy) {
    const boss = enemy.kind === 'elite' || enemy.kind === 'boss';
    const reward = calculateValue(enemy.reward, ['Economy.KillReward'], this.modifiers) * (boss ? this.perm.bounty : 1) * (this.cores.has('corpseblast') ? 0.7 : 1);
    if (this.cores.has('plunder')) this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + this.wallMaxHealth * 0.01);
    // Talent 毒霧殘留: a corroded death spreads corrosion to its neighbours.
    if (this.perm.toxicResidue > 0 && enemy.corrosionPower > 0)
      for (const e of this.enemies) if (e !== enemy && e.hp > 0 && Math.abs(e.x - enemy.x) < 50 && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 50) this.corrode(e, this.perm.toxicResidue);
    // Core 屍爆連鎖: queued so chains resolve over the step instead of recursing.
    if (this.cores.has('corpseblast') && this.blasts.length < 300) this.blasts.push({ x: enemy.x, y: enemy.y, damage: enemy.maxHp * 0.2 });
    // Core 亡者徵召: some ordinary corpses get back up on our side.
    if (this.cores.has('raisedead') && (enemy.kind === 'walker' || enemy.kind === 'runner') && this.allies.length < 40 && this.combatRandom() < 0.3)
      this.allies.push({ id: this.nextId++, x: enemy.x, y: enemy.y, power: enemy.maxHp * 1.5, age: 0 });
    // Evolution (wildfire): a burning death leaves a small fire behind. It only lights enemies that are not
    // burning yet, at 40% of the dead one's burn, so the chain dies out instead of running through every wave.
    if (this.evolutions.flame === 'wildfire' && enemy.burnDuration > 0 && enemy.burnPower > 0)
      this.zones.push({ x: enemy.x, y: enemy.y, radius: 35, remaining: 3, power: enemy.burnPower * 0.4, pulseTimer: 1, contacts: new Set(), spread: true });
    this.kills++; this.earn(reward); this.xp += enemy.xp;
    this.visual('kill', enemy.x, enemy.y, ENEMIES[enemy.kind].color, 22);
    Object.assign(this.events[this.events.length - 1]!, { amount: reward, enemy: enemy.kind, target: enemy.id });
  }
  cast(slot: number, x: number, y: number): boolean {
    const merc = this.mercenaries[slot];
    if (!merc || this.phase !== 'running' || merc.cooldown > 1e-8 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > FIELD.wallX || y < 65 || y > 390) return false;
    // Core 血債血償: no cooldown, paid for with the barricade.
    if (this.cores.has('bloodprice')) { this.wallHealth -= this.wallMaxHealth * 0.1; if (this.wallHealth <= 0) { this.wallHealth = 0; this.phase = 'over'; return true; } }
    const def = MERCENARIES[merc.kind], evolution = this.evolutions[merc.kind];
    const origin = mercPosition(slot), base = this.damageFor(merc.kind);
    if (merc.kind === 'rifle') {
      const tags: Tag[] = ['Damage.Kinetic', 'Mechanic.AOE', 'Mechanic.Explosion', 'Mechanic.Knockback', 'Skill.Active', 'Mercenary.rifle'];
      const radius = def.radius * this.skillRange * (evolution === 'hex' ? 1.5 : 1);
      const damage = base * 5 * (evolution === 'hex' ? 1.5 : evolution === 'double' ? cardDef('double')!.value : 1);
      const blast = (bx: number, by: number) => {
        for (const enemy of this.enemies) if (Math.hypot(enemy.x - bx, enemy.y - by) <= radius) { this.hit(enemy, { baseDamage: damage, tags }); this.knockBack(enemy, 40 * this.perm.knockback); }
        this.visual('blast', bx, by, '#f8b968', radius);
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
    } else if (merc.kind === 'flame') {
      const tags: Tag[] = ['Damage.Fire', 'Mechanic.AOE', 'Mechanic.DOT', 'Skill.Active', 'Mercenary.flame'];
      const radius = def.radius * this.skillRange * this.perm.molotovRadius * (evolution === 'inferno' ? 1.6 : 1);
      const power = calculateValue(base * 3, tags, this.modifiers) * (evolution === 'napalm' ? 2 : 1);
      const zone: FireZone = { x, y, radius, remaining: (evolution === 'napalm' ? 4.2 : evolution === 'inferno' ? 8 : 6) * this.perm.molotovTime, power, pulseTimer: 1, contacts: new Set() };
      this.igniteZone(zone, false); this.zones.push(zone);
      this.visual('blast', x, y, '#e6764b', radius);
    } else {
      const radius = def.radius * this.skillRange * this.perm.laserWidth;
      const tags: Tag[] = ['Damage.Kinetic', 'Damage.Electric', 'Mechanic.Pierce', 'Skill.Active', 'Mercenary.tesla'];
      const ticks = evolution === 'hifreq' ? 5 : 1;
      const damage = base * 9 * (evolution === 'overload' ? 2.5 : evolution === 'hifreq' ? cardDef('hifreq')!.value : 1);
      const mainHits = new Set<Enemy>();
      const beam = (ox: number, oy: number, ux: number, uy: number, width: number, scale: number, skip?: Set<Enemy>, record?: Set<Enemy>) => {
        let first: Enemy | undefined, firstAlong = Infinity;
        for (const enemy of this.enemies) {
          if (skip?.has(enemy)) continue;
          const ex = enemy.x - ox, ey = enemy.y - oy, along = ex * ux + ey * uy;
          if (along >= 0 && Math.abs(ex * uy - ey * ux) <= width) {
            if (along < firstAlong) { firstAlong = along; first = enemy; }
            record?.add(enemy);
            for (let t = 0; t < ticks; t++) { this.shock(enemy, 3 / ticks); this.hit(enemy, { baseDamage: damage * scale, tags }); }
          }
        }
        return first;
      };
      const dx = x - origin.x, dy = y - origin.y, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
      const first = beam(origin.x, origin.y, ux, uy, radius, 1, undefined, mainHits);
      this.visual('laser', origin.x + ux * 1100, origin.y + uy * 1100, '#91e7ec', radius, origin.x, origin.y);
      if (evolution === 'refract' && first) {
        // Two side beams split off the first enemy hit, angled away from the main line.
        for (const turn of [-0.45, 0.45]) {
          const c = Math.cos(turn), sn = Math.sin(turn), vx = ux * c - uy * sn, vy = ux * sn + uy * c;
          beam(first.x, first.y, vx, vy, radius * 0.6, cardDef('refract')!.value, mainHits);
          this.visual('laser', first.x + vx * 700, first.y + vy * 700, '#91e7ec', radius * 0.6, first.x, first.y);
        }
      }
    }
    merc.cooldown = this.skillCooldown(merc.kind);
    this.enemies = this.enemies.filter(e => e.hp > 0); this.checkLevel(); return true;
  }
  /** Core 屍爆連鎖: resolve queued corpse explosions (each may queue more), bounded per step. */
  private resolveBlasts() {
    const tags: Tag[] = ['Damage.Kinetic', 'Mechanic.AOE', 'Mechanic.Explosion'];
    for (let n = 0; n < 200 && this.blasts.length; n++) {
      const b = this.blasts.shift()!;
      for (const e of this.enemies) if (e.hp > 0 && Math.abs(e.x - b.x) < 45 && Math.hypot(e.x - b.x, e.y - b.y) < 45) this.hit(e, { baseDamage: b.damage, tags });
      if (n % 3 === 0) this.visual('blast', b.x, b.y, '#f8b968', 45);
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
        for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - ally.x, e.y - ally.y) < 50) this.hit(e, { baseDamage: ally.power, tags });
        this.visual('blast', ally.x, ally.y, '#b5cc7f', 50);
      }
      ally.age = Infinity;
    }
    this.allies = this.allies.filter(a => a.age !== Infinity);
  }
  /** Core 自動火控: a ready skill fires at the densest group (a sample of the enemies closest to the wall). */
  private autoCast() {
    for (let slot = 0; slot < this.mercenaries.length; slot++) {
      const merc = this.mercenaries[slot]!;
      if (merc.cooldown > 1e-8) continue;
      const pool = this.enemies.filter(e => e.hp > 0 && e.x >= 20 && e.x <= FIELD.wallX).sort((a, b) => b.x - a.x).slice(0, 30);
      if (!pool.length) return;
      const r = MERCENARIES[merc.kind].radius * this.skillRange;
      let best = pool[0]!, score = -1;
      for (const e of pool) { let n = 0; for (const o of pool) if (Math.hypot(o.x - e.x, o.y - e.y) <= r) n++; if (n > score) { score = n; best = e; } }
      this.cast(slot, Math.min(FIELD.wallX, best.x), Math.min(390, Math.max(65, best.y)));
      if (this.phase !== 'running') return;
    }
  }
  private nearest(from: Enemy, range: number) {
    let best: Enemy | undefined, distance = range;
    for (const e of this.enemies) { const d = Math.hypot(e.x - from.x, e.y - from.y); if (e !== from && e.hp > 0 && d <= distance) { distance = d; best = e; } }
    return best;
  }
  private spawn(forced?: EnemyKind) {
    let kind: EnemyKind = forced ?? 'walker';
    if (!forced) {
      const roll = this.random();
      let threshold = 0;
      const roster: [EnemyKind, number, number][] = [['elite', 150, 0.07], ['armored', 75, 0.13], ['brute', 45, 0.18], ['runner', 22, 0.22]];
      for (const [candidate, unlock, weight] of roster) {
        if (this.elapsed < unlock) continue;
        threshold += weight;
        if (roll < threshold) { kind = candidate; break; }
      }
    }
    const def = ENEMIES[kind], minutes = this.elapsed / 60;
    const hp = def.hp * B.ENEMY_HP_GROWTH_PER_MINUTE ** minutes * (kind === 'boss' ? B.BOSS_RUSH_HP_GROWTH ** (this.bossRushes - 1) : 1);
    // The boss charges down the centre of the road; everyone else picks a random lane.
    const y = kind === 'boss' ? 200 + this.random() * 50 : 100 + this.random() * 260;
    this.enemies.push({ id: this.nextId++, kind, x: -20, y, hp, maxHp: hp, defense: def.defense,
      speed: def.speed * (0.96 + this.random() * 0.08), attack: def.attack * B.ENEMY_ATTACK_GROWTH_PER_MINUTE ** minutes,
      reward: def.reward * B.KILL_REWARD_GROWTH_PER_MINUTE ** minutes, xp: def.xp, burnPower: 0, burnDuration: 0, burnFlammability: 0,
      corrosionPower: 0, corrosionDuration: 0, shockPower: 0, shockDuration: 0, hitFlash: 0 });
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
  private step(dt: number) {
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
      enemy.corrosionDuration = Math.max(0, enemy.corrosionDuration - dt);
      enemy.shockDuration = Math.max(0, enemy.shockDuration - dt);
      if (!enemy.corrosionDuration) enemy.corrosionPower = 0;
      if (!enemy.shockDuration) enemy.shockPower = 0;
      // All fire sources share the strongest burn; flammability changes its clock, not its base power.
      const dot = advanceBurn(enemy, dt);
      if (dot) {
        // Synergy (fire + bio): corrosion deepens burns, at most ×3.
        const chem = this.synergies.has('chemfire') ? Math.min(3, 1 + CHEMFIRE * enemy.corrosionPower) : 1;
        const near = this.cores.has('pointblank') ? this.pointBlank(enemy) : 1;
        enemy.hp -= calculateDamage({ baseDamage: dot * chem * near, tags: ['Damage.Fire', 'Mechanic.DOT', 'Status.Burning'] }, enemy).final;
        if (enemy.hp <= 0) { this.kill(enemy); continue; }
      }
      if (enemy.x < FIELD.wallX - 18) enemy.x = Math.min(FIELD.wallX - 18, enemy.x + enemy.speed * dt * (enemy.shockPower > 0 ? this.perm.stunField : 1));
      else {
        this.wallHealth -= enemy.attack * dt * (1 - this.wallReduction) * this.wallVulnerability * (enemy.corrosionPower > 0 ? this.perm.bioShield : 1);
        if (this.wallHealth <= 0) { this.wallHealth = 0; this.phase = 'over'; break; }
        if (this.thorns > 0) {
          // Spikes: a share of the rifle's shot damage per second, as kinetic damage (no per-tick events).
          thornRaw ??= calculateValue(this.thorns * this.damageFor('rifle') * dt, THORN_TAGS, this.modifiers);
          enemy.hp -= calculateDamage({ baseDamage: thornRaw, tags: THORN_TAGS }, enemy).final;
          if (enemy.hp <= 0) { this.kill(enemy); continue; }
        }
      }
      if (this.wallHealth <= 0) { this.wallHealth = 0; this.phase = 'over'; break; }
    }
    if (this.phase !== 'running') return;
    this.resolveBlasts(); this.advanceAllies(dt);
    if (this.cores.has('autofire')) this.autoCast();
    for (const merc of this.mercenaries) {
      merc.cooldown = Math.max(0, merc.cooldown - dt); merc.shotTimer -= dt;
      if (merc.shotTimer > 0) continue;
      // Closest living enemy to the wall; first in spawn order on ties. O(n), no per-frame sort.
      let target: Enemy | undefined;
      for (const e of this.enemies) if (e.hp > 0 && e.x >= 0 && (!target || e.x > target.x)) target = e;
      if (!target) continue;
      const def = MERCENARIES[merc.kind], origin = mercPosition(this.mercenaries.indexOf(merc)), master = this.levels[merc.kind] >= 100;
      merc.shots = (merc.shots ?? 0) + 1;
      // Core 集火射擊: consecutive shots on one target stack +15% (up to ×4); a new target resets.
      let scale = 1;
      if (this.cores.has('focusfire')) {
        merc.focusStacks = merc.focusTarget === target.id ? Math.min(20, (merc.focusStacks ?? 0) + 1) : 0; merc.focusTarget = target.id;
        scale *= Math.min(4, 1 + 0.15 * merc.focusStacks);
      }
      // Core 彈藥經濟: money is ammunition.
      if (this.cores.has('ammoeco')) { scale *= this.money > 0 ? 1 + Math.log2(1 + this.money) / 4 : 0.5; this.money = Math.max(0, this.money * 0.99); }
      if (merc.kind === 'flame') {
        const power = this.damageFor(merc.kind) * scale;
        this.hit(target, { baseDamage: 0, tags: def.tags }); this.burn(target, power, 3, def.tags);
        // Lv100: the flame spreads to the nearest neighbour.
        if (master) { const n = this.nearest(target, 60); if (n) this.burn(n, power, 3, def.tags); }
      } else {
        if (merc.kind === 'tesla') this.shock(target, 0.7);
        const damage = this.damageFor(merc.kind) * scale;
        this.hit(target, { baseDamage: damage, tags: def.tags }, master && merc.kind === 'rifle' && merc.shots % 3 === 0);
        // Pierce: the same shot carries on through enemies behind the target, 40% weaker each time.
        if (this.pierce > 0) {
          const behind = this.enemies.filter(e => e !== target && e.hp > 0 && e.x >= 0 && e.x < target.x && Math.abs(e.y - target.y) < 45).sort((a, b) => b.x - a.x).slice(0, this.pierce);
          behind.forEach((e, i) => this.hit(e, { baseDamage: damage * this.perm.pierceRetention ** (i + 1), tags: def.tags }));
        }
        // Lv100: the tesla shot chains to a second enemy.
        if (master && merc.kind === 'tesla') { const n = this.nearest(target, 90); if (n) { this.shock(n, 0.7); this.hit(n, { baseDamage: damage * 0.6, tags: def.tags }); } }
      }
      this.visual(merc.kind === 'flame' ? 'flame' : 'shot', target.x, target.y, def.color, 0, origin.x, origin.y);
      merc.shotTimer = this.intervalFor(merc.kind);
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (this.clearedWave > this.completedWaves) { this.earn(calculateValue(5 * B.WAVE_REWARD_GROWTH_PER_MINUTE ** (this.elapsed / 60), ['Economy.WaveReward'], this.modifiers)); this.xp += 2; this.completedWaves = this.clearedWave; }
    if (!this.endless && this.elapsed + 1e-8 >= FIELD.victorySeconds) { this.elapsed = FIELD.victorySeconds; this.phase = 'victory'; return; }
    this.checkLevel();
  }
}
