// Shared setup for TL004 tests: Phaser's bundled Matter source modules, the TL001 collider data and the test level.
import { readFile } from 'node:fs/promises';
import decomp from 'phaser/src/physics/matter-js/poly-decomp/index.js';
import Common from 'phaser/src/physics/matter-js/lib/core/Common.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Events from 'phaser/src/physics/matter-js/lib/core/Events.js';
import Sleeping from 'phaser/src/physics/matter-js/lib/core/Sleeping.js';
import { BattleSim } from '../src/tl004/sim/BattleSim.ts';

Common.setDecomp(decomp);

export const kit = { Engine, Bodies, Body, Composite, Events, Sleeping };

const manifest = JSON.parse(await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url)));
export const shapes = new Map(manifest.definitions.map((d) => [d.id, d]));
export const testTower = JSON.parse(await readFile(new URL('../src/tl004/levels/test-tower.json', import.meta.url)));

export function createSim(level = testTower) {
  const engine = Engine.create();
  return new BattleSim(kit, engine, level, shapes);
}

/** Run steps until the shot ends or the level finishes; returns all events. */
export function runUntilSettled(sim, maxSteps = 2000) {
  const events = [];
  for (let i = 0; i < maxSteps; i++) {
    const stepEvents = sim.step();
    events.push(...stepEvents);
    if (sim.phase !== 'flying') break;
  }
  return events;
}

/** Plays a whole replay (one launch per shot, each fired as soon as the sling is ready). */
export function playShots(sim, shots, maxSteps = 6000) {
  const events = [];
  let next = 0;
  for (let i = 0; i < maxSteps && sim.phase !== 'won' && sim.phase !== 'lost'; i++) {
    if (sim.phase === 'aiming' && next < shots.length) events.push(...sim.launch(shots[next].vx, shots[next++].vy));
    events.push(...sim.step());
  }
  return events;
}
