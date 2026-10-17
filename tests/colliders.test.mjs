import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import decomp from 'phaser/src/physics/matter-js/poly-decomp/index.js';
import Common from 'phaser/src/physics/matter-js/lib/core/Common.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Events from 'phaser/src/physics/matter-js/lib/core/Events.js';
import Query from 'phaser/src/physics/matter-js/lib/collision/Query.js';
import { StickinessSystem } from '../src/systems/StickinessSystem.ts';
import { CONTACT_TUNING, SERPENTELA_PHYSICS } from '../src/game/PhysicsTuning.ts';
import { compoundInertia } from '../src/systems/CompoundInertia.ts';

Common.setDecomp(decomp);
const manifestURL = new URL('../public/assets/serpentelas/colliders.json', import.meta.url);
const publicJSON = await readFile(manifestURL, 'utf8');
const sourceJSON = await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url), 'utf8');
const { definitions, displayScale: scale } = JSON.parse(publicJSON);

function inside(point, polygon) {
  let result = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function bodyFor(definition, x = 0, y = 0) {
  const body = Bodies.fromVertices(x, y, definition.outline.map((point) => ({ x: point.x * scale, y: point.y * scale })), SERPENTELA_PHYSICS, true, 0, 0);
  Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
  return body;
}

test('runtime and gallery share identical geometry for exactly 15 unique assets', () => {
  assert.equal(publicJSON, sourceJSON);
  assert.equal(definitions.length, 15);
  assert.equal(new Set(definitions.map((d) => d.id)).size, 15);
  assert.ok(definitions.every((d) => d.fitIoU >= 0.98 && d.ignoredOpaquePixels === 0));
});

for (const definition of definitions) {
  test(`${definition.name}: original bytes, concave gaps, mass centre, and compound geometry agree`, async () => {
    const bytes = await readFile(new URL(`../public/assets/serpentelas/${definition.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), definition.sha256);
    const body = bodyFor(definition);
    assert.ok(body.parts.length > 1, 'the shape remains concave instead of becoming one convex hull');
    assert.equal(body.parts.length - 1, definition.parts.length, 'the gallery uses the same convex decomposition');
    assert.ok(Math.abs(body.area - definition.area * scale ** 2) < 0.01);
    assert.ok(Math.abs(body.bounds.min.x - (definition.bounds.minX - definition.center.x) * scale) < 0.01);
    assert.ok(Math.abs(body.bounds.max.y - (definition.bounds.maxY - definition.center.y) * scale) < 0.01);
    let concaveGapSamples = 0;
    for (let y = 2.37; y < definition.height; y += 4) {
      for (let x = 2.37; x < definition.width; x += 4) {
        const original = { x, y };
        // Point-in-polygon boundary inclusion is intentionally undefined; test interiors.
        const onBoundary = definition.outline.some((a, index) => {
          const b = definition.outline[(index + 1) % definition.outline.length];
          const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
          return Math.abs(cross) < 1e-7 && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)
            && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y);
        });
        if (onBoundary) continue;
        const world = { x: (x - definition.center.x) * scale, y: (y - definition.center.y) * scale };
        const expected = inside(original, definition.outline);
        const actual = Query.point([body], world).length > 0;
        assert.equal(actual, expected, `body/image alignment mismatch at ${x},${y}`);
        if (!expected && inside(world, body.vertices)) concaveGapSamples++;
      }
    }
    assert.ok(concaveGapSamples > 0, 'the collider keeps real empty regions in its convex hull');
    for (const part of body.parts.slice(1)) assert.equal(part.parent.id, body.id);
  });

  test(`${definition.name}: actual compound contact settles and freezes`, () => {
    const engine = Engine.create({ enableSleeping: true, ...CONTACT_TUNING });
    engine.gravity.y = 1.2;
    const platform = Bodies.rectangle(260, 580, 280, 64, { isStatic: true });
    const floor = Bodies.rectangle(260, 642, 460, 32, { isStatic: true });
    const left = Bodies.rectangle(14, 358, 32, 536, { isStatic: true });
    const right = Bodies.rectangle(506, 358, 32, 536, { isStatic: true });
    const body = bodyFor(definition, 260, 148);
    Composite.add(engine.world, [platform, floor, left, right, body]);
    const sticky = new StickinessSystem();
    sticky.addSupport(platform.id);
    sticky.addSupport(floor.id);
    sticky.track({
      id: body.id,
      get speed() { return Math.hypot(body.velocity.x, body.velocity.y); },
      get angularSpeed() { return Math.abs(body.angularVelocity); },
      damp(factor) {
        if (body.isSleeping) return;
        Body.setVelocity(body, { x: body.velocity.x * factor, y: body.velocity.y * factor });
        Body.setAngularVelocity(body, body.angularVelocity * factor);
      },
      freeze() { Body.setVelocity(body, { x: 0, y: 0 }); Body.setAngularVelocity(body, 0); Body.setStatic(body, true); },
    });
    let firstContact;
    Events.on(engine, 'collisionStart', ({ pairs, timestamp }) => {
      for (const pair of pairs) {
        const a = pair.bodyA.parent, b = pair.bodyB.parent;
        sticky.beginContact(a.id, b.id, timestamp, pair.id);
        if (a.id === body.id || b.id === body.id) firstContact ??= timestamp;
      }
    });
    Events.on(engine, 'collisionEnd', ({ pairs }) => {
      for (const pair of pairs) sticky.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
    });
    let frozeAt;
    for (let step = 0; step < 900; step++) {
      Engine.update(engine, 1000 / 60);
      sticky.update(engine.timing.timestamp, 1000 / 60);
      if (body.isStatic) { frozeAt = engine.timing.timestamp; break; }
    }
    assert.ok(firstContact > 0);
    assert.ok(frozeAt >= firstContact + 3450, JSON.stringify({ firstContact, frozeAt, position: body.position, velocity: body.velocity }));
    assert.equal(sticky.frozenCount, 1);
    assert.ok(Number.isFinite(body.position.x) && body.position.y < 626);
    const frozen = { ...body.position };
    Composite.add(engine.world, bodyFor(definition, body.position.x + 4, 148));
    for (let step = 0; step < 180; step++) Engine.update(engine, 1000 / 60);
    assert.deepEqual(body.position, frozen);
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  });
}
