export type Tag = `Damage.${'Kinetic' | 'Fire' | 'Bio' | 'Electric'}`
  | `Mechanic.${'Projectile' | 'RapidFire' | 'Crit' | 'Pierce' | 'AOE' | 'Explosion' | 'DOT' | 'Chain' | 'Knockback'}`
  | `Status.${'Burning' | 'Corrosion' | 'Shock'}` | `Skill.${'Active' | 'AutoAttack'}`
  | `Economy.${'KillReward' | 'WaveReward' | 'RecruitCost' | 'UpgradeCost'}`
  | `Defense.${'Barricade' | 'Repair'}` | `Weapon.${string}` | `Mercenary.${string}`;

export type SpecialRule = 'ignite' | 'corrode' | 'shock';
export type Modifier = { tags: readonly Tag[] } & (
  { kind: 'Flat' | 'Add' | 'More'; value: number } |
  { kind: 'Special'; rule: SpecialRule; value: number });
export interface DamageInstance { baseDamage: number; tags: readonly Tag[] }
export interface DefenseState { defense: number; corrosionPower: number; shockPower: number }

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

/** Provisional compressed Shock curve; Bio and Electric occupy different stages. */
export function calculateDamage(hit: DamageInstance, target: DefenseState, modifiers: readonly Modifier[] = []) {
  const raw = calculateValue(hit.baseDamage, hit.tags, modifiers);
  const effectiveDefense = Math.max(0, target.defense) / (1 + Math.max(0, target.corrosionPower));
  const shockMultiplier = 1 + Math.log2(1 + Math.max(0, target.shockPower)) * 0.25;
  const specials = modifiers.filter((m): m is Modifier & { kind: 'Special' } =>
    m.kind === 'Special' && m.tags.every(tag => hit.tags.includes(tag)));
  return { raw, effectiveDefense, shockMultiplier, final: raw * 100 / (100 + effectiveDefense) * shockMultiplier, specials };
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
