import { calculateDamage, calculateValue, effectiveCooldown, runScore } from './Combat.ts';
import type { DamageInstance, Modifier, Tag } from './Combat.ts';
import { CARDS, ENEMIES, MERCENARIES } from './Content.ts';
import type { EnemyKind, MercKind, UpgradeCard } from './Content.ts';
import type { PermanentEffects } from './Talents.ts';
import { advanceBurn, applyBurn } from './Burn.ts';
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
}
export interface Mercenary { id: number; kind: MercKind; shotTimer: number; cooldown: number }
export interface VisualEvent {
  kind: 'shot' | 'flame' | 'laser' | 'blast' | 'hit' | 'kill'; x: number; y: number; fromX?: number; fromY?: number; color: string; life: number; maxLife: number; radius: number;
  /** Presentation only: damage dealt ('hit') or money earned ('kill'). */
  amount?: number; enemy?: EnemyKind; target?: number; skill?: boolean;
}
export interface FireZone { x: number; y: number; radius: number; remaining: number; power: number; pulseTimer: number; contacts: Set<number> }
const mercY = (slot: number) => 130 + slot * 92;
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
  private seed: number; private accumulator = 0; private spawnTimer = 0;
  private nextId = 1; private completedWaves = 0; private bossRushes = 0;
  constructor(seed = Math.floor(Math.random() * 0xffffffff), permanent?: PermanentEffects) {
    this.seed = seed >>> 0;
    if (permanent) {
      this.wallHealth = this.wallMaxHealth = this.wallStartHealth = B.BARRICADE_BASE_HEALTH * permanent.wallHealth;
      this.attackSpeed = permanent.attackSpeed; this.haste = permanent.haste;
      this.modifiers = permanent.modifiers.map(modifier => ({ ...modifier, tags: [...modifier.tags] }));
    }
  }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 0x100000000; }
  get wave() { return !this.endless && this.elapsed >= FIELD.victorySeconds ? 40 : Math.floor(this.elapsed / FIELD.waveSeconds) + 1; }
  get clearedWave() { return Math.floor((this.elapsed + 1e-8) / FIELD.waveSeconds); }
  get xpNeeded() { return Math.ceil(3 * 1.6 ** (this.level - 1)); }
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
  }
  pause() { if (this.phase === 'running') this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = 'running'; }
  continueEndless() { if (this.phase === 'victory') { this.endless = true; this.phase = 'running'; } }
  recruitCost(kind: MercKind) { return Math.ceil(calculateValue(B.RECRUIT_BASE_COST[kind] * B.RECRUIT_COST_GROWTH ** this.mercenaries.filter(m => m.kind === kind).length, ['Economy.RecruitCost'], this.modifiers)); }
  upgradeCost(kind: MercKind) { return Math.ceil(calculateValue(B.UPGRADE_BASE_COST * B.UPGRADE_COST_GROWTH ** this.levels[kind], ['Economy.UpgradeCost'], this.modifiers)); }
  damageFor(kind: MercKind) {
    const level = this.levels[kind];
    return MERCENARIES[kind].damage * B.MERC_DAMAGE_PER_LEVEL ** (level - 1) * (level >= 10 ? 2 : 1) * (level >= 50 ? 3 : 1);
  }
  intervalFor(kind: MercKind) { return MERCENARIES[kind].interval / (this.attackSpeed * (1 + this.attackSpeedBonus)) / (this.levels[kind] >= 25 ? 1.5 : 1); }
  recruit(kind: MercKind): boolean {
    const cost = this.recruitCost(kind);
    if (this.phase !== 'running' || this.mercenaries.length >= 3 || this.money < cost) return false;
    this.money -= cost; this.mercenaries.push({ id: this.nextId++, kind, shotTimer: 0, cooldown: 0 }); return true;
  }
  upgrade(kind: MercKind): boolean {
    const cost = this.upgradeCost(kind);
    if (this.phase !== 'running' || !this.mercenaries.some(m => m.kind === kind) || this.money < cost) return false;
    this.money -= cost; this.levels[kind]++; return true;
  }
  get repairCost() { return Math.ceil(B.REPAIR_BASE_COST * B.REPAIR_COST_GROWTH ** this.wallLevel); }
  get fortifyCost() { return Math.ceil(B.FORTIFY_BASE_COST * B.FORTIFY_COST_GROWTH ** this.wallLevel); }
  repair(): boolean {
    if (this.phase !== 'running' || this.wallHealth >= this.wallMaxHealth || this.money < this.repairCost) return false;
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
    this.selectedCards.push(card);
    if (card.modifier) this.modifiers.push({ ...card.modifier });
    if (card.effect === 'speed') this.attackSpeedBonus += 0.3;
    if (card.effect === 'haste') this.haste += 100;
    if (card.effect === 'radius') this.skillRange *= 1.3;
    if (card.effect === 'wall') { const n = this.wallStartHealth * 0.5; this.wallHealth += n; this.wallMaxHealth += n; }
    if (card.effect === 'repair') this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + this.wallMaxHealth * 0.5);
    this.choices = []; this.phase = 'running'; this.checkLevel(); return true;
  }
  private earn(amount: number) { this.money += amount; this.totalEarnedMoney += amount; }
  private checkLevel() {
    if (this.phase !== 'running' || this.xp < this.xpNeeded) return;
    this.xp -= this.xpNeeded; this.level++;
    const pool = [...(this.selectedCards.length ? CARDS : CARDS.slice(0, 4))];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    this.choices = pool.slice(0, 3); this.phase = 'choice';
  }
  private visual(kind: VisualEvent['kind'], x: number, y: number, color: string, radius = 0, fromX?: number, fromY?: number) {
    const life = kind === 'shot' ? 0.13 : kind === 'blast' ? 0.55 : 0.4;
    this.events.push({ kind, x, y, color, radius, fromX, fromY, life, maxLife: life });
  }
  private burn(enemy: Enemy, power: number, duration: number, sourceTags: readonly Tag[]) {
    const tags: Tag[] = [...sourceTags.filter(t => !t.startsWith('Damage.') && t !== 'Mechanic.Projectile'), 'Damage.Fire', 'Mechanic.DOT', 'Status.Burning'];
    applyBurn(enemy, calculateValue(power, tags, this.modifiers), duration);
  }
  private igniteZone(zone: FireZone, pulse: boolean) {
    const contacts = new Set<number>();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || Math.hypot(enemy.x - zone.x, enemy.y - zone.y) > zone.radius) continue;
      contacts.add(enemy.id);
      // First contact is immediate; remaining inside reapplies at 1 Hz, never once per frame.
      if (pulse || !zone.contacts.has(enemy.id)) applyBurn(enemy, zone.power, 3);
    }
    zone.contacts = contacts;
  }
  private hit(enemy: Enemy, hit: DamageInstance) {
    if (enemy.hp <= 0) return;
    const result = calculateDamage(hit, enemy, this.modifiers);
    enemy.hp -= result.final; enemy.hitFlash = 0.1;
    if (result.final > 0) this.events.push({ kind: 'hit', x: enemy.x, y: enemy.y, color: '', life: 0.12, maxLife: 0.12, radius: 0,
      amount: result.final, enemy: enemy.kind, target: enemy.id, skill: hit.tags.includes('Skill.Active') });
    for (const modifier of result.specials) {
      if (modifier.rule === 'ignite') this.burn(enemy, modifier.value, 4, hit.tags);
      if (modifier.rule === 'corrode') { enemy.corrosionPower += modifier.value; enemy.corrosionDuration = 6; }
      if (modifier.rule === 'shock') { enemy.shockPower += modifier.value; enemy.shockDuration = 6; }
    }
    if (enemy.hp <= 0) this.kill(enemy);
  }
  private kill(enemy: Enemy) {
    const reward = calculateValue(enemy.reward, ['Economy.KillReward'], this.modifiers);
    this.kills++; this.earn(reward); this.xp += enemy.xp;
    this.visual('kill', enemy.x, enemy.y, ENEMIES[enemy.kind].color, 22);
    Object.assign(this.events[this.events.length - 1]!, { amount: reward, enemy: enemy.kind, target: enemy.id });
  }
  cast(slot: number, x: number, y: number): boolean {
    const merc = this.mercenaries[slot];
    if (!merc || this.phase !== 'running' || merc.cooldown > 1e-8 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > FIELD.wallX || y < 65 || y > 390) return false;
    const def = MERCENARIES[merc.kind], radius = def.radius * this.skillRange;
    const origin = mercPosition(slot), base = this.damageFor(merc.kind);
    if (merc.kind === 'rifle') {
      const tags: Tag[] = ['Damage.Kinetic', 'Mechanic.AOE', 'Mechanic.Explosion', 'Mechanic.Knockback', 'Skill.Active', 'Mercenary.rifle'];
      for (const enemy of this.enemies) if (Math.hypot(enemy.x - x, enemy.y - y) <= radius) {
        this.hit(enemy, { baseDamage: base * 5, tags }); enemy.x -= 40;
      }
      this.visual('blast', x, y, '#f8b968', radius);
    } else if (merc.kind === 'flame') {
      const tags: Tag[] = ['Damage.Fire', 'Mechanic.AOE', 'Mechanic.DOT', 'Skill.Active', 'Mercenary.flame'];
      const zone: FireZone = { x, y, radius, remaining: 6, power: calculateValue(base * 3, tags, this.modifiers), pulseTimer: 1, contacts: new Set() };
      this.igniteZone(zone, false); this.zones.push(zone);
      this.visual('blast', x, y, '#e6764b', radius);
    } else {
      const dx = x - origin.x, dy = y - origin.y, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
      for (const enemy of this.enemies) {
        const ex = enemy.x - origin.x, ey = enemy.y - origin.y, along = ex * ux + ey * uy;
        if (along >= 0 && Math.abs(ex * uy - ey * ux) <= radius) {
          enemy.shockPower += 3; enemy.shockDuration = 6;
          this.hit(enemy, { baseDamage: base * 9, tags: ['Damage.Kinetic', 'Damage.Electric', 'Mechanic.Pierce', 'Skill.Active', 'Mercenary.tesla'] });
        }
      }
      this.visual('laser', origin.x + ux * 1100, origin.y + uy * 1100, '#91e7ec', radius, origin.x, origin.y);
    }
    merc.cooldown = effectiveCooldown(def.cooldown, this.haste); this.enemies = this.enemies.filter(e => e.hp > 0); this.checkLevel(); return true;
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
        enemy.hp -= calculateDamage({ baseDamage: dot, tags: ['Damage.Fire', 'Mechanic.DOT', 'Status.Burning'] }, enemy).final;
        if (enemy.hp <= 0) { this.kill(enemy); continue; }
      }
      if (enemy.x < FIELD.wallX - 18) enemy.x = Math.min(FIELD.wallX - 18, enemy.x + enemy.speed * dt);
      else this.wallHealth -= enemy.attack * dt * (1 - this.wallReduction);
      if (this.wallHealth <= 0) { this.wallHealth = 0; this.phase = 'over'; break; }
    }
    if (this.phase !== 'running') return;
    for (const merc of this.mercenaries) {
      merc.cooldown = Math.max(0, merc.cooldown - dt); merc.shotTimer -= dt;
      if (merc.shotTimer > 0) continue;
      // Closest living enemy to the wall; first in spawn order on ties. O(n), no per-frame sort.
      let target: Enemy | undefined;
      for (const e of this.enemies) if (e.hp > 0 && e.x >= 0 && (!target || e.x > target.x)) target = e;
      if (!target) continue;
      const def = MERCENARIES[merc.kind], origin = mercPosition(this.mercenaries.indexOf(merc));
      if (merc.kind === 'flame') { this.hit(target, { baseDamage: 0, tags: def.tags }); this.burn(target, this.damageFor(merc.kind), 3, def.tags); }
      else {
        if (merc.kind === 'tesla') { target.shockPower += 0.7; target.shockDuration = 6; }
        this.hit(target, { baseDamage: this.damageFor(merc.kind), tags: def.tags });
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
