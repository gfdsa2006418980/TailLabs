import type Phaser from 'phaser';
import { SLING, WORLD } from '../config/Tuning.ts';

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
export type CameraMode = 'tower' | 'aim' | 'follow' | 'watch';

const BOTTOM = WORLD.groundY + 130;

/**
 * Frames the sling, the flying serpentela or the tower. Always eases toward its target;
 * effects such as shake run on top and never touch the simulation.
 */
export class CameraRig {
  mode: CameraMode = 'tower';
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private tower: Rect;
  private focus: { x: number; y: number } = { x: SLING.x, y: SLING.y };
  private zoom = 0.5;
  private centerX = 0;
  private centerY = 0;
  private initialised = false;

  constructor(camera: Phaser.Cameras.Scene2D.Camera, tower: Rect) {
    this.camera = camera;
    this.tower = tower;
  }

  setTower(tower: Rect): void { this.tower = tower; }

  setFocus(x: number, y: number): void { this.focus = { x, y }; }

  /** Zoom that fits a rectangle, keeping the ground line near the bottom of the screen. */
  private fit(rect: Rect): { zoom: number; x: number; y: number } {
    const view = { w: this.camera.width, h: this.camera.height };
    const zoom = Math.max(0.3, Math.min(1.1, view.w / (rect.maxX - rect.minX), view.h / (rect.maxY - rect.minY)));
    const halfH = view.h / zoom / 2;
    return { zoom, x: (rect.minX + rect.maxX) / 2, y: Math.min((rect.minY + rect.maxY) / 2, BOTTOM - halfH) };
  }

  aimZoom(): number { return this.fit(this.aimRect()).zoom; }

  private aimRect(): Rect {
    // Left edge keeps the waiting serpentelas behind the sling in view.
    return { minX: SLING.x - 470, maxX: this.tower.maxX + 200, minY: Math.min(this.tower.minY - 240, SLING.y - 420), maxY: BOTTOM };
  }

  private target(): { zoom: number; x: number; y: number } {
    if (this.mode === 'aim') return this.fit(this.aimRect());
    if (this.mode === 'tower') {
      return this.fit({ minX: this.tower.minX - 420, maxX: this.tower.maxX + 420, minY: this.tower.minY - 260, maxY: BOTTOM });
    }
    if (this.mode === 'watch') {
      return this.fit({
        minX: Math.min(this.tower.minX, this.focus.x) - 360, maxX: Math.max(this.tower.maxX, this.focus.x) + 300,
        minY: Math.min(this.tower.minY, this.focus.y) - 260, maxY: BOTTOM,
      });
    }
    const zoom = Math.min(1, this.aimZoom() * 1.2);
    const halfH = this.camera.height / zoom / 2;
    return { zoom, x: this.focus.x + 160, y: Math.min(this.focus.y + 60, BOTTOM - halfH) };
  }

  update(deltaMs: number): void {
    const goal = this.target();
    if (!this.initialised) {
      this.zoom = goal.zoom; this.centerX = goal.x; this.centerY = goal.y; this.initialised = true;
    } else {
      const rate = this.mode === 'follow' ? 7 : 3.2;
      const k = 1 - Math.exp(-rate * deltaMs / 1000);
      this.zoom += (goal.zoom - this.zoom) * k;
      this.centerX += (goal.x - this.centerX) * k;
      this.centerY += (goal.y - this.centerY) * k;
    }
    this.camera.setZoom(this.zoom);
    this.camera.centerOn(this.centerX, this.centerY);
  }

  /** True once the camera has nearly reached the aim framing (sling input is enabled then). */
  get settledOnAim(): boolean {
    if (this.mode !== 'aim') return false;
    const goal = this.target();
    return Math.abs(goal.zoom - this.zoom) < 0.02 && Math.abs(goal.x - this.centerX) < 40;
  }
}
