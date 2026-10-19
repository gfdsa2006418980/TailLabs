import { THEME, themeCss, serpentelaArtFile } from '../game/Theme';
import { SERPENTELAS } from '../data/serpentelas';
import { SerpentelaPicker } from '../systems/SerpentelaPicker';

const ICON_SIZE = 60;

/** Draws the remaining weighted serpentelas at result-art size, without adding physics bodies. */
export class FailureBackdrop {
  private readonly canvas = document.createElement('canvas');
  private readonly stylesheet = document.createElement('style');
  private readonly rule: CSSStyleRule;
  private readonly picker = new SerpentelaPicker(SERPENTELAS);
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly imagesReady: Promise<void>;
  private selected: typeof SERPENTELAS[number][] = [];
  private count = 0;
  private revision = 0;
  private frame = 0;
  private readonly resize = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => { if (this.count) this.paint(); });
  };

  constructor(private readonly dialog: HTMLDialogElement) {
    document.head.append(this.stylesheet);
    this.stylesheet.sheet!.insertRule('#result-dialog.is-failed::backdrop {}');
    this.rule = this.stylesheet.sheet!.cssRules[0] as CSSStyleRule;
    for (const definition of SERPENTELAS) {
      const image = new Image();
      image.src = `${import.meta.env.BASE_URL}assets/serpentelas/${serpentelaArtFile(definition.file)}`;
      this.images.set(definition.id, image);
    }
    this.imagesReady = Promise.all([...this.images.values()].map((image) => image.decode().catch(() => {}))).then(() => {});
    window.addEventListener('resize', this.resize);
  }

  show(count: number): void {
    this.count = Math.max(0, Math.floor(count));
    this.picker.reset();
    this.selected = Array.from({ length: this.count }, () => this.picker.next());
    const revision = ++this.revision;
    this.dialog.classList.add('is-failed');
    this.dialog.dataset.remainingSerpentelas = String(this.count);
    void this.imagesReady.then(() => { if (this.revision === revision) this.paint(); });
  }

  private paint(): void {
    if (!this.count) return;
    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.ceil(width * ratio);
    this.canvas.height = Math.ceil(height * ratio);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = themeCss(THEME.glow);
    ctx.fillRect(0, 0, width, height);

    const columns = Math.max(1, Math.ceil(Math.sqrt(this.count * width / height)));
    const rows = Math.ceil(this.count / columns);
    for (let index = 0; index < this.selected.length; index++) {
      const definition = this.selected[index];
      const image = this.images.get(definition.id);
      if (!image?.naturalWidth) continue;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = columns === 1 ? width / 2 : 30 + (width - ICON_SIZE) * column / (columns - 1);
      const y = rows === 1 ? height / 2 : 30 + (height - ICON_SIZE) * row / (rows - 1);
      ctx.drawImage(image, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
    }
    this.rule.style.backgroundImage = `url("${this.canvas.toDataURL('image/png')}")`;
  }

  clear(): void {
    this.count = 0;
    this.selected = [];
    this.revision++;
    cancelAnimationFrame(this.frame);
    this.dialog.classList.remove('is-failed');
    delete this.dialog.dataset.remainingSerpentelas;
    this.rule.style.backgroundImage = 'none';
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  destroy(): void {
    this.clear();
    window.removeEventListener('resize', this.resize);
    this.stylesheet.remove();
    this.images.forEach((image) => { image.src = ''; });
    this.images.clear();
  }
}
