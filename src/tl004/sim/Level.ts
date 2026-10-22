import type { MaterialId } from '../config/Materials.ts';
import type { StarThresholds } from '../rules/Scoring.ts';

export interface BlockSpec {
  material: MaterialId;
  x: number;
  y: number;
  /** Rectangle size; crystals use their own fixed shape. */
  w?: number;
  h?: number;
  angle?: number;
}

export interface LevelData {
  id: string;
  name: string;
  shots: string[];
  stars: StarThresholds;
  blocks: BlockSpec[];
}

export interface Point { x: number; y: number }

/** Collider data shared with TL001 (src/data/serpentelas.generated.json). */
export interface SerpentelaShape {
  id: string;
  width: number;
  height: number;
  outline: Point[];
}

/** Crystal collider and drawing outline, centred near its middle. */
export const CRYSTAL_SHAPE: readonly Point[] = [
  { x: 0, y: -48 }, { x: 27, y: -16 }, { x: 24, y: 26 }, { x: 0, y: 46 }, { x: -24, y: 26 }, { x: -27, y: -16 },
];

const MATERIAL_IDS = new Set(['wood', 'stone', 'glass', 'crystal']);

/** Rejects level data the simulation cannot build correctly (JSON is not type-checked). */
export function validateLevel(level: LevelData): void {
  if (!level.shots.length) throw new Error(`Level ${level.id}: no shots`);
  level.blocks.forEach((block, i) => {
    if (!MATERIAL_IDS.has(block.material)) throw new Error(`Level ${level.id} block ${i}: unknown material "${block.material}"`);
    if (block.material === 'crystal') {
      if (block.angle) throw new Error(`Level ${level.id} block ${i}: crystals cannot be rotated`);
    } else if (!(block.w && block.w > 0 && block.h && block.h > 0)) {
      throw new Error(`Level ${level.id} block ${i}: ${block.material} needs w and h`);
    }
  });
}

export function crystalLevelCount(level: LevelData): number {
  return level.blocks.filter((block) => block.material === 'crystal').length;
}
