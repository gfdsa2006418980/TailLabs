/**
 * Converts rendered frame time into a whole number of fixed physics steps.
 * `rate` is playback speed (0 = hit-stop, 0.4 = slow motion); it changes how
 * fast steps happen in real time, never what a step does.
 */
export class FixedStepper {
  private readonly stepMs: number;
  private readonly maxSteps: number;
  private accumulator = 0;

  constructor(stepMs: number, maxSteps: number) {
    this.stepMs = stepMs;
    this.maxSteps = maxSteps;
  }

  advance(frameMs: number, rate = 1): number {
    this.accumulator += Math.max(0, Math.min(frameMs, 250)) * Math.max(0, rate);
    let count = Math.floor(this.accumulator / this.stepMs);
    this.accumulator -= count * this.stepMs;
    if (count > this.maxSteps) {
      count = this.maxSteps;
      this.accumulator = 0;
    }
    return count;
  }

  reset(): void { this.accumulator = 0; }
}
