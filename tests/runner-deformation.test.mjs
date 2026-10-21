import test from 'node:test';
import assert from 'node:assert/strict';
import { deformationAt, runningMotion, sceneryOffset, worldCoordinateAtScale, worldCoordinateForScreenAtScale, worldVisualScale, worldViewportLeft, worldViewportRight } from '../src/tl002/RunnerDeformation.ts';

test('TL002 takeoff and landing squash/stretch are visible and settle smoothly', () => {
  for (const [kind, duration] of [['jump', 0.24], ['land', 0.3]]) {
    const [squashX, squashY] = deformationAt(kind, 0);
    const [stretchX, stretchY] = deformationAt(kind, duration * 0.3);
    assert.ok(squashX >= 1.2 && squashY <= 0.8, `${kind} starts with a clear squash`);
    assert.ok(stretchX < 0.9 && stretchY > 1.15, `${kind} rebounds into a clear stretch`);
    assert.deepEqual(deformationAt(kind, duration), [1, 1]);
  }
});

test('TL002 double jump triggers a stronger squash/stretch pulse of its own', () => {
  const [firstX, firstY] = deformationAt('jump', 0);
  const [secondX, secondY] = deformationAt('doubleJump', 0);
  const [reboundX, reboundY] = deformationAt('doubleJump', 0.045);
  assert.ok(secondX > firstX && secondY < firstY);
  assert.ok(reboundX < 0.8 && reboundY > 1.2);
  assert.deepEqual(deformationAt('doubleJump', 0.24), [1, 1]);
});

test('TL002 grounded running has a synchronized four-foot bounding gait that speeds up moderately', () => {
  const x1 = runningMotion(0, 1), x1Flight = runningMotion(1 / (2 * 2.4), 1);
  const x5Flight = runningMotion(1 / (2 * 3.8), 5);
  assert.ok(x1.scaleX < 1 && x1.scaleY > 1 && x1.offsetY === 0, 'stance compresses the body near the floor');
  assert.ok(x1Flight.scaleX > 1.03 && x1Flight.scaleX < 1.1
    && x1Flight.scaleY < 0.98 && x1Flight.scaleY > 0.9 && x1Flight.offsetY < -4.5,
  'the airborne part keeps a restrained stretch, rise and shift');
  assert.ok(x1Flight.offsetX <= 1.5 && x1Flight.offsetX >= -1.5);
  assert.ok(x5Flight.offsetY < -4.5, 'the softer bounding gait remains phase-matched at x5');
  assert.ok(x5Flight.frameTravel > 0 && x1Flight.frameTravel > 0);
  assert.ok(x1Flight.shadowScale < 1 && x1Flight.shadowAlpha < 1, 'the shadow lifts and fades with the body');
});

test('TL002 world view gradually zooms out with speed while keeping the runner anchored', () => {
  const scales = [1, 1.5, 2, 3, 4, 5].map(worldVisualScale);
  assert.equal(scales[0], 1);
  assert.ok(Math.abs(scales.at(-1) - 0.5) < 1e-12);
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] < scales[i - 1]);

  const anchor = 150, screenWidth = 680;
  assert.equal(worldCoordinateAtScale(anchor, anchor, scales.at(-1)), anchor);
  assert.ok(worldCoordinateAtScale(500, anchor, scales.at(-1)) < 500);
  assert.equal(worldViewportRight(screenWidth, 1, anchor), screenWidth);
  const x5Right = worldViewportRight(screenWidth, scales.at(-1), anchor);
  assert.ok(Math.abs((x5Right - anchor) / (screenWidth - anchor) - 2) < 1e-12,
    'the visible distance from the runner to the right edge doubles at x5');
  assert.ok(worldViewportLeft(0, scales.at(-1), anchor) < 0,
    'the zoomed view also needs background coverage left of the original world edge');
});

test('TL002 parallax moves houses slowly, bushes at medium speed, and fence with the road', () => {
  const houses = sceneryOffset(1000, 'houses');
  const bushes = sceneryOffset(1000, 'bushes');
  const fence = sceneryOffset(1000, 'fence');
  const road = sceneryOffset(1000, 'road');
  assert.equal(houses, 100, 'houses use a slightly slower 0.10 parallax rate');
  assert.equal(bushes, 320, 'bushes use a slightly slower 0.32 parallax rate');
  assert.ok(houses > 0 && houses < bushes, 'houses drift more slowly than bushes');
  assert.ok(bushes < fence, 'bushes move at a medium parallax speed');
  assert.equal(fence, road, 'the fence and road travel together');
  assert.equal(sceneryOffset(2000, 'bushes'), bushes * 2,
    'background movement accumulates with traveled distance, so it accelerates as the runner speeds up');
  assert.equal(sceneryOffset(-20, 'road'), 0);
});

test('TL002 sun and moon positions counter the world zoom so their rise and path stay visible', () => {
  const horizontalAnchor = 180, verticalAnchor = 420, screenWidth = 960;
  const targets = [[0.09 * screenWidth, 252], [0.51 * screenWidth, 42], [0.93 * screenWidth, 320]];
  for (const speed of [1, 1.5, 2, 3, 4, 5]) {
    const scale = worldVisualScale(speed);
    for (const [screenX, screenY] of targets) {
      const worldX = worldCoordinateForScreenAtScale(screenX, horizontalAnchor, scale);
      const worldY = worldCoordinateForScreenAtScale(screenY, verticalAnchor, scale);
      assert.ok(Math.abs(worldCoordinateAtScale(worldX, horizontalAnchor, scale) - screenX) < 1e-9);
      assert.ok(Math.abs(worldCoordinateAtScale(worldY, verticalAnchor, scale) - screenY) < 1e-9);
    }
  }
  const x5 = worldVisualScale(5);
  assert.ok(worldCoordinateForScreenAtScale(42, verticalAnchor, x5) < 42,
    'the world-space sun apex rises as zoom increases, preserving its on-screen height');
  assert.ok(worldCoordinateForScreenAtScale(0.93 * screenWidth, horizontalAnchor, x5) > 0.93 * screenWidth,
    'the sun travels farther right in world space so its on-screen path still reaches the horizon');
});
