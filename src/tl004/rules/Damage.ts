import type { MaterialSpec } from '../config/Materials.ts';

export interface ImpactBody {
  mass: number;
  isStatic: boolean;
  velocity: { x: number; y: number };
}

/** Effective mass of a two-body contact; a static side counts as infinitely heavy. */
export function effectiveMass(a: ImpactBody, b: ImpactBody): number {
  if (a.isStatic && b.isStatic) return 0;
  if (a.isStatic) return b.mass;
  if (b.isStatic) return a.mass;
  return (a.mass * b.mass) / (a.mass + b.mass);
}

/** Impact strength from pre-solve velocities along the contact normal. */
export function impactStrength(a: ImpactBody, b: ImpactBody, normal: { x: number; y: number }): number {
  const relative = Math.abs((a.velocity.x - b.velocity.x) * normal.x + (a.velocity.y - b.velocity.y) * normal.y);
  return relative * Math.sqrt(effectiveMass(a, b));
}

export function damageFrom(strength: number, material: MaterialSpec): number {
  return Math.max(0, strength - material.threshold) * material.fragility;
}
