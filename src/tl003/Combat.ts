/** Six damage elements in two families (2026-10-23): 元素 = Fire, Cold, Electric; 物理 = Kinetic, Toxin, Blast. */
export type DamageType = 'Kinetic' | 'Fire' | 'Cold' | 'Electric' | 'Toxin' | 'Blast';
export type Tag = `Damage.${DamageType | 'Elemental' | 'Physical'}`
  | `Mechanic.${'Projectile' | 'RapidFire' | 'Crit' | 'Pierce' | 'AOE' | 'Explosion' | 'DOT' | 'Chain' | 'Knockback' | 'Proc'}`
  | `Status.${'Burning' | 'Toxin' | 'Shock' | 'Chill' | 'Frozen' | 'Paralyzed' | 'Stunned'}` | `Skill.${'Active' | 'AutoAttack'}`
  | `Economy.${'KillReward' | 'WaveReward' | 'RecruitCost' | 'UpgradeCost'}`
  | `Defense.${'Barricade' | 'Repair'}` | `Weapon.${string}` | `Mercenary.${string}`;

export const ELEMENTAL_TYPES: readonly DamageType[] = ['Fire', 'Cold', 'Electric'];
export const PHYSICAL_TYPES: readonly DamageType[] = ['Kinetic', 'Toxin', 'Blast'];
/**
 * Adds the family tags, so one "元素傷害" or "物理傷害" modifier raises all three of its elements.
 * Idempotent: tags that already carry a family tag are returned as they are.
 */
export function withFamily(tags: readonly Tag[]): Tag[] {
  const out = [...tags];
  if (!out.includes('Damage.Elemental') && ELEMENTAL_TYPES.some(t => out.includes(`Damage.${t}`))) out.push('Damage.Elemental');
  if (!out.includes('Damage.Physical') && PHYSICAL_TYPES.some(t => out.includes(`Damage.${t}`))) out.push('Damage.Physical');
  return out;
}

/** Auto-attack ammo rules: ignite (burn), toxin (flat toxin), and extra cold / electric / blast damage as a fraction of the shot. */
export type SpecialRule = 'ignite' | 'toxin' | 'shock' | 'chill' | 'blast';
export type Modifier = { tags: readonly Tag[] } & (
  { kind: 'Flat' | 'Add' | 'More'; value: number } |
  { kind: 'Special'; rule: SpecialRule; value: number });
export interface DamageInstance { baseDamage: number; tags: readonly Tag[] }
/**
 * Two defenses (2026-10-23): `defense` is physical armor (100 / (100 + armor), toxin subtracts from it);
 * `resist` is elemental resistance, a flat share of fire, cold and electric damage removed.
 * Vulnerability (electric) multiplies damage taken after either.
 */
export interface DefenseState { defense: number; toxin: number; resist?: number; vulnerability?: number }
/** Elemental resistance never blocks everything. */
export const MAX_RESIST = 0.95;

/** Add is summed; More factors are independent. Tags are an ALL match. */
export function calculateValue(base: number, tags: readonly Tag[], modifiers: readonly Modifier[]): number {
  let flat = 0, add = 0, more = 1;
  for (const modifier of modifiers) {
    if (!modifier.tags.every(tag => tags.includes(tag))) continue;
    if (modifier.kind === 'Flat') flat += modifier.value;
    if (modifier.kind === 'Add') add += modifier.value;
    if (modifier.kind === 'More') more *= modifier.value;
  }
  return Math.max(0, (base + flat) * (1 + add) * more);
}

/**
 * Physical hits (and untyped ones) go through armor, elemental hits through resistance; a hit of both
 * families (the sniper's kinetic + cold) takes whichever is weaker. Toxin and electric stay in
 * different stages: toxin lowers armor, electric raises damage taken.
 */
export function calculateDamage(hit: DamageInstance, target: DefenseState, modifiers: readonly Modifier[] = []) {
  const raw = calculateValue(hit.baseDamage, hit.tags, modifiers);
  const effectiveDefense = Math.max(0, Math.max(0, target.defense) - Math.max(0, target.toxin));
  const elemental = ELEMENTAL_TYPES.some(t => hit.tags.includes(`Damage.${t}`));
  const physical = !elemental || PHYSICAL_TYPES.some(t => hit.tags.includes(`Damage.${t}`));
  const armor = 100 / (100 + effectiveDefense), resist = 1 - Math.min(MAX_RESIST, Math.max(0, target.resist ?? 0));
  const taken = elemental && physical ? Math.max(armor, resist) : elemental ? resist : armor;
  const shockMultiplier = Math.max(1, target.vulnerability ?? 1);
  const specials = modifiers.filter((m): m is Modifier & { kind: 'Special' } =>
    m.kind === 'Special' && m.tags.every(tag => hit.tags.includes(tag)));
  return { raw, effectiveDefense, shockMultiplier, final: raw * taken * shockMultiplier, specials };
}

export function effectiveCooldown(base: number, haste: number): number {
  return base / (1 + Math.max(0, haste) / 100);
}

export function runScore(seconds: number, totalEarnedMoney: number): number {
  return Math.floor(seconds / 30) + Math.floor(Math.log10(totalEarnedMoney + 1));
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const tier = Math.max(0, Math.floor(Math.log10(Math.max(1, Math.abs(value))) / 3));
  if (!tier) return Math.floor(value).toString();
  const letter = (n: number): string => n < 26 ? String.fromCharCode(65 + n) : letter(Math.floor(n / 26) - 1) + letter(n % 26);
  const suffix = ['', 'k', 'm', 'b'][tier] ?? letter(tier - 4);
  return `${Number((value / 1000 ** tier).toPrecision(3))}${suffix}`;
}
