import { calculateDamage, calculateValue, effectiveCooldown, runScore } from './Combat.ts';
import type { DamageInstance, Modifier, Tag } from './Combat.ts';
import { CARDS, ENEMIES, MERCENARIES } from './Content.ts';
import type { EnemyKind, MercKind, UpgradeCard } from './Content.ts';

export const FIELD = { width: 960, height: 420, wallX: 750, step: 1 / 60, waveSeconds: 30, victorySeconds: 1200 } as const;
export type Phase = 'ready' | 'running' | 'choice' | 'paused' | 'over' | 'victory';
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; defense: number;
  speed: number; attack: number; reward: number; xp: number; burnPower: number; burnDuration: number;
  corrosionPower: number; corrosionDuration: number; shockPower: number; shockDuration: number; hitFlash: number;
}
export interface Mercenary { id: number; kind: MercKind; shotTimer: number; cooldown: number }
export interface VisualEvent { kind: 'shot' | 'flame' | 'laser' | 'blast' | 'hit' | 'kill'; x: number; y: number; fromX?: number; fromY?: number; color: string; life: number; maxLife: number; radius: number }
export interface FireZone { x: number; y: number; radius: number; remaining: number; power: number }
const mercY = (slot: number) => 130 + slot * 92;
export const mercPosition = (slot: number) => ({ x: 824 + (slot === 1 ? 26 : 0), y: mercY(slot) });

/** Deterministic fixed-step model, independent of Canvas, browser storage and network. */
export class DefenseRun {
  phase: Phase = 'ready';
  elapsed = 0; money = 0; totalEarnedMoney = 0; kills = 0; xp = 0; level = 1;
  wallHealth = 40; wallMaxHealth = 40; wallReduction = 0; wallLevel = 0;
  haste = 0; attackSpeed = 1; skillRange = 1; choices: UpgradeCard[] = [];
  selectedCards: UpgradeCard[] = []; modifiers: Modifier[] = [];
  enemies: Enemy[] = []; mercenaries: Mercenary[] = [];
  levels: Record<MercKind, number> = { rifle: 1, flame: 1, tesla: 1 };
  events: VisualEvent[] = []; zones: FireZone[] = [];
  endless = false;
  private seed: number; private accumulator = 0; private spawnTimer = 0;
  private nextId = 1; private completedWaves = 0;
  constructor(seed = Math.floor(Math.random() * 0xffffffff)) { this.seed = seed >>> 0; }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 0x100000000; }
  get wave() { return !this.endless && this.elapsed >= FIELD.victorySeconds ? 40 : Math.floor(this.elapsed / FIELD.waveSeconds) + 1; }
  get clearedWave() { return Math.floor((this.elapsed + 1e-8) / FIELD.waveSeconds); }
  get xpNeeded() { return Math.ceil(3 * 1.6 ** (this.level - 1)); }
  get score() { return runScore(this.elapsed, this.totalEarnedMoney); }
  start() { if (this.phase !== 'ready') return; this.mercenaries.push({ id: this.nextId++, kind: 'rifle', shotTimer: 0, cooldown: 0 }); this.phase = 'running'; }
  pause() { if (this.phase === 'running') this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = 'running'; }
  continueEndless() { if (this.phase === 'victory') { this.endless = true; this.phase = 'running'; } }
  recruitCost(kind: MercKind) { return Math.ceil(calculateValue(MERCENARIES[kind].recruit * 1.35 ** this.mercenaries.filter(m => m.kind === kind).length, ['Economy.RecruitCost'], this.modifiers)); }
  upgradeCost(kind: MercKind) { return Math.ceil(calculateValue(5 * 1.15 ** this.levels[kind], ['Economy.UpgradeCost'], this.modifiers)); }
  damageFor(kind: MercKind) {
    const level = this.levels[kind];
    return MERCENARIES[kind].damage * 1.18 ** (level - 1) * (level >= 10 ? 2 : 1) * (level >= 50 ? 3 : 1);
  }
  intervalFor(kind: MercKind) { return MERCENARIES[kind].interval / this.attackSpeed / (this.levels[kind] >= 25 ? 1.5 : 1); }
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
  get repairCost() { return Math.ceil(6 * 1.15 ** this.wallLevel); }
  get fortifyCost() { return Math.ceil(10 * 1.3 ** this.wallLevel); }
  repair(): boolean {
    if (this.phase !== 'running' || this.wallHealth >= this.wallMaxHealth || this.money < this.repairCost) return false;
    this.money -= this.repairCost; this.wallHealth = Math.min(this.wallMaxHealth, this.wallHealth + calculateValue(this.wallMaxHealth * 0.4, ['Defense.Repair'], this.modifiers)); return true;
  }
  fortify(): boolean {
    if (this.phase !== 'running' || this.money < this.fortifyCost) return false;
    this.money -= this.fortifyCost; const increase = this.wallMaxHealth * 0.35;
    this.wallMaxHealth += increase; this.wallHealth += increase; this.wallLevel++; return true;
  }
  choose(id: string): boolean {
    if (this.phase !== 'choice') return false;
    const card = this.choices.find(c => c.id === id); if (!card) return false;
    this.selectedCards.push(card);
    if (card.modifier) this.modifiers.push({ ...card.modifier });
    if (card.effect === 'speed') this.attackSpeed *= 1.3;
    if (card.effect === 'haste') this.haste += 100;
    if (card.effect === 'radius') this.skillRange *= 1.3;
    if (card.effect === 'wall') { const n = this.wallMaxHealth * 0.5; this.wallHealth += n; this.wallMaxHealth += n; }
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
    enemy.burnPower += calculateValue(power, tags, this.modifiers); enemy.burnDuration = Math.max(enemy.burnDuration, duration);
  }
  private hit(enemy: Enemy, hit: DamageInstance) {
    if (enemy.hp <= 0) return;
    const result = calculateDamage(hit, enemy, this.modifiers);
    enemy.hp -= result.final; enemy.hitFlash = 0.1;
    for (const modifier of result.specials) {
      if (modifier.rule === 'ignite') this.burn(enemy, modifier.value, 4, hit.tags);
      if (modifier.rule === 'corrode') { enemy.corrosionPower += modifier.value; enemy.corrosionDuration = 6; }
      if (modifier.rule === 'shock') { enemy.shockPower += modifier.value; enemy.shockDuration = 6; }
    }
    if (enemy.hp <= 0) this.kill(enemy);
  }
  private kill(enemy: Enemy) {
    this.kills++; this.earn(calculateValue(enemy.reward, ['Economy.KillReward'], this.modifiers)); this.xp += enemy.xp;
    this.visual('kill', enemy.x, enemy.y, ENEMIES[enemy.kind].color, 22);
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
      this.zones.push({ x, y, radius, remaining: 6, power: calculateValue(base * 3, tags, this.modifiers) });
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
  private spawn() {
    const roll = this.random();
    let kind: EnemyKind = 'walker', threshold = 0;
    const roster: [EnemyKind, number, number][] = [['elite', 150, 0.07], ['armored', 75, 0.13], ['brute', 45, 0.18], ['runner', 22, 0.22]];
    for (const [candidate, unlock, weight] of roster) {
      if (this.elapsed < unlock) continue;
      threshold += weight;
      if (roll < threshold) { kind = candidate; break; }
    }
    const def = ENEMIES[kind], minutes = this.elapsed / 60, hp = def.hp * 1.8 ** minutes;
    this.enemies.push({ id: this.nextId++, kind, x: -20, y: 100 + this.random() * 260, hp, maxHp: hp, defense: def.defense,
      speed: def.speed * (0.96 + this.random() * 0.08), attack: def.attack * 1.45 ** minutes,
      reward: def.reward * 1.9 ** minutes, xp: def.xp, burnPower: 0, burnDuration: 0,
      corrosionPower: 0, corrosionDuration: 0, shockPower: 0, shockDuration: 0, hitFlash: 0 });
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
    if (this.spawnTimer <= 0) { this.spawn(); this.spawnTimer += (this.elapsed < 12 ? 3 : 1.8) / 1.1 ** (this.elapsed / 60); }
    for (const event of this.events) event.life -= dt;
    this.events = this.events.filter(e => e.life > 0);
    for (const zone of this.zones) zone.remaining -= dt;
    this.zones = this.zones.filter(z => z.remaining > 0);
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.corrosionDuration = Math.max(0, enemy.corrosionDuration - dt);
      enemy.shockDuration = Math.max(0, enemy.shockDuration - dt);
      if (!enemy.corrosionDuration) enemy.corrosionPower = 0;
      if (!enemy.shockDuration) enemy.shockPower = 0;
      // Each enemy owns one aggregate burn, never a growing array of effect instances.
      let dot = 0;
      if (enemy.burnDuration > 0) { dot += enemy.burnPower * Math.min(dt, enemy.burnDuration); enemy.burnDuration = Math.max(0, enemy.burnDuration - dt); }
      if (!enemy.burnDuration) enemy.burnPower = 0;
      for (const zone of this.zones) if (Math.hypot(enemy.x - zone.x, enemy.y - zone.y) <= zone.radius) dot += zone.power * dt;
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
      const target = this.enemies.filter(e => e.hp > 0 && e.x >= 0).sort((a, b) => b.x - a.x)[0];
      if (merc.shotTimer > 0 || !target) continue;
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
    if (this.clearedWave > this.completedWaves) { this.earn(calculateValue(5 * 1.9 ** (this.elapsed / 60), ['Economy.WaveReward'], this.modifiers)); this.xp += 2; this.completedWaves = this.clearedWave; }
    if (!this.endless && this.elapsed + 1e-8 >= FIELD.victorySeconds) { this.elapsed = FIELD.victorySeconds; this.phase = 'victory'; return; }
    this.checkLevel();
  }
}
