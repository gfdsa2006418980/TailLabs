import Phaser from 'phaser';
import { dayNightAt, SKY_STOPS } from './DayNight';
import { RUNNER } from './RunnerModel';
import { sceneryOffset, worldCoordinateForScreenAtScale, worldViewportLeft, worldViewportRight, worldVisualScale } from './RunnerDeformation';

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
const BUSHES_TILE_TOP = -100;
const BUSHES_TILE_BOTTOM = 700;
const BUSHES_TILE_WIDTH = 390;
const BUSHES_TILE_HEIGHT = BUSHES_TILE_BOTTOM - BUSHES_TILE_TOP;
/** Gradients, scenery, stars and glow textures are baked once. The running
 * cycle only blends/tints cached images and moves two celestial sprites. */
export class RunnerSky {
  private skyA: Phaser.GameObjects.Image;
  private skyB: Phaser.GameObjects.Image;
  private sun: Phaser.GameObjects.Image;
  private moon: Phaser.GameObjects.Image;
  private stars!: Phaser.GameObjects.Image;
  private houses: Phaser.GameObjects.TileSprite;
  private bushes: Phaser.GameObjects.TileSprite;
  private fence: Phaser.GameObjects.TileSprite;
  private road: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Image[];
  private width = 0;
  private worldWidth = 0;
  private worldLeft = 0;
  private worldTop = 0;
  private worldBottom: number = RUNNER.height;
  private generation = 0;
  private skyIndex = -1;
  builds = 0;
  label = '白天';

  constructor(private readonly scene: Phaser.Scene, private readonly world: Phaser.GameObjects.Container) {
    this.makeSharedTextures();
    this.skyA = this.addWorld(scene.add.image(0, 0, 'tl002-sky-0').setOrigin(0).setDepth(-10));
    this.skyB = this.addWorld(scene.add.image(0, 0, 'tl002-sky-1').setOrigin(0).setDepth(-9));
    this.sun = this.addWorld(scene.add.image(0, 0, 'tl002-sun').setDepth(-8));
    this.moon = this.addWorld(scene.add.image(0, 0, 'tl002-moon').setDepth(-8));
    this.clouds = Array.from({ length: 3 }, () => this.addWorld(scene.add.image(0, 0, 'tl002-cloud').setDepth(-7)));
    this.houses = this.addWorld(scene.add.tileSprite(0, 150, 960, 260, 'tl002-houses').setOrigin(0).setDepth(-4));
    this.bushes = this.addWorld(scene.add.tileSprite(0, BUSHES_TILE_TOP, 960, BUSHES_TILE_HEIGHT, 'tl002-bushes').setOrigin(0).setDepth(-3));
    this.fence = this.addWorld(scene.add.tileSprite(0, 350, 960, 60, 'tl002-fence').setOrigin(0).setDepth(-2));
    this.road = this.addWorld(scene.add.tileSprite(0, RUNNER.groundY, 960, 500, 'tl002-road').setOrigin(0).setDepth(-1));
    // The caller resizes scenery to the logical canvas width without scaling
    // the camera, preserving the proportions of all world art.
    this.resize(RUNNER.worldWidth, RUNNER.worldWidth);
  }

  private addWorld<T extends Phaser.GameObjects.GameObject>(item: T): T {
    this.world.add(item);
    return item;
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
    if (!scene.textures.exists('tl002-houses')) {
      for (let index = 0; index < 2; index++) {
        const x = 13 + index * 207, bodyY = (index ? 221 : 242) - 150;
        const bodyColor = index ? 0xd8d6ba : 0xe2cfad;
        const roofColor = index ? 0xc2c8ae : 0xd4b598;
        g.fillStyle(bodyColor).fillRoundedRect(x, bodyY, 145, 145, 8);
        g.fillStyle(roofColor).fillTriangle(x - 13, bodyY + 5, x + 72, bodyY - 62, x + 158, bodyY + 5);
        g.fillStyle(0xf7efdc).fillRoundedRect(x + 27, bodyY + 26, 30, 38, 4)
          .fillRoundedRect(x + 86, bodyY + 26, 30, 38, 4);
      }
      g.generateTexture('tl002-houses', 414, 260); g.clear();
    }
    if (!scene.textures.exists('tl002-bushes')) {
      // Restore the original overlapping-circle hedge. Repeat a full 390px
      // pattern so the edge joins cleanly, and carry its base below the road.
      g.fillStyle(0xb6c4a1);
      const radii = [48, 58, 53];
      for (let x = -30, index = 0; x < BUSHES_TILE_WIDTH + 100; x += 65, index++) {
        g.fillCircle(x, 360 - BUSHES_TILE_TOP, radii[index % radii.length]);
      }
      g.fillStyle(0x91aa85).fillRect(
        0,
        368 - BUSHES_TILE_TOP,
        BUSHES_TILE_WIDTH,
        BUSHES_TILE_HEIGHT - (368 - BUSHES_TILE_TOP),
      );
      g.generateTexture('tl002-bushes', BUSHES_TILE_WIDTH, BUSHES_TILE_HEIGHT); g.clear();
    }
    if (!scene.textures.exists('tl002-road')) {
      g.fillStyle(0xf1e2be).fillRect(0, 0, 127, 500);
      g.fillStyle(0x8da77b).fillRect(0, 0, 127, 4);
      g.fillStyle(0xd6bb8e).fillRect(0, 5, 127, 3);
      g.fillStyle(0xcfba96);
      for (let y = 34, row = 0; y < 500; y += 104, row++) {
        g.fillRoundedRect(row % 2 ? 17 : 8, y, row % 2 ? 19 : 24, 3, 2)
          .fillRoundedRect(row % 2 ? 79 : 70, y + 52, row % 2 ? 13 : 14, 3, 2);
      }
      g.generateTexture('tl002-road', 127, 500); g.clear();
    }
    g.destroy();
  }

  resize(width: number, worldWidth = width): void {
    if (width === this.width && worldWidth === this.worldWidth) return;
    this.width = width; this.worldWidth = worldWidth; this.builds++;
    const minScale = worldVisualScale(5), padding = 100;
    const worldLeft = worldViewportLeft(0, minScale, RUNNER.playerX) - padding;
    const worldTop = worldViewportLeft(0, minScale, RUNNER.groundY) - padding;
    const worldBottom = worldViewportRight(RUNNER.height, minScale, RUNNER.groundY) + padding;
    this.worldLeft = worldLeft; this.worldTop = worldTop; this.worldBottom = worldBottom;
    const worldSpan = worldWidth - worldLeft + padding, worldHeight = worldBottom - worldTop;
    this.skyA.setPosition(worldLeft, worldTop).setDisplaySize(worldSpan, worldHeight);
    this.skyB.setPosition(worldLeft, worldTop).setDisplaySize(worldSpan, worldHeight);
    this.houses.setPosition(worldLeft, 150).setSize(worldSpan, 260);
    this.bushes.setPosition(worldLeft, BUSHES_TILE_TOP).setSize(worldSpan, BUSHES_TILE_HEIGHT);
    this.fence.setPosition(worldLeft, 350).setSize(worldSpan, 60);
    this.road.setPosition(worldLeft, RUNNER.groundY).setSize(worldSpan, worldBottom - RUNNER.groundY);
    const oldGeneration = this.generation++;
    // Stable pseudo-random stars; no random calls or drawing during the run.
    const g = this.scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xe2ecff);
    const starHeight = 270 - worldTop;
    for (let i = 0; i < 72; i++) {
      const x = ((i * 137.508) % 997) / 997 * worldSpan;
      const y = 18 + ((i * 73.13) % (starHeight - 36));
      if (i % 9 === 0) { g.fillRect(x - 3, y, 7, 1).fillRect(x, y - 3, 1, 7); }
      else g.fillCircle(x, y, i % 4 === 0 ? 1.5 : 0.8);
    }
    const starsKey = `tl002-stars-${this.generation}`;
    g.generateTexture(starsKey, worldSpan, starHeight); g.destroy();
    if (this.stars) this.stars.setTexture(starsKey).setPosition(worldLeft, worldTop).setOrigin(0);
    else this.stars = this.addWorld(this.scene.add.image(worldLeft, worldTop, starsKey).setOrigin(0).setDepth(-8.5));
    // Container children render in insertion order, regardless of their depth.
    // Keep stars behind houses, then layer bushes, fence and road in front.
    this.world.moveBelow(this.houses as Phaser.GameObjects.GameObject, this.bushes as Phaser.GameObjects.GameObject);
    this.world.moveBelow(this.bushes as Phaser.GameObjects.GameObject, this.fence as Phaser.GameObjects.GameObject);
    this.world.moveBelow(this.stars as Phaser.GameObjects.GameObject, this.houses as Phaser.GameObjects.GameObject);
    if (oldGeneration) {
      this.scene.textures.remove(`tl002-stars-${oldGeneration}`);
    }
  }

  update(seconds: number, travel: number, worldScale = 1): void {
    const mood = dayNightAt(seconds);
    this.label = mood.label;
    if (mood.index !== this.skyIndex) {
      this.skyIndex = mood.index;
      const worldSpan = this.worldWidth - this.worldLeft + 100, worldHeight = this.worldBottom - this.worldTop;
      this.skyA.setTexture(`tl002-sky-${mood.index}`).setPosition(this.worldLeft, this.worldTop).setDisplaySize(worldSpan, worldHeight);
      this.skyB.setTexture(`tl002-sky-${mood.index + 1}`).setPosition(this.worldLeft, this.worldTop).setDisplaySize(worldSpan, worldHeight);
    }
    this.skyB.setAlpha(mood.blend);
    this.houses.setTint(mood.tint); this.bushes.setTint(mood.tint);
    this.fence.setTint(mood.tint); this.road.setTint(mood.tint);
    this.stars.setAlpha(mood.stars * (0.94 + Math.sin(seconds * 0.7) * 0.06));
    // Celestial positions follow the same screen-space arc at every zoom:
    // invert the world scale around the runner/floor anchors before drawing.
    this.sun.setPosition(
      worldCoordinateForScreenAtScale(mood.sunX * this.width, RUNNER.playerX, worldScale),
      worldCoordinateForScreenAtScale(mood.sunY, RUNNER.groundY, worldScale),
    ).setAlpha(mood.sunAlpha);
    this.moon.setPosition(
      worldCoordinateForScreenAtScale(mood.moonX * this.width, RUNNER.playerX, worldScale),
      worldCoordinateForScreenAtScale(mood.moonY, RUNNER.groundY, worldScale),
    ).setAlpha(mood.moonAlpha);
    this.houses.tilePositionX = sceneryOffset(travel, 'houses');
    this.bushes.tilePositionX = sceneryOffset(travel, 'bushes');
    this.fence.tilePositionX = sceneryOffset(travel, 'fence');
    this.road.tilePositionX = sceneryOffset(travel, 'road');
    for (let i = 0; i < this.clouds.length; i++) {
      const x = ((i * 300 + 140 - travel * 0.06) % (this.worldWidth + 200) + this.worldWidth + 200) % (this.worldWidth + 200) - 100;
      this.clouds[i].setPosition(x, 83 + i % 2 * 46).setAlpha(0.65 - mood.stars * 0.53);
    }
  }
}
