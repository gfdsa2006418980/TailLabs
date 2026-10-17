export interface ElasticNode {
  readonly restX: number;
  readonly restY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const ELASTICITY = {
  cells: 6,
  minImpactSpeed: 0.75,
  cooldownMs: 240,
  maxDisplacement: 7,
  impulseMultiplier: 11,
  maxImpulse: 100,
  secondPulseDelayMs: 220,
  secondPulseMultiplier: 0.46,
  spring: 200,
  damping: 9,
  influenceRadius: 27,
} as const;

/** Small local contact deformation. Positions remain continuous across new impacts. */
export class LocalElasticMesh {
  readonly nodes: ElasticNode[];
  readonly cells: number;
  private active = false;
  private lastImpactAt = -Infinity;
  private readonly secondPulse: Float64Array;
  private hasSecondPulse = false;
  private secondPulseRemainingMs = 0;

  constructor(width: number, height: number, cells = ELASTICITY.cells) {
    this.cells = cells;
    this.nodes = [];
    for (let y = 0; y <= cells; y++) {
      for (let x = 0; x <= cells; x++) {
        const restX = x * width / cells;
        const restY = y * height / cells;
        this.nodes.push({ restX, restY, x: restX, y: restY, vx: 0, vy: 0 });
      }
    }
    this.secondPulse = new Float64Array(this.nodes.length * 2);
  }

  get isActive(): boolean { return this.active; }

  impact(x: number, y: number, normalX: number, normalY: number, speed: number, now: number): boolean {
    if (speed < ELASTICITY.minImpactSpeed || now - this.lastImpactAt < ELASTICITY.cooldownMs) return false;
    const length = Math.hypot(normalX, normalY);
    if (!length) return false;
    const nx = normalX / length;
    const ny = normalY / length;
    const tx = -ny;
    const ty = nx;
    const impulse = Math.min(speed * ELASTICITY.impulseMultiplier, ELASTICITY.maxImpulse);
    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];
      const dx = node.restX - x;
      const dy = node.restY - y;
      const distance2 = dx * dx + dy * dy;
      const weight = Math.exp(-distance2 / (2 * ELASTICITY.influenceRadius ** 2));
      const side = Math.max(-1, Math.min(1, (dx * tx + dy * ty) / ELASTICITY.influenceRadius));
      const impulseX = (nx + tx * side * 0.35) * impulse * weight;
      const impulseY = (ny + ty * side * 0.35) * impulse * weight;
      node.vx += impulseX;
      node.vy += impulseY;
      this.secondPulse[index * 2] = impulseX * ELASTICITY.secondPulseMultiplier;
      this.secondPulse[index * 2 + 1] = impulseY * ELASTICITY.secondPulseMultiplier;
    }
    this.hasSecondPulse = true;
    this.secondPulseRemainingMs = ELASTICITY.secondPulseDelayMs;
    this.lastImpactAt = now;
    this.active = true;
    return true;
  }

  update(deltaMs: number): boolean {
    if (!this.active) return false;
    const frameMs = Math.min(deltaMs, 50);
    if (this.hasSecondPulse) {
      this.secondPulseRemainingMs -= frameMs;
      if (this.secondPulseRemainingMs <= 0) {
        for (let index = 0; index < this.nodes.length; index++) {
          this.nodes[index].vx += this.secondPulse[index * 2];
          this.nodes[index].vy += this.secondPulse[index * 2 + 1];
        }
        this.hasSecondPulse = false;
        this.secondPulseRemainingMs = 0;
      }
    }
    let remaining = frameMs / 1000;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      for (const node of this.nodes) {
        node.vx += (-ELASTICITY.spring * (node.x - node.restX) - ELASTICITY.damping * node.vx) * dt;
        node.vy += (-ELASTICITY.spring * (node.y - node.restY) - ELASTICITY.damping * node.vy) * dt;
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        const dx = node.x - node.restX;
        const dy = node.y - node.restY;
        const length = Math.hypot(dx, dy);
        if (length > ELASTICITY.maxDisplacement) {
          node.x = node.restX + dx * ELASTICITY.maxDisplacement / length;
          node.y = node.restY + dy * ELASTICITY.maxDisplacement / length;
        }
      }
      remaining -= dt;
    }
    const resting = !this.hasSecondPulse && this.nodes.every((node) => Math.hypot(node.x - node.restX, node.y - node.restY) < 0.015 && Math.hypot(node.vx, node.vy) < 0.08);
    if (resting) {
      for (const node of this.nodes) {
        node.x = node.restX;
        node.y = node.restY;
        node.vx = 0;
        node.vy = 0;
      }
      this.active = false;
    }
    return true;
  }
}
