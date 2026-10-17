import assert from 'node:assert/strict';
import test from 'node:test';
import decomp from 'phaser/src/physics/matter-js/poly-decomp/index.js';
import Common from 'phaser/src/physics/matter-js/lib/core/Common.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Events from 'phaser/src/physics/matter-js/lib/core/Events.js';
import { readFile } from 'node:fs/promises';
import { compoundInertia } from '../src/systems/CompoundInertia.ts';
import { CONTACT_TUNING, SERPENTELA_PHYSICS } from '../src/game/PhysicsTuning.ts';
Common.setDecomp(decomp);
const { definitions, displayScale: scale } = JSON.parse(await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url)));

test('separated mass resists rotation, with the same result anywhere on screen', () => {
  const parts = [
    { mass: 2, inertia: 3, position: { x: -5, y: 0 } },
    { mass: 2, inertia: 3, position: { x: 5, y: 0 } },
  ];
  assert.equal(compoundInertia({ x: 0, y: 0 }, parts), 406);
  assert.equal(compoundInertia({ x: 260, y: 148 }, parts.map((p) => ({ ...p, position: { x: p.position.x + 260, y: p.position.y + 148 } }))), 406);
});

test('holding and releasing retains the corrected inertia for every silhouette', () => {
  for (const definition of definitions) {
    const body = Bodies.fromVertices(260, 148, definition.outline.map((p) => ({ x: p.x * scale, y: p.y * scale })), SERPENTELA_PHYSICS, true, 0, 0);
    const corrected = compoundInertia(body.position, body.parts.slice(1));
    assert.ok(corrected > body.inertia, definition.name);
    Body.setInertia(body, corrected);
    Body.setStatic(body, true);
    Body.setStatic(body, false);
    assert.equal(body.inertia, corrected);
    assert.equal(body.inverseInertia, 1 / corrected);
  }
});

function landingRoughness(definition, stable) {
  const engine = Engine.create(stable ? CONTACT_TUNING : {});
  engine.gravity.y = 1.2;
  const platform = Bodies.rectangle(260, 580, 280, 64, { isStatic: true });
  const body = Bodies.fromVertices(260, 148, definition.outline.map((p) => ({ x: p.x * scale, y: p.y * scale })), stable ? SERPENTELA_PHYSICS : { friction: 0.55, frictionStatic: 1, restitution: 0.12, sleepThreshold: Infinity }, true, 0, 0);
  if (stable) Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
  Composite.add(engine.world, [platform, body]);
  let contactAt, previous = { ...body.position, angle: body.angle }, previousDelta;
  let roughness = 0, samples = 0;
  Events.on(engine, 'collisionStart', ({ timestamp }) => { contactAt ??= timestamp; });
  for (let frame = 0; frame < 240; frame++) {
    Engine.update(engine, 1000 / 60);
    const delta = { x: body.position.x - previous.x, y: body.position.y - previous.y, angle: body.angle - previous.angle };
    if (contactAt && engine.timing.timestamp > contactAt + 500 && engine.timing.timestamp < contactAt + 3000 && previousDelta) {
      roughness += Math.abs(delta.x - previousDelta.x) + Math.abs(delta.y - previousDelta.y) + 30 * Math.abs(delta.angle - previousDelta.angle);
      samples++;
    }
    previous = { ...body.position, angle: body.angle }; previousDelta = delta;
  }
  Composite.clear(engine.world, false); Engine.clear(engine);
  return roughness / samples;
}

test('all 15 silhouettes have substantially smoother post-contact motion without relying on glue', () => {
  const before = definitions.map((d) => landingRoughness(d, false));
  const after = definitions.map((d) => landingRoughness(d, true));
  const mean = (values) => values.reduce((a, b) => a + b) / values.length;
  assert.ok(mean(after) < mean(before) * 0.3, JSON.stringify({ before: mean(before), after: mean(after) }));
  assert.ok(Math.max(...after) < 0.2, 'no single silhouette dominates the residual jitter');
});
