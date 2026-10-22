/** `target` is a 四十塊 (escaped serpentela) hiding in the tower; knocking every one out clears the level. */
export type MaterialId = 'wood' | 'stone' | 'glass' | 'target';

export interface MaterialSpec {
  density: number;
  friction: number;
  frictionStatic: number;
  restitution: number;
  /** Durability. */
  hp: number;
  /** Impacts weaker than this cause no damage, so resting towers never wear down. */
  threshold: number;
  fragility: number;
  score: number;
}

/**
 * Impact strength = relative normal speed (px/step) × √(effective mass).
 * Reference values: a full-power partner hitting a plank ≈ 40, a plank falling 1 m onto the ground ≈ 18.
 */
export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  wood: { density: 0.001, friction: 0.7, frictionStatic: 0.9, restitution: 0.05, hp: 14, threshold: 6, fragility: 1, score: 500 },
  stone: { density: 0.0024, friction: 0.8, frictionStatic: 1, restitution: 0.02, hp: 60, threshold: 22, fragility: 1, score: 1000 },
  glass: { density: 0.0008, friction: 0.35, frictionStatic: 0.5, restitution: 0.08, hp: 8, threshold: 3, fragility: 1.2, score: 300 },
  target: { density: 0.0009, friction: 0.6, frictionStatic: 0.8, restitution: 0.12, hp: 4, threshold: 2, fragility: 1.5, score: 5000 },
};
