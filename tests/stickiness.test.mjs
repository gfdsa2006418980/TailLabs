import assert from 'node:assert/strict';
import test from 'node:test';
import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Events from 'phaser/src/physics/matter-js/lib/core/Events.js';
import { StickinessSystem, STICKINESS } from '../src/systems/StickinessSystem.ts';

function targetFor(body) {
  return {
    id: body.id,
    get speed() { return Math.hypot(body.velocity.x, body.velocity.y); },
    get angularSpeed() { return Math.abs(body.angularVelocity); },
    damp(factor) {
      if (body.isSleeping) return;
      Body.setVelocity(body, { x: body.velocity.x * factor, y: body.velocity.y * factor });
      Body.setAngularVelocity(body, body.angularVelocity * factor);
    },
    freeze() {
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Body.setStatic(body, true);
    },
  };
}

function fixture() {
  const sticky = new StickinessSystem();
  const body = Bodies.circle(0, 0, 24);
  const support = Bodies.rectangle(0, 40, 300, 16, { isStatic: true });
  sticky.addSupport(support.id);
  sticky.track(targetFor(body));
  return { sticky, body, support };
}

test('an airborne object never freezes, even when momentarily still', () => {
  const { sticky, body } = fixture();
  for (let now = 0; now <= 12000; now += 16) sticky.update(now, 16);
  assert.equal(body.isStatic, false);
  assert.equal(sticky.frozenCount, 0);
});

test('three seconds starts gradual damping instead of an instant freeze', () => {
  const { sticky, body, support } = fixture();
  Body.setVelocity(body, { x: 4, y: 0 });
  Body.setAngularVelocity(body, 0.2);
  sticky.beginContact(body.id, support.id, 1000);
  sticky.update(3999, 16);
  assert.equal(body.velocity.x, 4);
  assert.equal(body.angularVelocity, 0.2);
  sticky.update(4000, 16);
  assert.ok(body.velocity.x > 0 && body.velocity.x < 4);
  assert.ok(body.angularVelocity > 0 && body.angularVelocity < 0.2);
  assert.equal(body.isStatic, false);
});

test('residual rotation prevents a stationary centre from freezing', () => {
  const { sticky, body, support } = fixture();
  Body.setAngularVelocity(body, 0.3);
  sticky.beginContact(body.id, support.id, 0);
  for (let now = 3000; now <= 3500; now += 16) sticky.update(now, 16);
  assert.ok(Math.abs(body.angularVelocity) > STICKINESS.stopAngularSpeed);
  assert.equal(body.isStatic, false);
});

test('lost contact clears the rest interval and waits for a new stable contact', () => {
  const { sticky, body, support } = fixture();
  sticky.beginContact(body.id, support.id, 0);
  sticky.update(3000, 16);
  sticky.endContact(body.id, support.id);
  sticky.update(9000, 16);
  assert.equal(body.isStatic, false);
  sticky.beginContact(body.id, support.id, 10000);
  sticky.update(10000, 16);
  sticky.update(10449, 16);
  assert.equal(body.isStatic, false);
  sticky.update(10450, 16);
  assert.equal(body.isStatic, true);
});

test('ending one contact preserves another valid support', () => {
  const { sticky, body, support } = fixture();
  const second = Bodies.rectangle(30, 40, 20, 16, { isStatic: true });
  sticky.addSupport(second.id);
  sticky.beginContact(body.id, support.id, 0);
  sticky.beginContact(body.id, second.id, 0);
  sticky.endContact(body.id, support.id);
  sticky.update(3000, 16);
  sticky.update(3450, 16);
  assert.equal(body.isStatic, true);
  assert.equal(sticky.frozenCount, 1);
});

test('ending one compound-part contact preserves another contact with the same body', () => {
  const { sticky, body, support } = fixture();
  sticky.beginContact(body.id, support.id, 0, 'child-contact-A');
  sticky.beginContact(body.id, support.id, 0, 'child-contact-B');
  sticky.endContact(body.id, support.id, 'child-contact-A');
  sticky.update(3000, 16);
  sticky.update(3450, 16);
  assert.equal(body.isStatic, true);
  assert.equal(sticky.frozenCount, 1);
});

for (const hz of [30, 60, 120]) {
  test(`actual Phaser Matter engine settles, freezes, and resists later impacts at ${hz} Hz`, () => {
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1.2;
    const platform = Bodies.rectangle(260, 580, 280, 64, { isStatic: true, friction: 0.75 });
    const orb = Bodies.circle(260, 148, 24, { restitution: 0.12, friction: 0.55, frictionStatic: 1 });
    Body.setVelocity(orb, { x: 0.3, y: 0 });
    Composite.add(engine.world, [platform, orb]);
    const sticky = new StickinessSystem();
    sticky.addSupport(platform.id);
    sticky.track(targetFor(orb));
    let firstContact;
    Events.on(engine, 'collisionStart', ({ pairs, timestamp }) => {
      for (const pair of pairs) {
        sticky.beginContact(pair.bodyA.id, pair.bodyB.id, timestamp);
        firstContact ??= timestamp;
      }
    });
    Events.on(engine, 'collisionEnd', ({ pairs }) => {
      for (const pair of pairs) sticky.endContact(pair.bodyA.id, pair.bodyB.id);
    });
    const delta = 1000 / hz;
    let frozeAt;
    for (let now = delta; now < 10000; now += delta) {
      Engine.update(engine, delta);
      sticky.update(engine.timing.timestamp, delta);
      if (orb.isStatic && frozeAt === undefined) frozeAt = engine.timing.timestamp;
    }
    assert.ok(firstContact > 0, 'the orb hit the platform');
    assert.ok(frozeAt >= firstContact + STICKINESS.delayMs + STICKINESS.stillDurationMs,
      JSON.stringify({ firstContact, frozeAt, position: orb.position, velocity: orb.velocity, angularVelocity: orb.angularVelocity, isSleeping: orb.isSleeping }));
    assert.equal(sticky.frozenCount, 1);
    assert.ok(Math.abs(orb.position.y - 524) < 2, 'the orb rests on the platform');
    const frozenPosition = { ...orb.position };
    const incoming = Bodies.circle(orb.position.x + 6, 148, 24, { restitution: 0.12 });
    Composite.add(engine.world, incoming);
    for (let step = 0; step < hz * 3; step++) Engine.update(engine, delta);
    assert.deepEqual(orb.position, frozenPosition, 'later impacts cannot move the frozen support');
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  });
}

test('restart removes pending state and old contacts', () => {
  const { sticky, body, support } = fixture();
  sticky.beginContact(body.id, support.id, 0);
  sticky.clear();
  for (let now = 3000; now < 6000; now += 16) sticky.update(now, 16);
  assert.equal(body.isStatic, false);
  assert.equal(sticky.frozenCount, 0);
});
