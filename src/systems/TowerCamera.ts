/** Rise smoothly with the supported tower. Camera motion never changes world bodies. */
export class TowerCamera {
  offset = 0;
  private target = 0;
  get settled(): boolean { return this.offset === this.target; }
  update(highestSupportedY: number | undefined, deltaMs: number, restingScreenY = 310): number {
    if (highestSupportedY !== undefined) this.target = Math.min(this.target, highestSupportedY - restingScreenY);
    const factor = 1 - Math.exp(-Math.min(deltaMs, 50) / 280);
    this.offset += (this.target - this.offset) * factor;
    if (Math.abs(this.target - this.offset) < 0.01) this.offset = this.target;
    return this.offset;
  }
  reset(): void { this.offset = 0; this.target = 0; }
}
