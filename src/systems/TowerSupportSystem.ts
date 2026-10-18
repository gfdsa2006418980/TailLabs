interface TowerPiece {
  readonly id: number;
  readonly frozen: boolean;
  readonly grabbed?: boolean;
  readonly bounds: { min: { y: number } };
}

/** Camera height comes from settled pieces connected to the floor, never the side walls. */
export class TowerSupportSystem {
  private readonly floors = new Set<number>();
  private readonly pieces = new Map<number, TowerPiece>();
  private readonly contacts = new Map<string, { a: number; b: number }>();
  private dirty = false;
  private highest?: number;

  addFloor(id: number): void { this.floors.add(id); }
  track(piece: TowerPiece): void { this.pieces.set(piece.id, piece); }
  onFreeze(id: number): void { if (this.pieces.has(id)) this.dirty = true; }

  beginContact(a: number, b: number, contactId: string): void {
    if ((!this.floors.has(a) && !this.pieces.has(a)) || (!this.floors.has(b) && !this.pieces.has(b))) return;
    if (this.pieces.get(a)?.grabbed || this.pieces.get(b)?.grabbed || this.contacts.has(contactId)) return;
    this.contacts.set(contactId, { a, b });
    if (this.settled(a) && this.settled(b)) this.dirty = true;
  }

  endContact(a: number, b: number, contactId: string): void {
    // Matter retires static/static pairs after both bodies freeze. Their support stays in place.
    if (this.settled(a) && this.settled(b)) return;
    this.contacts.delete(contactId);
  }

  detach(id: number): void {
    for (const [key, contact] of this.contacts) if (contact.a === id || contact.b === id) this.contacts.delete(key);
  }

  get top(): number | undefined {
    if (!this.dirty) return this.highest;
    this.dirty = false;
    const neighbors = new Map<number, number[]>();
    for (const { a, b } of this.contacts.values()) {
      if (!this.settled(a) || !this.settled(b)) continue;
      const fromA = neighbors.get(a) ?? []; fromA.push(b); neighbors.set(a, fromA);
      const fromB = neighbors.get(b) ?? []; fromB.push(a); neighbors.set(b, fromB);
    }
    const visited = new Set(this.floors);
    const pending = [...this.floors];
    this.highest = undefined;
    for (let index = 0; index < pending.length; index++) {
      const id = pending[index];
      const piece = this.pieces.get(id);
      if (piece && Number.isFinite(piece.bounds.min.y)) this.highest = Math.min(this.highest ?? Infinity, piece.bounds.min.y);
      for (const other of neighbors.get(id) ?? []) if (!visited.has(other)) { visited.add(other); pending.push(other); }
    }
    return this.highest;
  }

  clear(): void {
    this.pieces.clear(); this.contacts.clear(); this.highest = undefined; this.dirty = false;
  }

  private settled(id: number): boolean {
    const piece = this.pieces.get(id);
    return this.floors.has(id) || (!!piece?.frozen && !piece.grabbed);
  }
}
