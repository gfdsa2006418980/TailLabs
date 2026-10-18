import manifest from './serpentelas.generated.json';

export interface Point { x: number; y: number; }
export interface SerpentelaDefinition {
  id: string;
  name: string;
  weight: number;
  texture: string;
  file: string;
  width: number;
  height: number;
  center: Point;
  bounds: { minX: number; minY: number; maxX: number; maxY: number; };
  outline: Point[];
  parts: Point[][];
}

export const SERPENTELAS: readonly SerpentelaDefinition[] = manifest.definitions;
export const SERPENTELA_SCALE = manifest.displayScale;
