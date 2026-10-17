/** Tracks active wall time even while the render loop sleeps. */
export class PlayClock {
  private running = false;
  private lastAt = 0;
  private pending = 0;

  reset(now: number): void { this.running = false; this.lastAt = now; this.pending = 0; }

  setRunning(running: boolean, now: number): void {
    this.accumulate(now);
    this.running = running;
  }

  consume(now: number): number {
    this.accumulate(now);
    const elapsed = this.pending;
    this.pending = 0;
    return elapsed;
  }

  private accumulate(now: number): void {
    if (this.running) this.pending += Math.max(0, now - this.lastAt);
    this.lastAt = now;
  }
}
