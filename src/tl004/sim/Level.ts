import type { MaterialId } from '../config/Materials.ts';
import type { StarThresholds } from '../rules/Scoring.ts';

export interface BlockSpec {
  material: MaterialId;
  x: number;
  y: number;
  /** Rectangle size for wood/stone/glass. */
  w?: number;
  h?: number;
  angle?: number;
  /** Which of the 15 serpentela designs a target uses (e.g. "serpentela-w50-01"). */
  shape?: string;
}

export interface LevelData {
  id: string;
  name: string;
  /** Partner ids fired in order (see src/tl004/data/attackers.generated.json). */
  shots: string[];
  stars: StarThresholds;
  blocks: BlockSpec[];
}

export interface Point { x: number; y: number }

/** Art with a traced collision outline (attackers or the TL001 serpentela data). */
export interface ShapeDefinition {
  id: string;
  width: number;
  height: number;
  outline: Point[];
}

export interface ShapeLibrary {
  /** Launched partners; outlines in display px. */
  attackers: ReadonlyMap<string, ShapeDefinition>;
  /** 四十塊 targets; outlines in 96 px art space, scaled by TARGET.scale. */
  targets: ReadonlyMap<string, ShapeDefinition>;
}

const MATERIAL_IDS = new Set(['wood', 'stone', 'glass', 'target']);

/** Rejects level data the simulation cannot build correctly (JSON is not type-checked). */
export function validateLevel(level: LevelData, shapes: ShapeLibrary): void {
  if (!level.shots.length) throw new Error(`Level ${level.id}: no shots`);
  for (const id of level.shots) if (!shapes.attackers.has(id)) throw new Error(`Level ${level.id}: unknown partner "${id}"`);
  level.blocks.forEach((block, i) => {
    if (!MATERIAL_IDS.has(block.material)) throw new Error(`Level ${level.id} block ${i}: unknown material "${block.material}"`);
    if (block.material === 'target') {
      if (!block.shape || !shapes.targets.has(block.shape)) throw new Error(`Level ${level.id} block ${i}: target needs a known serpentela shape`);
      if (block.angle) throw new Error(`Level ${level.id} block ${i}: targets cannot be rotated`);
    } else if (!(block.w && block.w > 0 && block.h && block.h > 0)) {
      throw new Error(`Level ${level.id} block ${i}: ${block.material} needs w and h`);
    }
  });
  if (!level.blocks.some((block) => block.material === 'target')) throw new Error(`Level ${level.id}: no targets`);
}
