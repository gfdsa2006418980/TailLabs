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
  minImpactSpeed: 1.5,
  cooldownMs: 180,
  maxDisplacement: 2.5,
  spring: 320,
  damping: 24,
  influenceRadius: 27,
} as const;

/** Small local contact deformation. Positions remain continuous across new impacts. */
export class LocalElasticMesh {
  readonly nodes: ElasticNode[];
  readonly cells: number;
  private active = false;
  private lastImpactAt = -Infinity;

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
    const impulse = Math.min(speed * 6, 56);
    for (const node of this.nodes) {
      const dx = node.restX - x;
      const dy = node.restY - y;
      const distance2 = dx * dx + dy * dy;
      const weight = Math.exp(-distance2 / (2 * ELASTICITY.influenceRadius ** 2));
      const side = Math.max(-1, Math.min(1, (dx * tx + dy * ty) / ELASTICITY.influenceRadius));
      node.vx += (nx + tx * side * 0.35) * impulse * weight;
      node.vy += (ny + ty * side * 0.35) * impulse * weight;
    }
    this.lastImpactAt = now;
    this.active = true;
    return true;
  }

  update(deltaMs: number): boolean {
    if (!this.active) return false;
    let remaining = Math.min(deltaMs / 1000, 0.05);
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
    const resting = this.nodes.every((node) => Math.hypot(node.x - node.restX, node.y - node.restY) < 0.015 && Math.hypot(node.vx, node.vy) < 0.08);
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
