import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalElasticMesh, ELASTICITY } from '../src/systems/LocalElasticMesh.ts';

const offsets = (mesh) => mesh.nodes.map((n) => Math.hypot(n.x - n.restX, n.y - n.restY));

test('resting artwork does not drift under tiny persistent contact noise', () => {
  const mesh = new LocalElasticMesh(96, 96);
  for (let frame = 0; frame < 600; frame++) {
    assert.equal(mesh.impact(48, 80, 0, -1, 0.7, frame * 1000 / 60), false);
    mesh.update(1000 / 60);
  }
  assert.equal(mesh.isActive, false);
  assert.ok(offsets(mesh).every((value) => value === 0));
});

test('contact deformation stays near the impact instead of squashing the whole image', () => {
  const mesh = new LocalElasticMesh(96, 96);
  assert.equal(mesh.impact(48, 80, 0, -1, 10, 0), true);
  mesh.update(50);
  const near = mesh.nodes.find((n) => n.restX === 48 && n.restY === 80);
  const far = mesh.nodes.find((n) => n.restX === 48 && n.restY === 0);
  assert.ok(near.y < near.restY - 0.5, 'the contact is compressed inward');
  assert.ok(Math.abs(far.y - far.restY) < Math.abs(near.y - near.restY) * 0.03, 'the distant tail remains nearly still');
});

test('compound collision bursts are debounced and later impacts preserve current positions', () => {
  const mesh = new LocalElasticMesh(96, 96);
  mesh.impact(48, 80, 0, -1, 8, 0);
  mesh.update(50);
  const before = mesh.nodes.map((n) => [n.x, n.y]);
  assert.equal(mesh.impact(48, 80, 0, -1, 8, 50), false);
  assert.deepEqual(mesh.nodes.map((n) => [n.x, n.y]), before);
  assert.equal(mesh.impact(16, 48, 1, 0, 8, ELASTICITY.cooldownMs), true);
  assert.deepEqual(mesh.nodes.map((n) => [n.x, n.y]), before, 'a new impulse adds velocity without snapping the image back');
});

for (const fps of [30, 60, 120]) {
  test(`local spring stays bounded and returns exactly to the original at ${fps} fps`, () => {
    const mesh = new LocalElasticMesh(96, 96);
    mesh.impact(48, 80, 0, -1, 100, 0);
    let peak = 0;
    for (let frame = 0; frame < fps * 3; frame++) {
      mesh.update(1000 / fps);
      peak = Math.max(peak, ...offsets(mesh));
      assert.ok(peak <= ELASTICITY.maxDisplacement + 1e-8);
      // All triangles retain their orientation, preventing visible folds.
      const row = mesh.cells + 1;
      const area = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      for (let y = 0; y < mesh.cells; y++) for (let x = 0; x < mesh.cells; x++) {
        const a = y * row + x;
        assert.ok(area(mesh.nodes[a], mesh.nodes[a + 1], mesh.nodes[a + row]) > 0);
        assert.ok(area(mesh.nodes[a + 1], mesh.nodes[a + row + 1], mesh.nodes[a + row]) > 0);
      }
    }
    assert.ok(peak > 0.7);
    assert.equal(mesh.isActive, false);
    assert.ok(offsets(mesh).every((value) => value === 0));
    assert.equal(mesh.update(1000 / fps), false, 'resting objects need no canvas uploads');
  });
}
