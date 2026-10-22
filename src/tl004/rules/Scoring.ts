import { SCORE } from '../config/Tuning.ts';

export interface StarThresholds {
  /** Score needed for two stars; clearing the level always gives one. */
  two: number;
  three: number;
}

export function starsFor(score: number, cleared: boolean, thresholds: StarThresholds): number {
  if (!cleared) return 0;
  if (score >= thresholds.three) return 3;
  if (score >= thresholds.two) return 2;
  return 1;
}

interface BreakRecord { step: number; points: number }

/** Score for one level attempt. Chain bonus: many breaks within a short window of one shot. */
export class ScoreBook {
  total = 0;
  private shotBreaks: BreakRecord[] = [];
  private shotStartStep = 0;

  beginShot(step: number): void {
    this.shotStartStep = step;
    this.shotBreaks = [];
  }

  addBreak(points: number, step: number): number {
    this.total += points;
    this.shotBreaks.push({ step, points });
    return points;
  }

  /** Breaks counted toward the current shot (for slow-motion and chain checks). */
  get breaksThisShot(): number { return this.shotBreaks.length; }

  /** Applies and returns the chain bonus for the shot that just ended. */
  endShot(): number {
    const windowEnd = this.shotStartStep + SCORE.chainWindowSteps;
    const inWindow = this.shotBreaks.filter((record) => record.step <= windowEnd);
    if (inWindow.length < SCORE.chainMinBreaks) return 0;
    const bonus = Math.round(inWindow.reduce((sum, record) => sum + record.points, 0) * SCORE.chainBonus);
    this.total += bonus;
    return bonus;
  }

  addRemainingShot(): number {
    this.total += SCORE.remainingShot;
    return SCORE.remainingShot;
  }
}
