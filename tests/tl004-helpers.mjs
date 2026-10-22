// Shared setup for TL004 tests: the headless simulation kit (tools/tl004-sim-kit.mjs) and the level data.
import { readFile } from 'node:fs/promises';
import { createSim as createLevelSim, isOver, kit, playReplay, shapes, shot, wantsAbility } from '../tools/tl004-sim-kit.mjs';

export { isOver, kit, playReplay, shapes, shot, wantsAbility };

/** All levels in play order (src/tl004/levels/levels.json, written by tools/tl004-balance.mjs). */
export const levels = JSON.parse(await readFile(new URL('../src/tl004/levels/levels.json', import.meta.url))).levels;
/** Level 1, the hand-made wooden hut. */
export const testTower = levels[0];

export function createSim(level = testTower) {
  return createLevelSim(level);
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
  for (let i = 0; i < maxSteps && !isOver(sim); i++) {
    if (sim.phase === 'aiming' && next < shots.length) events.push(...sim.launch(shots[next].vx, shots[next++].vy));
    events.push(...sim.step());
  }
  return events;
}

/** Like playShots, but each shot may say `ability: true` to tap at the sensible moment. */
export function playSmart(sim, shots, maxSteps = 8000) {
  const events = [];
  let next = 0, current;
  for (let i = 0; i < maxSteps && !isOver(sim); i++) {
    if (sim.phase === 'aiming' && next < shots.length) { current = shots[next++]; events.push(...sim.launch(current.vx, current.vy)); }
    if (current?.ability && wantsAbility(sim)) events.push(...sim.activateAbility());
    events.push(...sim.step());
  }
  return events;
}
