/** Draw ahead once. Promotion never rerolls the advertised next piece. */
export class DrawQueue<T> {
  current?: T;
  next?: T;
  remaining: number;
  private readonly draw: () => T;
  constructor(draw: () => T, count: number) {
    this.draw = draw;
    this.remaining = count;
    if (count > 0) this.current = draw();
    if (count > 1) this.next = draw();
  }
  consume(): T | undefined {
    const released = this.current;
    if (released === undefined) return;
    this.remaining--;
    this.current = this.next;
    this.next = this.remaining > 1 ? this.draw() : undefined;
    return released;
  }
}
