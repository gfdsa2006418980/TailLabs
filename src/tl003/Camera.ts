/**
 * Presentation camera for the battlefield: trauma shake, zoom punches, hit-stop, slow motion and
 * the boss entrance. Driven by real (wall-clock) seconds so it keeps moving while game time is
 * frozen or slowed. Output is in battlefield buffer pixels; the compositor applies it.
 */
export interface CameraView {
  /** Centre offset in buffer pixels (positive = view moves right / down). */
  x: number; y: number;
  zoom: number; angle: number;
  /** 0..1 cinematic bars. */
  letterbox: number;
  /** Multiplier for game time: 0 during hit-stop. */
  timeScale: number;
  /** 0..1 red edge pulse when the barricade is hit. */
  hurt: number;
  /** 0..1 white flash for huge impacts. */
  flash: number;
}

/** Base zoom keeps a margin outside the view so shakes never reveal the buffer edge. */
export const BASE_ZOOM = 1.04;
const MAX_SHAKE = 5, MAX_ANGLE = 0.012, TRAUMA_DECAY = 1.5;
const PUNCH_IN = 0.08, PUNCH_OUT = 0.25;
/** Boss entrance timeline in real seconds. */
const INTRO = { pan: 0.5, hold: 1.0, back: 0.45 } as const;

const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Smooth 1D value noise in -1..1, so shakes wander instead of buzzing. */
function noise(t: number, seed: number) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  const h = (n: number) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  return h(i) + (h(i + 1) - h(i)) * u;
}

export class Camera {
  reducedMotion = false;
  private time = 0;
  private trauma = 0;
  private punchAmount = 0; private punchAge = 1;
  private hitstop = 0;
  private slowScale = 1; private slowLeft = 0;
  private hurtLevel = 0; private flashLevel = 0;
  private aim = { x: 0, y: 0 }; private aimTarget?: { x: number; y: number }; private aimZoom = 0;
  private intro?: { age: number; x: number; y: number; done?: () => void };

  /** Adds shake; the visible amount is trauma², so small hits stay subtle. */
  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  /** A quick zoom-in that eases back out. */
  punch(amount: number) { if (amount >= this.currentPunch()) { this.punchAmount = amount; this.punchAge = 0; } }
  /** Freezes game time for a few milliseconds of impact. */
  freeze(seconds: number) { this.hitstop = Math.max(this.hitstop, seconds); }
  slowMotion(scale: number, seconds: number) { this.slowScale = Math.min(this.slowScale < 1 && this.slowLeft > 0 ? this.slowScale : 1, scale); this.slowLeft = Math.max(this.slowLeft, seconds); }
  hurt(amount: number) { this.hurtLevel = Math.min(1, Math.max(this.hurtLevel, amount)); }
  flash(amount: number) { this.flashLevel = Math.min(1, Math.max(this.flashLevel, amount)); }
  /** Leans the view slightly towards an aimed point (buffer pixels from the centre), or back to rest. */
  lean(target: { x: number; y: number } | undefined) { this.aimTarget = target; }
  /** Pans up to the boss, holds in slow motion behind cinema bars, then returns with a heavy shake. */
  bossIntro(x: number, y: number, done?: () => void) { this.intro = { age: 0, x, y, done }; }
  get introActive() { return this.intro !== undefined; }
  /** Drops every effect, e.g. when a new run starts. */
  reset() {
    this.trauma = 0; this.punchAge = 1; this.hitstop = 0; this.slowLeft = 0; this.slowScale = 1;
    this.hurtLevel = 0; this.flashLevel = 0; this.aim = { x: 0, y: 0 }; this.aimTarget = undefined; this.aimZoom = 0; this.intro = undefined;
  }

  private currentPunch() {
    const a = this.punchAge;
    if (a >= PUNCH_IN + PUNCH_OUT) return 0;
    return this.punchAmount * (a < PUNCH_IN ? easeOutCubic(a / PUNCH_IN) : 1 - easeOutCubic((a - PUNCH_IN) / PUNCH_OUT));
  }

  /** Advances by real seconds and returns the view for this frame. `size` is the buffer size. */
  update(dt: number, size: { width: number; height: number }): CameraView {
    dt = Math.max(0, Math.min(0.1, dt));
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    this.punchAge += dt;
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.slowLeft = Math.max(0, this.slowLeft - dt); if (!this.slowLeft) this.slowScale = 1;
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 4);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 5);
    const motion = this.reducedMotion ? 0 : 1;

    // Lean towards the aim point: fast to follow, slower to settle back.
    const target = this.aimTarget ?? { x: 0, y: 0 }, k = 1 - Math.exp(-dt * (this.aimTarget ? 10 : 5));
    this.aim.x += (target.x * 0.08 - this.aim.x) * k; this.aim.y += (target.y * 0.08 - this.aim.y) * k;

    this.aimZoom += ((this.aimTarget ? 0.02 : 0) - this.aimZoom) * k;
    let x = this.aim.x, y = this.aim.y, zoom = BASE_ZOOM + this.aimZoom + this.currentPunch(), letterbox = 0;
    // Idle breathing: a slow sub-pixel drift so the scene never looks like a still image.
    x += Math.sin(this.time * 0.45) * 0.6; y += Math.sin(this.time * 0.33 + 1) * 0.5;

    if (this.intro) {
      const i = this.intro; i.age += dt;
      const { pan, hold, back } = INTRO, total = pan + hold + back;
      const w = i.age < pan ? easeInOut(i.age / pan) : i.age < pan + hold ? 1 : 1 - easeInOut((i.age - pan - hold) / back);
      x += (i.x - x) * w * 0.6 * motion; y += (i.y - y) * w * 0.6 * motion; zoom += 0.14 * w * motion;
      letterbox = Math.min(1, i.age / 0.25, (total - i.age) / 0.3);
      if (i.age > pan * 0.6 && i.age < pan + hold) this.slowMotion(0.3, 0.05);
      if (i.age >= total) { this.intro = undefined; this.shake(0.55); this.punch(0.05); i.done?.(); }
    }

    const power = this.trauma * this.trauma * motion;
    x += MAX_SHAKE * power * noise(this.time * 24, 1); y += MAX_SHAKE * power * noise(this.time * 24, 2);
    const angle = MAX_ANGLE * power * noise(this.time * 18, 3);

    // Keep the view inside the buffer (the shake may use the margin the base zoom leaves).
    const mx = size.width / 2 * (1 - 1 / zoom), my = size.height / 2 * (1 - 1 / zoom);
    x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
    if (!motion) { zoom = BASE_ZOOM; x = 0; y = 0; }

    const timeScale = this.hitstop > 0 ? 0 : this.slowScale;
    return { x, y, zoom, angle: motion ? angle : 0, letterbox, timeScale, hurt: this.hurtLevel, flash: this.flashLevel * motion };
  }
}
