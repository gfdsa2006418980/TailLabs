import Phaser from 'phaser';
import { dayNightAt, SKY_STOPS } from './DayNight';
import { RUNNER } from './RunnerModel';

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
/** Gradients, scenery, stars and glow textures are baked once. The running
 * cycle only blends/tints cached images and moves two celestial sprites. */
export class RunnerSky {
  private skyA: Phaser.GameObjects.Image;
  private skyB: Phaser.GameObjects.Image;
  private sun: Phaser.GameObjects.Image;
  private moon: Phaser.GameObjects.Image;
  private stars!: Phaser.GameObjects.Image;
  private scenery!: Phaser.GameObjects.Image;
  private fence: Phaser.GameObjects.TileSprite;
  private road: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Image[];
  private width = 0;
  private generation = 0;
  private skyIndex = -1;
  builds = 0;
  label = '白天';

  constructor(private readonly scene: Phaser.Scene) {
    this.makeSharedTextures();
    this.skyA = scene.add.image(0, 0, 'tl002-sky-0').setOrigin(0).setDepth(-10);
    this.skyB = scene.add.image(0, 0, 'tl002-sky-1').setOrigin(0).setDepth(-9);
    this.sun = scene.add.image(0, 0, 'tl002-sun').setDepth(-8);
    this.moon = scene.add.image(0, 0, 'tl002-moon').setDepth(-8);
    this.clouds = Array.from({ length: 3 }, () => scene.add.image(0, 0, 'tl002-cloud').setDepth(-7));
    this.fence = scene.add.tileSprite(0, 350, 960, 60, 'tl002-fence').setOrigin(0).setDepth(-2);
    this.road = scene.add.tileSprite(0, 410, 960, 130, 'tl002-road').setOrigin(0).setDepth(-1);
    // The caller resizes scenery to the logical canvas width without scaling
    // the camera, preserving the proportions of all world art.
    this.resize(RUNNER.worldWidth);
  }

  private makeSharedTextures(): void {
    const scene = this.scene;
    for (let i = 0; i < SKY_STOPS.length; i++) {
      const key = `tl002-sky-${i}`;
      if (scene.textures.exists(key)) continue;
      const texture = scene.textures.createCanvas(key, 4, 540)!;
      const context = texture.getContext(), gradient = context.createLinearGradient(0, 0, 0, 440);
      gradient.addColorStop(0, hex(SKY_STOPS[i].top)); gradient.addColorStop(1, hex(SKY_STOPS[i].bottom));
      context.fillStyle = gradient; context.fillRect(0, 0, 4, 540); texture.refresh();
    }
    for (const [key, color, moon] of [['tl002-sun', '#ffcc70', false], ['tl002-moon', '#f5f3d2', true]] as const) {
      if (scene.textures.exists(key)) continue;
      const texture = scene.textures.createCanvas(key, 160, 160)!, context = texture.getContext();
      const glow = context.createRadialGradient(80, 80, 21, 80, 80, 79);
      glow.addColorStop(0, moon ? '#f5f3d244' : '#ffc96988'); glow.addColorStop(1, '#ffffff00');
      context.fillStyle = glow; context.fillRect(0, 0, 160, 160);
      context.fillStyle = color; context.beginPath(); context.arc(80, 80, moon ? 27 : 32, 0, Math.PI * 2); context.fill();
      if (moon) {
        context.fillStyle = '#cecfa733';
        for (const [x, y, r] of [[70, 72, 7], [89, 90, 5], [91, 65, 4]]) {
          context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill();
        }
      }
      texture.refresh();
    }
    const g = scene.make.graphics({ x: 0, y: 0 });
    if (!scene.textures.exists('tl002-cloud')) {
      g.fillStyle(0xffffff).fillRoundedRect(2, 26, 118, 22, 12).fillCircle(42, 26, 22).fillCircle(76, 29, 17);
      g.generateTexture('tl002-cloud', 128, 64); g.clear();
    }
    if (!scene.textures.exists('tl002-fence')) {
      g.fillStyle(0xd4d5b4).fillRoundedRect(12, 0, 12, 60, 5);
      g.fillStyle(0xe4dfbf).fillRect(0, 20, 90, 6).fillRect(0, 41, 90, 6);
      g.generateTexture('tl002-fence', 90, 60); g.clear();
    }
    if (!scene.textures.exists('tl002-road')) {
      g.fillStyle(0xf1e2be).fillRect(0, 0, 127, 130);
      g.fillStyle(0x8da77b).fillRect(0, 0, 127, 4);
      g.fillStyle(0xd6bb8e).fillRect(0, 5, 127, 3);
      g.fillStyle(0xcfba96).fillRoundedRect(8, 34, 24, 3, 2).fillRoundedRect(70, 82, 14, 3, 2);
      g.generateTexture('tl002-road', 127, 130);
    }
    g.destroy();
  }

  resize(width: number): void {
    if (width === this.width) return;
    this.width = width; this.builds++;
    this.skyA.setDisplaySize(width, 540); this.skyB.setDisplaySize(width, 540);
    this.fence.setSize(width, 60); this.road.setSize(width, 130);
    const g = this.scene.make.graphics({ x: 0, y: 0 });
    for (let x = -60, i = 0; x < width + 160; x += 207, i++) {
      const y = i % 2 ? 242 : 221;
      g.fillStyle(i % 2 ? 0xd8d6ba : 0xe2cfad).fillRoundedRect(x, y, 145, 145, 8);
      g.fillStyle(i % 2 ? 0xc2c8ae : 0xd4b598).fillTriangle(x - 13, y + 5, x + 72, y - 62, x + 158, y + 5);
      g.fillStyle(0xf7efdc).fillRoundedRect(x + 27, y + 26, 30, 38, 4).fillRoundedRect(x + 86, y + 26, 30, 38, 4);
    }
    g.fillStyle(0xb6c4a1);
    for (let x = -30; x < width + 100; x += 65) g.fillCircle(x, 360, 48 + (x % 3) * 5);
    g.fillStyle(0x91aa85).fillRect(0, 368, width, 42);
    const oldGeneration = this.generation++;
    const key = `tl002-scenery-${this.generation}`;
    g.generateTexture(key, width, 540); g.clear();
    if (this.scenery) this.scenery.setTexture(key); else this.scenery = this.scene.add.image(0, 0, key).setOrigin(0).setDepth(-3);
    // Stable pseudo-random stars; no random calls or drawing during the run.
    g.fillStyle(0xe2ecff);
    for (let i = 0; i < 72; i++) {
      const x = ((i * 137.508) % 997) / 997 * width;
      const y = 18 + ((i * 73.13) % 225);
      if (i % 9 === 0) { g.fillRect(x - 3, y, 7, 1).fillRect(x, y - 3, 1, 7); }
      else g.fillCircle(x, y, i % 4 === 0 ? 1.5 : 0.8);
    }
    const starsKey = `tl002-stars-${this.generation}`;
    g.generateTexture(starsKey, width, 270); g.destroy();
    if (this.stars) this.stars.setTexture(starsKey); else this.stars = this.scene.add.image(0, 0, starsKey).setOrigin(0).setDepth(-8.5);
    if (oldGeneration) {
      this.scene.textures.remove(`tl002-scenery-${oldGeneration}`);
      this.scene.textures.remove(`tl002-stars-${oldGeneration}`);
    }
  }

  update(seconds: number, travel: number): void {
    const mood = dayNightAt(seconds);
    this.label = mood.label;
    if (mood.index !== this.skyIndex) {
      this.skyIndex = mood.index;
      this.skyA.setTexture(`tl002-sky-${mood.index}`).setDisplaySize(this.width, 540);
      this.skyB.setTexture(`tl002-sky-${mood.index + 1}`).setDisplaySize(this.width, 540);
    }
    this.skyB.setAlpha(mood.blend);
    this.scenery.setTint(mood.tint); this.fence.setTint(mood.tint); this.road.setTint(mood.tint);
    this.stars.setAlpha(mood.stars * (0.94 + Math.sin(seconds * 0.7) * 0.06));
    this.sun.setPosition(mood.sunX * this.width, mood.sunY).setAlpha(mood.sunAlpha);
    this.moon.setPosition(mood.moonX * this.width, mood.moonY).setAlpha(mood.moonAlpha);
    this.fence.tilePositionX = travel * 0.16; this.road.tilePositionX = travel;
    for (let i = 0; i < this.clouds.length; i++) {
      const x = ((i * 300 + 140 - travel * 0.06) % (this.width + 200) + this.width + 200) % (this.width + 200) - 100;
      this.clouds[i].setPosition(x, 83 + i % 2 * 46).setAlpha(0.65 - mood.stars * 0.53);
    }
  }
}
