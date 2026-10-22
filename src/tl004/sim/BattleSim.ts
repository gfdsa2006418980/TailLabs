import { MATERIALS } from '../config/Materials.ts';
import type { MaterialId } from '../config/Materials.ts';
import { ATTACKER, KNOCKOUT, PHYSICS, SHOT, SLING, STEP_MS, TARGET, WORLD } from '../config/Tuning.ts';
import { damageFrom, impactStrength } from '../rules/Damage.ts';
import { ScoreBook, starsFor } from '../rules/Scoring.ts';
import { validateLevel } from './Level.ts';
import type { LevelData, Point, ShapeDefinition, ShapeLibrary } from './Level.ts';
import { compoundInertia } from './CompoundInertia.ts';

/** The parts of a Matter body the simulation reads. */
export interface SimBody {
  id: number;
  parent: SimBody;
  parts: SimBody[];
  position: Point;
  velocity: Point;
  angle: number;
  speed: number;
  angularSpeed: number;
  mass: number;
  inertia: number;
  isStatic: boolean;
  isSleeping: boolean;
  bounds: { min: Point; max: Point };
  collisionFilter: { category: number; mask: number; group: number };
}

export interface SimEngine {
  world: unknown;
  gravity: { x: number; y: number; scale: number };
  enableSleeping: boolean;
  positionIterations: number;
  velocityIterations: number;
  constraintIterations: number;
}

interface SimPair {
  bodyA: SimBody;
  bodyB: SimBody;
  collision: { normal: Point; supports?: Point[] };
}

/**
 * Matter modules injected by the caller: Phaser's bundled copy in the browser,
 * the same source modules in Node tests. Keeps one rule path for both.
 */
export interface MatterKit {
  Engine: { update(engine: SimEngine, delta: number): void };
  Bodies: {
    rectangle(x: number, y: number, w: number, h: number, options?: object): SimBody;
    fromVertices(x: number, y: number, vertexSets: Point[] | Point[][], options?: object, flagInternal?: boolean, removeCollinear?: number, minimumArea?: number): SimBody;
  };
  Body: {
    setInertia(body: SimBody, inertia: number): void;
    setVelocity(body: SimBody, velocity: Point): void;
    setAngularVelocity(body: SimBody, velocity: number): void;
    setAngle(body: SimBody, angle: number): void;
  };
  Composite: {
    add(world: unknown, body: SimBody): void;
    remove(world: unknown, body: SimBody): void;
  };
  Events: {
    on(target: SimEngine, name: string, callback: (event: { pairs: SimPair[] }) => void): void;
    off(target: SimEngine, name: string, callback: (event: { pairs: SimPair[] }) => void): void;
  };
  Sleeping: { set(body: SimBody, isSleeping: boolean): void };
}

/** block = wood/stone/glass, target = a 四十塊, attacker = a launched partner. */
export type PieceKind = 'block' | 'target' | 'attacker';

export interface Piece {
  id: number;
  kind: PieceKind;
  body: SimBody;
  material?: MaterialId;
  /** Art id: partner id for attackers, serpentela id for targets. */
  shapeId?: string;
  /** Size of the art box in world px. */
  w: number;
  h: number;
  /** Where the body's centre of mass sits in the art box (rectangles: 0,0 = middle). */
  anchor: Point;
  hp: number;
  maxHp: number;
  cracked: boolean;
  /** Step at which a 四十塊 was knocked out; it then flies off without colliding. */
  knockedOutAt?: number;
}

export type Phase = 'aiming' | 'flying' | 'won' | 'lost';

export type SimEvent =
  | { type: 'impact'; x: number; y: number; strength: number; material: MaterialId | 'ground' | 'attacker'; attackerId?: number }
  | { type: 'cracked'; id: number }
  | { type: 'break'; id: number; kind: PieceKind; material?: MaterialId; shapeId?: string; x: number; y: number; angle: number; vx: number; points: number }
  | { type: 'launch'; shot: number; id: number }
  | { type: 'shotEnd'; chainBonus: number }
  | { type: 'ready'; shot: number }
  | { type: 'bonus'; index: number; points: number }
  | { type: 'won'; stars: number; score: number }
  | { type: 'lost'; score: number };

export interface LaunchRecord { step: number; vx: number; vy: number }

interface ImpactRecord { a: SimBody; b: SimBody; strength: number; point: Point }

export function configureEngine(engine: SimEngine): void {
  engine.gravity.x = 0;
  engine.gravity.y = PHYSICS.gravityY;
  engine.gravity.scale = PHYSICS.gravityScale;
  engine.enableSleeping = true;
  engine.positionIterations = PHYSICS.positionIterations;
  engine.velocityIterations = PHYSICS.velocityIterations;
  engine.constraintIterations = PHYSICS.constraintIterations;
}

/** Where a freshly created body's centre lies in the local coordinates its outline was given in. */
function anchorFor(body: SimBody, outlineMin: Point): Point {
  return { x: outlineMin.x - (body.bounds.min.x - body.position.x), y: outlineMin.y - (body.bounds.min.y - body.position.y) };
}

function minOf(points: readonly Point[]): Point {
  return { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) };
}

export const SLING_REST: Point = { x: SLING.x, y: SLING.y + SLING.restOffsetY };

/**
 * One attempt at a level: physics, damage, scoring and shot flow, with no rendering.
 * All timing is in physics steps; call `step()` once per fixed step.
 */
export class BattleSim {
  readonly level: LevelData;
  readonly pieces = new Map<number, Piece>();
  readonly score = new ScoreBook();
  readonly launches: LaunchRecord[] = [];
  /** Steps at which the player pressed "next" (part of the replay). */
  readonly skips: number[] = [];
  phase: Phase = 'aiming';
  /** Index of the shot on the sling (or last fired once the level ends). */
  shotIndex = 0;
  stepCount = 0;
  /** 四十塊 still in play. */
  targetsLeft = 0;
  stars = 0;
  /** Partner currently in flight, for the camera; cleared at shot end. */
  activeAttackerId: number | undefined;
  /** Whether the active partner has touched anything yet. */
  activeHasImpacted = false;
  /** Steps since the current shot was launched. */
  shotSteps = 0;

  private readonly kit: MatterKit;
  private readonly engine: SimEngine;
  private readonly shapes: ShapeLibrary;
  private readonly ground: SimBody;
  private readonly impacts = new Map<string, ImpactRecord>();
  private readonly onCollision: (event: { pairs: SimPair[] }) => void;
  private readonly onSeparation: (event: { pairs: SimPair[] }) => void;
  /** Sleeping bodies whose contact just ended (their support may be gone). */
  private readonly toWake = new Set<SimBody>();
  private quietSteps = 0;
  private damageEnabled = false;
  private scoring = true;
  private destroyed = false;

  constructor(kit: MatterKit, engine: SimEngine, level: LevelData, shapes: ShapeLibrary) {
    this.kit = kit;
    this.engine = engine;
    this.level = level;
    this.shapes = shapes;
    validateLevel(level, shapes);
    configureEngine(engine);
    this.ground = kit.Bodies.rectangle(1800, WORLD.groundY + 300, 12000, 600, { isStatic: true, friction: 0.9, frictionStatic: 1, label: 'ground' });
    kit.Composite.add(engine.world, this.ground);
    for (const spec of level.blocks) {
      if (spec.material === 'target') this.addTarget(spec.shape as string, spec.x, spec.y);
      else this.addBlock(spec.material, spec.x, spec.y, spec.w ?? 0, spec.h ?? 0, spec.angle ?? 0);
    }
    this.onCollision = (event) => this.recordImpacts(event.pairs);
    this.onSeparation = (event) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA.parent, b = pair.bodyB.parent;
        if (a.isSleeping && !b.isStatic) this.toWake.add(a);
        if (b.isSleeping && !a.isStatic) this.toWake.add(b);
      }
    };
    kit.Events.on(engine, 'collisionStart', this.onCollision);
    kit.Events.on(engine, 'collisionEnd', this.onSeparation);
    this.presettle();
  }

  get shotsTotal(): number { return this.level.shots.length; }
  /** Partners still waiting, including the one on the sling while aiming. */
  get shotsLeft(): number { return this.phase === 'aiming' ? this.shotsTotal - this.shotIndex : Math.max(0, this.shotsTotal - this.shotIndex - 1); }
  get isLastShot(): boolean { return this.shotIndex + 1 >= this.shotsTotal; }
  /** No skipping the last shot: a slow collapse may still knock out the final 四十塊. */
  get canSkip(): boolean { return this.phase === 'flying' && !this.isLastShot && this.shotSteps >= SHOT.skipAfterSteps; }
  get currentShapeId(): string | undefined { return this.level.shots[this.shotIndex]; }

  /** Fire the partner on the sling. Velocity is in px per step. */
  launch(vx: number, vy: number): SimEvent[] {
    if (this.phase !== 'aiming') return [];
    const shapeId = this.level.shots[this.shotIndex];
    const shape = this.shapes.attackers.get(shapeId) as ShapeDefinition;
    const body = this.kit.Bodies.fromVertices(SLING_REST.x, SLING_REST.y, shape.outline.map((p) => ({ ...p })), {
      density: ATTACKER.density, friction: ATTACKER.friction, frictionStatic: ATTACKER.frictionStatic,
      frictionAir: ATTACKER.frictionAir, restitution: ATTACKER.restitution, label: shapeId,
    }, true, 0, 0);
    const anchor = anchorFor(body, minOf(shape.outline));
    this.kit.Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
    this.kit.Body.setVelocity(body, { x: vx, y: vy });
    this.kit.Composite.add(this.engine.world, body);
    this.pieces.set(body.id, { id: body.id, kind: 'attacker', body, shapeId, w: shape.width, h: shape.height, anchor, hp: Infinity, maxHp: Infinity, cracked: false });
    this.launches.push({ step: this.stepCount, vx, vy });
    this.phase = 'flying';
    this.shotSteps = 0;
    this.quietSteps = 0;
    this.activeAttackerId = body.id;
    this.activeHasImpacted = false;
    this.score.beginShot(this.stepCount);
    return [{ type: 'launch', shot: this.shotIndex, id: body.id }];
  }

  /** "Next" button: end the shot early once allowed. */
  requestNext(): SimEvent[] {
    if (!this.canSkip) return [];
    this.skips.push(this.stepCount);
    return this.endShot();
  }

  step(): SimEvent[] {
    if (this.destroyed) return [];
    const events: SimEvent[] = [];
    this.impacts.clear();
    this.kit.Engine.update(this.engine, STEP_MS);
    this.stepCount++;
    for (const body of this.toWake) if (this.pieces.has(body.id)) this.kit.Sleeping.set(body, false);
    this.toWake.clear();
    this.applyImpacts(events);
    this.removeLost(events);
    this.capSpeeds();
    if (this.phase === 'flying') {
      this.shotSteps++;
      this.quietSteps = this.isQuiet() ? this.quietSteps + 1 : 0;
      const limit = this.isLastShot ? SHOT.forceLastSteps : SHOT.forceNextSteps;
      if (this.quietSteps >= SHOT.settleSteps || this.shotSteps >= limit) events.push(...this.endShot());
    } else if (this.phase === 'aiming' && this.targetsLeft === 0) {
      events.push(...this.finishWon());
    }
    return events;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.kit.Events.off(this.engine, 'collisionStart', this.onCollision);
    this.kit.Events.off(this.engine, 'collisionEnd', this.onSeparation);
    for (const piece of this.pieces.values()) this.kit.Composite.remove(this.engine.world, piece.body);
    this.kit.Composite.remove(this.engine.world, this.ground);
    this.pieces.clear();
  }

  private addBlock(material: MaterialId, x: number, y: number, w: number, h: number, angle: number): void {
    const spec = MATERIALS[material];
    const body = this.kit.Bodies.rectangle(x, y, w, h, { density: spec.density, friction: spec.friction, frictionStatic: spec.frictionStatic, restitution: spec.restitution, angle, label: material });
    this.kit.Composite.add(this.engine.world, body);
    this.pieces.set(body.id, { id: body.id, kind: 'block', body, material, w, h, anchor: { x: 0, y: 0 }, hp: spec.hp, maxHp: spec.hp, cracked: false });
  }

  /** A 四十塊 with its real concave outline (TL001 collider data). */
  private addTarget(shapeId: string, x: number, y: number): void {
    const spec = MATERIALS.target;
    const shape = this.shapes.targets.get(shapeId) as ShapeDefinition;
    const outline = shape.outline.map((p) => ({ x: p.x * TARGET.scale, y: p.y * TARGET.scale }));
    const body = this.kit.Bodies.fromVertices(x, y, outline, {
      density: spec.density, friction: spec.friction, frictionStatic: spec.frictionStatic, restitution: spec.restitution, label: shapeId,
    }, true, 0, 0);
    const anchor = anchorFor(body, minOf(outline));
    this.kit.Body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
    this.kit.Composite.add(this.engine.world, body);
    this.targetsLeft++;
    this.pieces.set(body.id, {
      id: body.id, kind: 'target', body, material: 'target', shapeId, w: shape.width * TARGET.scale, h: shape.height * TARGET.scale,
      anchor, hp: spec.hp, maxHp: spec.hp, cracked: false,
    });
  }

  /** Let the hand-placed tower drop into its resting pose before play, then put it to sleep. */
  private presettle(): void {
    this.scoring = false;
    for (let i = 0; i < PHYSICS.presettleSteps; i++) {
      this.impacts.clear();
      this.kit.Engine.update(this.engine, STEP_MS);
      this.removeLost([]);
    }
    this.impacts.clear();
    for (const piece of this.pieces.values()) this.kit.Sleeping.set(piece.body, true);
    this.toWake.clear();
    this.damageEnabled = true;
    this.scoring = true;
  }

  /** Runs inside Matter's update, before velocities are solved, so it sees the incoming speeds. */
  private recordImpacts(pairs: SimPair[]): void {
    if (!this.damageEnabled) return;
    for (const pair of pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent;
      if (a === b) continue;
      const strength = impactStrength(a, b, pair.collision.normal);
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      const existing = this.impacts.get(key);
      if (existing && existing.strength >= strength) continue;
      const point = pair.collision.supports?.[0] ?? { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 };
      this.impacts.set(key, { a, b, strength, point: { x: point.x, y: point.y } });
    }
  }

  private applyImpacts(events: SimEvent[]): void {
    /** Strongest hit each 四十塊 took this step, used to aim its knock-out kick. */
    const strongest = new Map<number, { strength: number; from: SimBody; point: Point }>();
    for (const impact of this.impacts.values()) {
      const pa = this.pieces.get(impact.a.id), pb = this.pieces.get(impact.b.id);
      for (const piece of [pa, pb]) {
        if (!piece || piece.kind === 'attacker' || !piece.material || piece.knockedOutAt !== undefined) continue;
        piece.hp -= damageFrom(impact.strength, MATERIALS[piece.material]);
        if (piece.kind === 'target' && (strongest.get(piece.id)?.strength ?? -1) < impact.strength) {
          strongest.set(piece.id, { strength: impact.strength, from: piece === pa ? impact.b : impact.a, point: impact.point });
        }
        if (!piece.cracked && piece.hp > 0 && piece.hp <= piece.maxHp / 2) {
          piece.cracked = true;
          events.push({ type: 'cracked', id: piece.id });
        }
      }
      const attacker = [pa, pb].find((piece) => piece?.kind === 'attacker');
      if (attacker && attacker.id === this.activeAttackerId) this.activeHasImpacted = true;
      if (impact.strength >= SHOT.impactEventMin) {
        const other = attacker === pa ? pb : pa;
        const material = other?.material ?? (other?.kind === 'attacker' ? 'attacker' : 'ground');
        events.push({ type: 'impact', x: impact.point.x, y: impact.point.y, strength: impact.strength, material, attackerId: attacker?.id });
      }
    }
    for (const piece of [...this.pieces.values()]) {
      if (piece.kind === 'attacker' || piece.knockedOutAt !== undefined || piece.hp > 0) continue;
      if (piece.kind === 'target') this.knockOut(piece, strongest.get(piece.id), events);
      else this.removePiece(piece, events);
    }
  }

  /**
   * A 四十塊 is out: score it now, then kick it away from what hit it (always upward) and let physics carry it
   * off screen. It stops colliding, so the flight never disturbs the tower.
   */
  private knockOut(piece: Piece, hit: { strength: number; from: SimBody; point: Point } | undefined, events: SimEvent[]): void {
    const { body } = piece;
    piece.knockedOutAt = this.stepCount;
    this.targetsLeft--;
    const points = this.scoring && this.phase !== 'won' && this.phase !== 'lost' ? this.score.addBreak(MATERIALS.target.score, this.stepCount) : 0;
    events.push({ type: 'break', id: piece.id, kind: 'target', material: 'target', shapeId: piece.shapeId, x: body.position.x, y: body.position.y, angle: body.angle, vx: body.velocity.x, points });
    this.wakeAround(body);
    body.collisionFilter.mask = 0;
    for (const part of body.parts) part.collisionFilter.mask = 0;
    this.kit.Sleeping.set(body, false);
    const source = hit ? (hit.from.isStatic ? hit.point : hit.from.position) : { x: body.position.x - 1, y: body.position.y + 1 };
    let dx = body.position.x - source.x, dy = body.position.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length; dy /= length;
    if (Math.abs(dx) < 0.2) dx = dx < 0 ? -0.6 : 0.6;
    if (dy > -KNOCKOUT.minLift) dy = -KNOCKOUT.minLift;
    const norm = Math.hypot(dx, dy);
    const speed = Math.min(KNOCKOUT.maxSpeed, KNOCKOUT.minSpeed + (hit?.strength ?? 0) * KNOCKOUT.speedPerStrength);
    this.kit.Body.setVelocity(body, { x: (dx / norm) * speed, y: (dy / norm) * speed });
    this.kit.Body.setAngularVelocity(body, Math.sign(dx) * KNOCKOUT.spin);
  }

  private removeLost(events: SimEvent[]): void {
    for (const piece of [...this.pieces.values()]) {
      const { x, y } = piece.body.position;
      const expired = piece.knockedOutAt !== undefined && this.stepCount - piece.knockedOutAt > KNOCKOUT.maxSteps;
      if (expired || y > WORLD.killY || x < WORLD.minX || x > WORLD.maxX) this.removePiece(piece, events);
    }
  }

  private removePiece(piece: Piece, events: SimEvent[]): void {
    this.kit.Composite.remove(this.engine.world, piece.body);
    this.pieces.delete(piece.id);
    // A knocked-out 四十塊 was already scored and no longer touches anything.
    if (piece.knockedOutAt !== undefined) return;
    this.wakeAround(piece.body);
    if (piece.kind === 'attacker') {
      if (piece.id === this.activeAttackerId) this.activeHasImpacted = true;
      return;
    }
    if (piece.kind === 'target') this.targetsLeft--;
    const base = piece.material ? MATERIALS[piece.material].score : 0;
    const points = this.scoring && this.phase !== 'won' && this.phase !== 'lost' ? this.score.addBreak(base, this.stepCount) : 0;
    const { body } = piece;
    events.push({ type: 'break', id: piece.id, kind: piece.kind, material: piece.material, shapeId: piece.shapeId, x: body.position.x, y: body.position.y, angle: body.angle, vx: body.velocity.x, points });
  }

  /** Sleeping bodies act as fixed supports; wake everything that touched a removed body so nothing hangs in the air. */
  private wakeAround(body: SimBody): void {
    const margin = 14;
    const { min, max } = body.bounds;
    for (const other of this.pieces.values()) {
      if (!other.body.isSleeping || other.knockedOutAt !== undefined) continue;
      const b = other.body.bounds;
      if (b.max.x < min.x - margin || b.min.x > max.x + margin || b.max.y < min.y - margin || b.min.y > max.y + margin) continue;
      this.kit.Sleeping.set(other.body, false);
    }
  }

  private capSpeeds(): void {
    for (const piece of this.pieces.values()) {
      const body = piece.body;
      if (body.isSleeping || body.speed <= PHYSICS.speedCap) continue;
      const factor = PHYSICS.speedCap / body.speed;
      this.kit.Body.setVelocity(body, { x: body.velocity.x * factor, y: body.velocity.y * factor });
    }
  }

  private isQuiet(): boolean {
    for (const piece of this.pieces.values()) {
      const body = piece.body;
      // A knocked-out 四十塊 flying away does not hold up the next shot.
      if (body.isSleeping || piece.knockedOutAt !== undefined) continue;
      if (body.speed >= SHOT.quietSpeed || body.angularSpeed >= SHOT.quietAngularSpeed) return false;
    }
    return true;
  }

  private endShot(): SimEvent[] {
    const events: SimEvent[] = [{ type: 'shotEnd', chainBonus: this.score.endShot() }];
    this.activeAttackerId = undefined;
    // No forced sleep here: a slowly tipping plank looks "quiet" but must keep falling.
    // Matter's own sleeping (sustained low motion) and the separation wake-up handle rest.
    if (this.targetsLeft === 0) return [...events, ...this.finishWon()];
    if (this.shotIndex + 1 >= this.shotsTotal) {
      this.phase = 'lost';
      this.stars = 0;
      return [...events, { type: 'lost', score: this.score.total }];
    }
    this.shotIndex++;
    this.phase = 'aiming';
    return [...events, { type: 'ready', shot: this.shotIndex }];
  }

  private finishWon(): SimEvent[] {
    const events: SimEvent[] = [];
    const firstUnused = this.phase === 'aiming' ? this.shotIndex : this.shotIndex + 1;
    for (let index = firstUnused; index < this.shotsTotal; index++) events.push({ type: 'bonus', index, points: this.score.addRemainingShot() });
    this.phase = 'won';
    this.stars = starsFor(this.score.total, true, this.level.stars);
    events.push({ type: 'won', stars: this.stars, score: this.score.total });
    return events;
  }
}
