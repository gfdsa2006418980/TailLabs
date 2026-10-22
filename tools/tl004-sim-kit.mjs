// Headless TL004 simulation setup shared by the tests and tools/tl004-balance.mjs:
// Phaser's bundled Matter source modules, the collider data, a sensible ability-tap rule and replay.
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
import { SLING } from '../src/tl004/config/Tuning.ts';

Common.setDecomp(decomp);

export const kit = { Engine, Bodies, Body, Composite, Events, Sleeping };

const serpentelas = JSON.parse(await readFile(new URL('../src/data/serpentelas.generated.json', import.meta.url)));
const attackers = JSON.parse(await readFile(new URL('../src/tl004/data/attackers.generated.json', import.meta.url)));
export const shapes = {
  attackers: new Map(attackers.definitions.map((d) => [d.id, d])),
  targets: new Map(serpentelas.definitions.map((d) => [d.id, d])),
};

export function createSim(level) {
  return new BattleSim(kit, Engine.create(), level, shapes);
}

/** Launch velocity for an angle (rad, negative = up) and a share of full power. */
export const shot = (angle, power = 1) => ({ vx: Math.cos(angle) * SLING.maxLaunchSpeed * power, vy: Math.sin(angle) * SLING.maxLaunchSpeed * power });

export const isOver = (sim) => sim.phase === 'won' || sim.phase === 'lost';

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
    // Best right at the first touch (still allowed for a moment after it), so the blast lands inside the tower.
    case 'firework': return d < 60 || sim.firstImpactStep !== undefined;
    case 'dash': return d < 300;
    case 'split': return d < 520;
    case 'bounce': return d < 220;
    case 'slam': return [...sim.pieces.values()].some((p) => p.kind === 'target' && p.knockedOutAt === undefined && Math.abs(p.body.position.x - body.position.x) < 45 && p.body.position.y > body.position.y);
    case 'roll': return d < 260;
    case 'wave': return d < 400;
    default: return false;
  }
}

/**
 * Plays recorded shots `{ vx, vy, abilityStep? }`, each fired as soon as the sling is ready; the ability is
 * tapped at the recorded step of its shot. Stops when the level ends or the shots run out.
 */
export function playReplay(sim, shots, maxSteps = 15000) {
  const events = [];
  let next = 0, current;
  for (let i = 0; i < maxSteps && !isOver(sim); i++) {
    if (sim.phase === 'aiming') {
      if (next >= shots.length) break;
      current = shots[next++];
      events.push(...sim.launch(current.vx, current.vy));
    }
    if (current?.abilityStep !== undefined && sim.shotSteps === current.abilityStep) events.push(...sim.activateAbility());
    events.push(...sim.step());
  }
  return events;
}
