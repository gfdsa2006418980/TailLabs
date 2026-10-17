interface InertiaPart {
  inertia: number;
  mass: number;
  position: { x: number; y: number; };
}

/** Match Matter's 4x inertia convention while including each part's offset. */
export function compoundInertia(center: { x: number; y: number }, parts: readonly InertiaPart[]): number {
  return parts.reduce((sum, part) => {
    const dx = part.position.x - center.x;
    const dy = part.position.y - center.y;
    return sum + part.inertia + 4 * part.mass * (dx * dx + dy * dy);
  }, 0);
}
