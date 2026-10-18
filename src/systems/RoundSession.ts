import { ROUND } from '../game/RoundConfig.ts';

export type RoundState = 'ready' | 'playing' | 'failed' | 'completed';
export interface PieceSnapshot {
  id: number;
  frozen: boolean;
  grabbed?: boolean;
  hasLanded: boolean;
  bounds: { min: { x: number; y: number }; max: { x: number; y: number } };
}
export interface RoundBounds { safeLeft: number; safeRight: number; fallLimit: number; }
export interface RoundResult {
  target: number;
  placedCount: number;
  droppedCount: number;
  elapsedMilliseconds: number;
  maxHeight: number;
  baseScore: number;
  heightBonus: number;
  speedBonus: number;
  score: number;
  completed: boolean;
}

export class RoundSession {
  state: RoundState = 'ready';
  elapsedMilliseconds = 0;
  droppedCount = 0;
  placedCount = 0;
  maxHeight = 0;
  warning = false;
  towerTop?: number;
  private outsideSince = new Map<number, number>();
  readonly target: number;
  constructor(target: number = ROUND.target) { this.target = target; }
  get remaining(): number { return this.target - this.droppedCount; }
  get score(): number { return this.result().score; }
  start(): void { if (this.state === 'ready') this.state = 'playing'; }
  recordDrop(): boolean {
    if (this.state !== 'playing' || !this.remaining) return false;
    this.droppedCount++;
    return true;
  }
  resetEscapeTimer(id: number): void { this.outsideSince.delete(id); }
  update(delta: number, pieces: readonly PieceSnapshot[], platformY: number, bounds: RoundBounds = ROUND): boolean {
    if (this.state !== 'playing') return false;
    this.elapsedMilliseconds += Math.max(0, delta);
    let placedCount = 0;
    let towerTop: number | undefined;
    let failed = false;
    this.warning = false;
    for (const piece of pieces) {
      if (piece.grabbed) { this.outsideSince.delete(piece.id); continue; }
      const out = piece.bounds.max.x < bounds.safeLeft || piece.bounds.min.x > bounds.safeRight || piece.bounds.min.y > bounds.fallLimit;
      if (piece.frozen) placedCount++;
      if (piece.hasLanded && piece.bounds.max.x >= bounds.safeLeft && piece.bounds.min.x <= bounds.safeRight) {
        towerTop = Math.min(towerTop ?? Infinity, piece.bounds.min.y);
      }
      if (out) {
        this.warning = true;
        const since = this.outsideSince.get(piece.id) ?? this.elapsedMilliseconds;
        this.outsideSince.set(piece.id, since);
        if (this.elapsedMilliseconds - since >= ROUND.failGraceMs) failed = true;
      } else this.outsideSince.delete(piece.id);
      if (piece.frozen && !out) this.maxHeight = Math.max(this.maxHeight, platformY - piece.bounds.min.y);
    }
    this.placedCount = placedCount;
    this.towerTop = towerTop;
    if (failed) { this.state = 'failed'; return true; }
    if (this.remaining === 0 && this.placedCount === this.target && !this.warning) {
      this.state = 'completed'; return true;
    }
    return false;
  }
  result(): RoundResult {
    const baseScore = this.placedCount * ROUND.pointsPerPiece;
    const heightBonus = Math.floor(this.maxHeight) * ROUND.pointsPerHeight;
    const completed = this.state === 'completed';
    const speedBonus = completed ? Math.max(0, Math.floor((ROUND.speedTargetMs - this.elapsedMilliseconds) / 1000)) * ROUND.speedPointsPerSecond : 0;
    return { target: this.target, placedCount: this.placedCount, droppedCount: this.droppedCount,
      elapsedMilliseconds: this.elapsedMilliseconds, maxHeight: this.maxHeight,
      baseScore, heightBonus, speedBonus, score: baseScore + heightBonus + speedBonus, completed };
  }
}
