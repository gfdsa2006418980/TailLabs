/**
 * New-player guide (2026-10-23 feedback: "不太知道怎麼玩").
 * - Story: radio-telegraph lines typed out on first open (replayable from the deploy screen) and once
 *   when the line falls for the first time.
 * - Coach: one step at a time during the first runs. A step dims the screen, leaves a hole over the
 *   control it talks about, and holds the battle until the player acknowledges it or uses that control.
 */
import './tutorial.css';

export const INTRO_LINES = [
  '喪屍如潮水般湧來……',
  '人類的防線不斷後退。',
  '而你，身為最前線的指揮官，',
  '必須率領部隊，守住這道防線。',
  '如果守不住——',
  '就放棄這裡，撤往下一座城市。',
  '我們還能後退。',
  '但能退多久，',
  '就只能靠你的指揮。',
] as const;
export const FALLEN_LINES = [
  '防線崩潰了。',
  '來不及撤離的人，',
  '最終也成了它們的一員。',
  '人類被迫再次後退，',
  '撤往下一座城市。',
  '趁屍潮尚未追上來，',
  '趕緊加固新的防線。',
  '它們很快就會再次出現……',
] as const;

/** The story overlay's markup; `playStory` fills the lines. */
export function storyScreen(kicker: string, done: string) {
  return `<div class="screen story-screen" id="story">
    <div class="story-head"><span class="story-dot"></span><small id="modal-title">${kicker}</small></div>
    <div class="story-lines" id="story-lines" aria-live="polite"></div>
    <div class="story-actions">
      <button id="story-skip" class="story-skip" type="button">略過 ▸▸</button>
      <button id="story-done" class="primary go" type="button" hidden>${done} <span>▶</span></button>
    </div>
  </div>`;
}

/**
 * Types the lines like a telegraph: one character at a time, a pause between lines. A tap on the screen
 * finishes the current line; 略過 shows everything. Returns a cancel function.
 */
export function playStory(root: HTMLElement, lines: readonly string[], opts: { reduced: boolean; onTick?: () => void; onDone: () => void }) {
  const box = root.querySelector<HTMLElement>('#story-lines')!, skip = root.querySelector<HTMLButtonElement>('#story-skip')!;
  const done = root.querySelector<HTMLButtonElement>('#story-done')!;
  let line = 0, char = 0, timer: ReturnType<typeof setTimeout> | undefined, finished = false;
  const paragraphs = lines.map(() => { const p = document.createElement('p'); p.className = 'story-line'; box.appendChild(p); return p; });
  const finish = () => {
    if (finished) return; finished = true; clearTimeout(timer);
    paragraphs.forEach((p, i) => { p.textContent = lines[i]!; p.classList.add('shown'); p.classList.remove('typing'); });
    skip.hidden = true; done.hidden = false; done.focus();
  };
  const tick = () => {
    if (finished) return;
    const p = paragraphs[line]!, text = lines[line]!;
    p.classList.add('shown', 'typing');
    if (char < text.length) {
      p.textContent = text.slice(0, ++char);
      if (char % 2 === 1) opts.onTick?.();
      // Ellipses and commas hold a beat, like a hand on the key.
      timer = setTimeout(tick, /[…，。—]/.test(text[char - 1]!) ? 160 : 70);
      return;
    }
    p.classList.remove('typing'); line++; char = 0;
    if (line >= lines.length) { finish(); return; }
    timer = setTimeout(tick, 650);
  };
  // A tap completes the line being typed; the next one follows after its pause.
  root.addEventListener('click', event => {
    if (finished || (event.target as HTMLElement).closest('button')) return;
    const p = paragraphs[line]; if (!p) return;
    clearTimeout(timer); p.textContent = lines[line]!; p.classList.add('shown'); p.classList.remove('typing');
    line++; char = 0;
    if (line >= lines.length) finish(); else timer = setTimeout(tick, 250);
  });
  skip.onclick = finish;
  done.onclick = () => { clearTimeout(timer); opts.onDone(); };
  if (opts.reduced) finish(); else timer = setTimeout(tick, 400);
  return () => clearTimeout(timer);
}

export type CoachStep = 'shoot' | 'kill' | 'upgrade' | 'repair' | 'fortify' | 'skill' | 'choice' | 'boss';
export const COACH_STEPS: readonly CoachStep[] = ['shoot', 'kill', 'upgrade', 'repair', 'fortify', 'skill', 'choice', 'boss'];
interface Active { step: CoachStep; target?: HTMLElement; act: boolean }

/**
 * One coaching bubble at a time. `act` steps wait for the player to press the highlighted control
 * (the hole lets that tap through); the others close with 知道了. Finished steps are remembered.
 */
export class Coach {
  private done = new Set<CoachStep>();
  private active?: Active;
  private skipped = false;
  private root: HTMLElement;
  private blockers: HTMLElement[];
  private ring: HTMLElement; private bubble: HTMLElement;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, private key: string) {
    try {
      const saved = JSON.parse(storage?.getItem(key) ?? 'null');
      if (saved === 'skipped') this.skipped = true;
      else if (Array.isArray(saved)) for (const s of saved) if (COACH_STEPS.includes(s)) this.done.add(s);
    } catch { /* a broken flag just replays the guide */ }
    this.root = document.createElement('div'); this.root.className = 'coach'; this.root.hidden = true;
    this.blockers = [0, 1, 2, 3].map(() => { const b = document.createElement('div'); b.className = 'coach-block'; this.root.appendChild(b); return b; });
    this.ring = document.createElement('div'); this.ring.className = 'coach-ring'; this.root.appendChild(this.ring);
    this.bubble = document.createElement('div'); this.bubble.className = 'coach-bubble'; this.bubble.setAttribute('role', 'dialog'); this.bubble.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.bubble);
    document.body.appendChild(this.root);
  }
  /** Still has steps to teach. */
  get enabled() { return !this.skipped && this.done.size < COACH_STEPS.length; }
  /** The battle waits while a bubble is up. */
  get holding() { return !!this.active; }
  get current() { return this.active?.step; }
  has(step: CoachStep) { return this.skipped || this.done.has(step); }
  /** Shows a step unless it is done or another one is up. Returns whether it is now showing. */
  offer(step: CoachStep, html: string, opts: { target?: HTMLElement; act?: boolean } = {}) {
    if (!this.enabled || this.has(step) || this.active) return false;
    this.active = { step, target: opts.target, act: !!opts.act };
    this.bubble.innerHTML = `<p>${html}</p><div class="coach-actions"><button type="button" class="coach-skip">略過教學</button>${opts.act ? '' : '<button type="button" class="coach-ok">知道了</button>'}</div>`;
    this.bubble.querySelector<HTMLButtonElement>('.coach-skip')!.onclick = () => this.skipAll();
    const ok = this.bubble.querySelector<HTMLButtonElement>('.coach-ok');
    if (ok) ok.onclick = () => this.complete(step);
    this.root.hidden = false; this.root.classList.toggle('acting', !!opts.act); this.place();
    (ok ?? opts.target)?.focus({ preventScroll: true });
    return true;
  }
  /** Marks a step learnt (the player used the control, or acknowledged the bubble). */
  complete(step: CoachStep) {
    if (this.done.has(step)) return;
    this.done.add(step); this.save();
    if (this.active?.step === step) { this.active = undefined; this.root.hidden = true; }
  }
  skipAll() { this.skipped = true; this.active = undefined; this.root.hidden = true; this.save(); }
  /** Hides the bubble without finishing it (a dialog took over); it comes back when offered again. */
  dismiss() { if (this.active) { this.active = undefined; this.root.hidden = true; } }
  /** Keeps the hole and bubble on the target as the layout moves (camera, resize, HUD transitions). */
  place() {
    if (!this.active) return;
    const w = window.innerWidth, h = window.innerHeight, pad = 6;
    const r = this.active.target?.getBoundingClientRect();
    const hole = r && r.width > 0 ? { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad } : { l: w / 2, t: h / 2, r: w / 2, b: h / 2 };
    const [top, bottom, left, right] = this.blockers as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    Object.assign(top.style, { left: '0px', top: '0px', width: `${w}px`, height: `${Math.max(0, hole.t)}px` });
    Object.assign(bottom.style, { left: '0px', top: `${hole.b}px`, width: `${w}px`, height: `${Math.max(0, h - hole.b)}px` });
    Object.assign(left.style, { left: '0px', top: `${hole.t}px`, width: `${Math.max(0, hole.l)}px`, height: `${Math.max(0, hole.b - hole.t)}px` });
    Object.assign(right.style, { left: `${hole.r}px`, top: `${hole.t}px`, width: `${Math.max(0, w - hole.r)}px`, height: `${Math.max(0, hole.b - hole.t)}px` });
    this.ring.hidden = !r;
    if (r) Object.assign(this.ring.style, { left: `${hole.l}px`, top: `${hole.t}px`, width: `${hole.r - hole.l}px`, height: `${hole.b - hole.t}px` });
    // The bubble sits on the far side of the hole from the screen edge it is closest to.
    const below = !r || (hole.t + hole.b) / 2 < h * 0.45;
    const bh = this.bubble.offsetHeight;
    const y = !r ? (h - bh) / 2 : below ? Math.min(h - bh - 12, hole.b + 12) : Math.max(12, hole.t - bh - 12);
    this.bubble.style.top = `${y}px`;
  }
  private save() {
    try { this.storage?.setItem(this.key, JSON.stringify(this.skipped ? 'skipped' : [...this.done])); } catch { /* memory only */ }
  }
}
