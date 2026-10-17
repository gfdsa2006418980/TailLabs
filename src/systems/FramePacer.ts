/** Preserve frame deadlines instead of discarding fractional refresh intervals. */
export class FramePacer {
  private nextAt?: number;
  private interval = 0;

  reset(): void { this.nextAt = undefined; }

  shouldRender(now: number, fps: number): boolean {
    const interval = 1000 / fps;
    if (interval !== this.interval || this.nextAt === undefined) {
      this.interval = interval; this.nextAt = now + interval;
      return true;
    }
    // RAF timestamps have rounding jitter, especially at 60 / 120 Hz.
    if (now + 0.25 < this.nextAt) return false;
    this.nextAt += Math.max(1, Math.floor((now - this.nextAt + 0.25) / interval) + 1) * interval;
    return true;
  }
}

interface PacedLoop {
  fpsLimit: number;
  step(time: number): void;
  stepLimitFPS(time: number): void;
  resetDelta(): void;
}

export function installFramePacer(loop: PacedLoop): void {
  const pacer = new FramePacer();
  const resetDelta = loop.resetDelta.bind(loop);
  loop.resetDelta = () => { pacer.reset(); resetDelta(); };
  loop.stepLimitFPS = (time) => {
    if (pacer.shouldRender(time, loop.fpsLimit)) loop.step(time);
  };
}
