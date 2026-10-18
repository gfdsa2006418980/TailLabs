export type CountdownLabel = '2' | '1' | 'START';
export const COUNTDOWN_SECONDS = 2;
export const START_HOLD_MS = 350;

/** Driven by the existing scene loop, with no background timers to leak. */
export class RunnerCountdown {
  private began?: number;
  get active(): boolean { return this.began !== undefined; }
  start(now: number): void { this.began = now; }
  cancel(): void { this.began = undefined; }
  label(now: number): CountdownLabel | undefined {
    if (this.began === undefined) return;
    const elapsed = Math.max(0, now - this.began);
    if (elapsed < 1000) return '2';
    if (elapsed < COUNTDOWN_SECONDS * 1000) return '1';
    if (elapsed < COUNTDOWN_SECONDS * 1000 + START_HOLD_MS) return 'START';
    this.cancel();
  }
}
