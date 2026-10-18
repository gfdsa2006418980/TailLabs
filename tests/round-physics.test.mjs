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
import { TowerSupportSystem } from '../src/systems/TowerSupportSystem.ts';
import { createStageLayout } from '../src/game/StageConfig.ts';
import { getRoundAssist } from '../src/game/RoundConfig.ts';
import { compoundInertia } from '../src/systems/CompoundInertia.ts';
import { CONTACT_TUNING, SERPENTELA_PHYSICS } from '../src/game/PhysicsTuning.ts';

Common.setDecomp(decomp);
const { definitions, displayScale: scale } = JSON.parse(await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url)));

test('ten smaller concave bodies stack and settle without premature camera scrolling', () => {
  const engine = Engine.create({ ...CONTACT_TUNING, enableSleeping: true }); engine.gravity.y = 1.2;
  const platform = Bodies.rectangle(260, 580, 280, 64, { isStatic: true, friction: .75 });
  Composite.add(engine.world, platform);
  const round = new RoundSession(10); round.start();
  const glue = new StickinessSystem(); glue.addSupport(platform.id);
  const camera = new TowerCamera(), tower = new TowerSupportSystem(); const pieces = []; tower.addFloor(platform.id);
  Events.on(engine, 'collisionStart', ({ pairs }) => {
    for (const pair of pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent;
      glue.beginContact(a.id, b.id, round.elapsedMilliseconds, pair.id);
      tower.beginContact(a.id, b.id, pair.id);
    }
  });
  Events.on(engine, 'collisionEnd', ({ pairs }) => {
    for (const pair of pairs) {
      glue.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
      tower.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
    }
  });
  const definition = definitions.find((d) => d.id === 'serpentela-w5-01');
  let settlements = 0;
  for (let frame = 0; frame < 6000 && round.state === 'playing'; frame++) {
    if (round.remaining && (!pieces.length || pieces.at(-1).isStatic)) {
      const body = Bodies.fromVertices(260, 148 + camera.offset, definition.outline.map((p) => ({ x: p.x * scale, y: p.y * scale })), SERPENTELA_PHYSICS, true, 0, 0);
      Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
      Composite.add(engine.world, body); pieces.push(body); round.recordDrop();
      const target = { id: body.id, get frozen() { return body.isStatic; }, get bounds() { return body.bounds; },
        get speed() { return Math.hypot(body.velocity.x, body.velocity.y); }, get angularSpeed() { return Math.abs(body.angularVelocity); },
        damp(factor) { Body.setVelocity(body, { x: body.velocity.x * factor, y: body.velocity.y * factor }); Body.setAngularVelocity(body, body.angularVelocity * factor); },
        freeze() { Body.setVelocity(body, { x: 0, y: 0 }); Body.setAngularVelocity(body, 0); Body.setStatic(body, true); tower.onFreeze(body.id); } };
      glue.track(target); tower.track(target);
    }
    Engine.update(engine, 1000 / 60); glue.update(round.elapsedMilliseconds + 1000 / 60, 1000 / 60);
    if (round.update(1000 / 60, pieces.map((body) => ({ id: body.id, frozen: body.isStatic, bounds: body.bounds })), 548)) settlements++;
    camera.update(tower.top, 1000 / 60);
  }
  assert.equal(round.state, 'completed'); assert.equal(round.remaining, 0); assert.equal(round.placedCount, 10);
  assert.equal(settlements, 1); assert.equal(camera.offset, 0); assert.equal(glue.frozenCount, 10);
  assert.ok(round.result().speedBonus > 0);
  assert.ok(pieces.every((body) => body.isStatic && body.position.x > 100 && body.position.x < 420));
  Composite.clear(engine.world, false); Engine.clear(engine);
});

test('a 500-piece-mode scrape at spawn height never lifts the camera away from the floor', () => {
  const layout = createStageLayout(520, 920);
  const engine = Engine.create(CONTACT_TUNING); engine.gravity.y = 1.2;
  const floor = Bodies.rectangle(260, layout.platformY + layout.platformDepth / 2, layout.safeRight - layout.safeLeft, layout.platformDepth, { isStatic: true, friction: .75 });
  const height = Math.min(layout.lightPillarHeight * 2 * getRoundAssist(500).lightPillarHeightMultiplier, layout.platformY - layout.chamberTop);
  const wall = Bodies.rectangle(layout.safeLeft - layout.lightPillarWidth / 2, layout.platformY - height / 2, layout.lightPillarWidth, height, { isStatic: true, friction: .8 });
  const definition = definitions.find(d => d.id === 'serpentela-w5-01');
  const x = layout.safeLeft + (definition.center.x - definition.bounds.minX) * scale;
  const body = Bodies.fromVertices(x, layout.spawnY, definition.outline.map(p => ({ x: p.x * scale, y: p.y * scale })), SERPENTELA_PHYSICS, true, 0, 0);
  Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
  Body.setVelocity(body, { x: -.6, y: 0 });
  Composite.add(engine.world, [floor, wall, body]);
  const tower = new TowerSupportSystem(), camera = new TowerCamera(), glue = new StickinessSystem();
  tower.addFloor(floor.id); glue.addSupport(floor.id); glue.addSupport(wall.id); glue.setDelayMs(1500);
  const target = {
    id: body.id, get frozen() { return body.isStatic; }, get bounds() { return body.bounds; },
    get speed() { return Math.hypot(body.velocity.x, body.velocity.y); }, get angularSpeed() { return Math.abs(body.angularVelocity); },
    damp(factor) { Body.setVelocity(body, { x: body.velocity.x * factor, y: body.velocity.y * factor }); Body.setAngularVelocity(body, body.angularVelocity * factor); },
    freeze() { Body.setVelocity(body, { x: 0, y: 0 }); Body.setAngularVelocity(body, 0); Body.setStatic(body, true); tower.onFreeze(body.id); },
  };
  tower.track(target); glue.track(target); let firstWallY, floorContact = false;
  Events.on(engine, 'collisionStart', ({ pairs }) => {
    for (const pair of pairs) {
      const a = pair.bodyA.parent.id, b = pair.bodyB.parent.id;
      tower.beginContact(a, b, pair.id); glue.beginContact(a, b, engine.timing.timestamp, pair.id);
      if ((a === body.id && b === wall.id) || (b === body.id && a === wall.id)) firstWallY ??= body.position.y;
      if ((a === body.id && b === floor.id) || (b === body.id && a === floor.id)) floorContact = true;
    }
  });
  Events.on(engine, 'collisionEnd', ({ pairs }) => {
    for (const pair of pairs) {
      tower.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
      glue.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
    }
  });
  for (let frame = 0; frame < 600; frame++) {
    Engine.update(engine, 1000 / 60); glue.update(engine.timing.timestamp, 1000 / 60);
    camera.update(tower.top, 1000 / 60, layout.chamberTop + layout.chamberHeight * .46);
    assert.equal(camera.offset, 0);
  }
  assert.ok(firstWallY < layout.spawnY + 5, 'The regression must actually scrape the tall pillar at spawn height');
  assert.equal(floorContact, true); assert.equal(body.isStatic, true);
  assert.ok(tower.top > layout.platformY - 80);
  Composite.clear(engine.world, false); Engine.clear(engine);
});
