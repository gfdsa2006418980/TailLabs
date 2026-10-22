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

const serpentelas = JSON.parse(await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url)));
const attackers = JSON.parse(await readFile(new URL('../src/tl004/data/attackers.generated.json', import.meta.url)));
export const shapes = {
  attackers: new Map(attackers.definitions.map((d) => [d.id, d])),
  targets: new Map(serpentelas.definitions.map((d) => [d.id, d])),
};
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

/** Distance from the active partner to the nearest block or 四十塊 still in play. */
function nearest(sim, body) {
  let best = Infinity;
  for (const piece of sim.pieces.values()) {
    if (piece.kind === 'attacker' || piece.knockedOutAt !== undefined) continue;
    best = Math.min(best, Math.hypot(piece.body.position.x - body.position.x, piece.body.position.y - body.position.y));
  }
  return best;
}

/** A sensible tap time for each ability (used by bots and tests). */
export function wantsAbility(sim) {
  if (!sim.canUseAbility) return false;
  const body = sim.pieces.get(sim.activeAttackerId).body;
  const d = nearest(sim, body);
  switch (sim.currentAbility) {
    case 'firework': return d < 120;
    case 'dash': return d < 300;
    case 'split': return d < 520;
    case 'bounce': return d < 220;
    case 'slam': return [...sim.pieces.values()].some((p) => p.kind === 'target' && p.knockedOutAt === undefined && Math.abs(p.body.position.x - body.position.x) < 45 && p.body.position.y > body.position.y);
    default: return false;
  }
}

/** Like playShots, but each shot may say `ability: true` to tap at the sensible moment. */
export function playSmart(sim, shots, maxSteps = 8000) {
  const events = [];
  let next = 0, current;
  for (let i = 0; i < maxSteps && sim.phase !== 'won' && sim.phase !== 'lost'; i++) {
    if (sim.phase === 'aiming' && next < shots.length) { current = shots[next++]; events.push(...sim.launch(current.vx, current.vy)); }
    if (current?.ability && wantsAbility(sim)) events.push(...sim.activateAbility());
    events.push(...sim.step());
  }
  return events;
}
