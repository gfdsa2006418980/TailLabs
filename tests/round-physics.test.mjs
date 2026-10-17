import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import decomp from 'phaser/src/physics/matter-js/poly-decomp/index.js';
import Common from 'phaser/src/physics/matter-js/lib/core/Common.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Events from 'phaser/src/physics/matter-js/lib/core/Events.js';
import { RoundSession } from '../src/systems/RoundSession.ts';
import { StickinessSystem } from '../src/systems/StickinessSystem.ts';
import { TowerCamera } from '../src/systems/TowerCamera.ts';
import { compoundInertia } from '../src/systems/CompoundInertia.ts';
import { CONTACT_TUNING, SERPENTELA_PHYSICS } from '../src/game/PhysicsTuning.ts';

Common.setDecomp(decomp);
const { definitions, displayScale: scale } = JSON.parse(await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url)));

test('ten actual concave bodies stack, lift the camera, and settle into one completed result', () => {
  const engine = Engine.create({ ...CONTACT_TUNING, enableSleeping: true }); engine.gravity.y = 1.2;
  const platform = Bodies.rectangle(260, 580, 280, 64, { isStatic: true, friction: .75 });
  Composite.add(engine.world, platform);
  const round = new RoundSession(10); round.start();
  const glue = new StickinessSystem(); glue.addSupport(platform.id);
  const camera = new TowerCamera(); const pieces = []; const supported = new Set();
  Events.on(engine, 'collisionStart', ({ pairs }) => {
    for (const pair of pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent;
      glue.beginContact(a.id, b.id, round.elapsedMilliseconds, pair.id);
      if (a.id === platform.id || supported.has(a.id)) supported.add(b.id);
      if (b.id === platform.id || supported.has(b.id)) supported.add(a.id);
    }
  });
  Events.on(engine, 'collisionEnd', ({ pairs }) => {
    for (const pair of pairs) glue.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
  });
  const definition = definitions.find((d) => d.id === 'serpentela-w5-01');
  let settlements = 0;
  for (let frame = 0; frame < 6000 && round.state === 'playing'; frame++) {
    if (round.remaining && (!pieces.length || pieces.at(-1).isStatic)) {
      const body = Bodies.fromVertices(260, 148 + camera.offset, definition.outline.map((p) => ({ x: p.x * scale, y: p.y * scale })), SERPENTELA_PHYSICS, true, 0, 0);
      Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
      Composite.add(engine.world, body); pieces.push(body); round.recordDrop();
      glue.track({ id: body.id, get speed() { return Math.hypot(body.velocity.x, body.velocity.y); }, get angularSpeed() { return Math.abs(body.angularVelocity); },
        damp(factor) { Body.setVelocity(body, { x: body.velocity.x * factor, y: body.velocity.y * factor }); Body.setAngularVelocity(body, body.angularVelocity * factor); },
        freeze() { Body.setVelocity(body, { x: 0, y: 0 }); Body.setAngularVelocity(body, 0); Body.setStatic(body, true); } });
    }
    Engine.update(engine, 1000 / 60); glue.update(round.elapsedMilliseconds + 1000 / 60, 1000 / 60);
    if (round.update(1000 / 60, pieces.map((body) => ({ id: body.id, frozen: body.isStatic, bounds: body.bounds })), 548)) settlements++;
    const landed = pieces.filter((body) => supported.has(body.id));
    camera.update(landed.length ? Math.min(...landed.map((body) => body.bounds.min.y)) : undefined, 1000 / 60);
  }
  assert.equal(round.state, 'completed'); assert.equal(round.remaining, 0); assert.equal(round.placedCount, 10);
  assert.equal(settlements, 1); assert.ok(camera.offset < -100); assert.equal(glue.frozenCount, 10);
  assert.ok(round.result().speedBonus > 0);
  assert.ok(pieces.every((body) => body.isStatic && body.position.x > 100 && body.position.x < 420));
  Composite.clear(engine.world, false); Engine.clear(engine);
});
