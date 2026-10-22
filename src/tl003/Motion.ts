/**
 * Shared UI motion. One vocabulary for the whole game, named after motion-reference entries:
 *   pop      — ポップスケール: overshoot and settle (easeOutBack)
 *   rise     — フェード＋スライド: fade in while sliding up (easeOutCubic)
 *   countUp  — numbers roll to their value (easeOutExpo)
 * Every helper becomes instant when reduced motion is on.
 */
export const EASE = {
  out: 'cubic-bezier(.16, 1, .3, 1)',        // easeOutExpo-like: snap in, long settle
  pop: 'cubic-bezier(.34, 1.56, .64, 1)',    // easeOutBack: ~10% overshoot
  in: 'cubic-bezier(.5, 0, .75, 0)',         // easeInQuart: exits accelerate away
} as const;

let reduced = false;
export const setReducedMotion = (value: boolean) => { reduced = value; };
export const motionReduced = () => reduced;

export function pop(node: Element | null, scale = 1.18, duration = 180) {
  if (!node || reduced) return;
  node.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration, easing: EASE.pop });
}

/** Staggered entrance for a list of elements (cascade / 段差追従). */
export function rise(nodes: Iterable<Element>, { delay = 0, step = 60, distance = 16, duration = 360 } = {}) {
  if (reduced) return;
  let i = 0;
  for (const node of nodes) {
    node.animate([{ opacity: 0, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'none' }],
      { duration, delay: delay + step * i++, easing: EASE.out, fill: 'backwards' });
  }
}

/** Rolls a number from `from` to `to`; `format` renders each frame. Resolves when done. */
export function countUp(node: Element, from: number, to: number, { duration = 700, delay = 0, format = (v: number) => Math.round(v).toString(), onTick }: { duration?: number; delay?: number; format?: (v: number) => string; onTick?: () => void } = {}) {
  return new Promise<void>(resolve => {
    if (reduced || duration <= 0) { node.textContent = format(to); resolve(); return; }
    node.textContent = format(from);
    const start = performance.now() + delay; let last = '';
    const frame = (now: number) => {
      if (!node.isConnected) { resolve(); return; }
      const t = Math.min(1, Math.max(0, (now - start) / duration)), k = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      const text = format(from + (to - from) * k);
      if (text !== last) { node.textContent = text; last = text; if (t > 0) onTick?.(); }
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, reduced ? 0 : ms));
