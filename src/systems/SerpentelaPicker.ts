interface WeightedDefinition { id: string; weight: number; }

/** The last two generated identities stay excluded; eligible weights are renormalized. */
export class SerpentelaPicker<T extends WeightedDefinition> {
  private readonly pool: readonly T[];
  private readonly random: () => number;
  private recent: string[] = [];

  constructor(pool: readonly T[], random: () => number = Math.random) {
    this.pool = pool;
    this.random = random;
  }

  next(): T {
    const eligible = this.pool.filter((item) => item.weight > 0 && !this.recent.includes(item.id));
    const total = eligible.reduce((sum, item) => sum + item.weight, 0);
    if (!eligible.length || total <= 0) throw new Error('No eligible serpentela remains');
    let cursor = this.random() * total;
    let selected = eligible[eligible.length - 1];
    for (const item of eligible) {
      cursor -= item.weight;
      if (cursor < 0) { selected = item; break; }
    }
    this.recent = [...this.recent, selected.id].slice(-2);
    return selected;
  }

  reset(): void { this.recent = []; }
}
