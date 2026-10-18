interface Point { x: number; y: number; }
export interface RescueArea { safeLeft: number; safeRight: number; platformY: number; }
export interface RescueTarget {
  readonly id: number;
  readonly frozen: boolean;
  readonly grabbed: boolean;
  readonly body: { position: Point; velocity: Point; bounds: { min: Point; max: Point } };
  containsPoint(x: number, y: number, padding: number): boolean;
  grab(): void;
  moveTo(x: number, y: number): void;
  releaseFromRescue(): void;
}

/** Only loose pieces escaping the circle can be caught; a normal falling piece stays a drop target. */
export function canRescue(piece: RescueTarget, area: RescueArea): boolean {
  if (piece.frozen || piece.grabbed) return false;
  const { bounds, position, velocity } = piece.body;
  const margin = Math.max(12, Math.min(28, (area.safeRight - area.safeLeft) * 0.08));
  const left = position.x < area.safeLeft || (bounds.min.x < area.safeLeft + margin && velocity.x < -0.12);
  const right = position.x > area.safeRight || (bounds.max.x > area.safeRight - margin && velocity.x > 0.12);
  const below = bounds.min.y > area.platformY || (bounds.max.y > area.platformY + margin && velocity.y > 0.12);
  return left || right || below;
}

/** One pointer owns a catch from press to release, including touch and release outside the canvas. */
export class RescueSystem<T extends RescueTarget> {
  private held?: { piece: T; pointerId: number; offsetX: number; offsetY: number };
  get active(): T | undefined { return this.held?.piece; }
  get pointerId(): number | undefined { return this.held?.pointerId; }

  pick(pieces: Iterable<T>, x: number, y: number, area: RescueArea, padding: number): T | undefined {
    let selected: T | undefined;
    let bestDistance = Infinity;
    let exactHit = false;
    for (const piece of pieces) {
      if (!canRescue(piece, area) || !piece.containsPoint(x, y, padding)) continue;
      const exact = piece.containsPoint(x, y, 0);
      const distance = Math.hypot(piece.body.position.x - x, piece.body.position.y - y);
      if ((exact && !exactHit) || (exact === exactHit && distance <= bestDistance)) {
        selected = piece; bestDistance = distance; exactHit = exact;
      }
    }
    return selected;
  }

  begin(piece: T, pointerId: number, x: number, y: number): boolean {
    if (this.held || piece.frozen || piece.grabbed) return false;
    this.held = { piece, pointerId, offsetX: piece.body.position.x - x, offsetY: piece.body.position.y - y };
    piece.grab();
    return true;
  }

  move(pointerId: number, x: number, y: number): boolean {
    if (!this.held || pointerId !== this.held.pointerId) return false;
    this.held.piece.moveTo(x + this.held.offsetX, y + this.held.offsetY);
    return true;
  }

  release(pointerId: number): T | undefined {
    if (!this.held || pointerId !== this.held.pointerId) return;
    const piece = this.held.piece;
    this.held = undefined;
    piece.releaseFromRescue();
    return piece;
  }
}
