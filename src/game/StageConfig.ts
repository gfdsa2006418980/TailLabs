export const STAGE = {
  width: 520,
  height: 660,
  spawnY: 148,
  minX: 61,
  maxX: 459,
  platformY: 548,
  platformDepth: 64,
  lightPillarWidth: 14,
  lightPillarHeight: 3 * 54,
} as const;

export function createStageLayout(width: number, height: number) {
  const chamberLeft = Math.max(18, width * 0.04);
  const chamberTop = Math.max(58, Math.min(90, height * 0.15));
  const chamberBottom = height - Math.max(68, Math.min(92, height * 0.14));
  const chamberWidth = width - chamberLeft * 2;
  const chamberHeight = Math.max(180, chamberBottom - chamberTop);
  const safeInset = chamberWidth * 0.196;
  const safeLeft = chamberLeft + safeInset;
  const safeRight = width - chamberLeft - safeInset;
  const platformY = chamberTop + chamberHeight * 0.8;
  return {
    width,
    height,
    chamberLeft,
    chamberTop,
    chamberWidth,
    chamberHeight,
    chamberRight: chamberLeft + chamberWidth,
    chamberBottom: chamberTop + chamberHeight,
    safeLeft,
    safeRight,
    spawnY: chamberTop + chamberHeight * 0.11,
    platformY,
    platformDepth: Math.max(28, Math.min(64, height * 0.09)),
    lightPillarWidth: Math.max(8, Math.min(14, width * 0.02)),
    lightPillarHeight: Math.min(STAGE.lightPillarHeight, chamberHeight * 0.55),
    fallLimit: height + Math.max(40, height * 0.1),
  };
}

export type StageLayout = ReturnType<typeof createStageLayout>;
