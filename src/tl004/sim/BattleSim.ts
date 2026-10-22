import { MATERIALS } from '../config/Materials.ts';
import type { MaterialId } from '../config/Materials.ts';
import { ATTACKER, KNOCKOUT, PHYSICS, SHOT, SLING, STEP_MS, TARGET, WORLD } from '../config/Tuning.ts';
import { ABILITY, ABILITY_GRACE_STEPS, PARTNER_ABILITY } from '../config/Abilities.ts';
import type { AbilityId } from '../config/Abilities.ts';
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
  restitution: number;
  friction: number;
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
    setMass(body: SimBody, mass: number): void;
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
  /** Extra art scale (split cards are smaller). */
  artScale?: number;
}

export type Phase = 'aiming' | 'flying' | 'won' | 'lost';

export type SimEvent =
  | { type: 'impact'; x: number; y: number; strength: number; material: MaterialId | 'ground' | 'attacker'; attackerId?: number }
  | { type: 'cracked'; id: number }
  | { type: 'break'; id: number; kind: PieceKind; material?: MaterialId; shapeId?: string; x: number; y: number; angle: number; vx: number; points: number }
  | { type: 'launch'; shot: number; id: number }
  | { type: 'ability'; ability: AbilityId; id: number; x: number; y: number; extraIds: number[]; /** Horizontal travel direction (+1 right, -1 left). */ dir: number }
  | { type: 'shotEnd'; chainBonus: number }
  | { type: 'ready'; shot: number }
  | { type: 'bonus'; index: number; points: number }
  | { type: 'won'; stars: number; score: number }
  | { type: 'lost'; score: number };

/** Replay of one shot: launch step and velocity, plus the step the ability was used (if any). */
export interface LaunchRecord { step: number; vx: number; vy: number; abilityStep?: number }

interface Hit { strength: number; source: Point }

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
  /** Step of the active partner's first contact (the ability stays usable for a moment after it). */
  firstImpactStep: number | undefined;
  /** Steps since the current shot was launched. */
  shotSteps = 0;
  /** The current shot's ability has been used. */
  abilityUsed = false;

  private readonly kit: MatterKit;
  private readonly engine: SimEngine;
  private readonly shapes: ShapeLibrary;
  private readonly ground: SimBody;
  private readonly impacts = new Map<string, ImpactRecord>();
  private readonly onCollision: (event: { pairs: SimPair[] }) => void;
  private quietSteps = 0;
  /** Breakthrough dash in progress until this step (破竹衝刺). */
  private dashUntil = -1;
  private dashVelocity: Point | undefined;
  /** 吉祥大翻滾 keeps rolling until this step, in this horizontal direction. */
  private rollUntil = -1;
  private rollDir = 1;
  /** Body of the partner using 辣勁彈跳 this shot. */
  private bouncy: SimBody | undefined;
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
    // Lost supports are handled by wakeTouchingMovers(); Matter's "collisionEnd" is not used because it also
    // fires when two touching bodies merely fall asleep, which would keep waking resting towers.
    kit.Events.on(engine, 'collisionStart', this.onCollision);
    this.presettle();
  }

  get shotsTotal(): number { return this.level.shots.length; }
  /** Partners still waiting, including the one on the sling while aiming. */
  get shotsLeft(): number { return this.phase === 'aiming' ? this.shotsTotal - this.shotIndex : Math.max(0, this.shotsTotal - this.shotIndex - 1); }
  get isLastShot(): boolean { return this.shotIndex + 1 >= this.shotsTotal; }
  /** No skipping the last shot: a slow collapse may still knock out the final 四十塊. */
  get canSkip(): boolean { return this.phase === 'flying' && !this.isLastShot && this.shotSteps >= SHOT.skipAfterSteps; }
  get currentShapeId(): string | undefined { return this.level.shots[this.shotIndex]; }
  /** One tap per shot: while the partner flies, or up to ABILITY_GRACE_STEPS after it first touches something. */
  get canUseAbility(): boolean {
    if (this.phase !== 'flying' || this.abilityUsed || this.activeAttackerId === undefined || !this.pieces.has(this.activeAttackerId)) return false;
    return this.firstImpactStep === undefined || this.stepCount - this.firstImpactStep <= ABILITY_GRACE_STEPS;
  }
  /** Share of the after-contact window left (1 while still flying free), for the HUD. */
  get abilityWindowLeft(): number {
    if (!this.canUseAbility) return 0;
    if (this.firstImpactStep === undefined) return 1;
    return Math.max(0, 1 - (this.stepCount - this.firstImpactStep) / ABILITY_GRACE_STEPS);
  }
  get currentAbility(): AbilityId | undefined {
    const id = this.phase === 'flying' ? this.level.shots[this.shotIndex] : this.currentShapeId;
    return id ? PARTNER_ABILITY[id] : undefined;
  }

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
    this.pieces.set(body.id, { id: body.id, kind: 'attacker', body, shapeId, w: shape.width, h: shape.height, anchor, hp: Infinity, maxHp: Infinity, cracked: false, artScale: 1 });
    this.launches.push({ step: this.stepCount, vx, vy });
    this.abilityUsed = false;
    this.dashUntil = -1;
    this.dashVelocity = undefined;
    this.rollUntil = -1;
    this.bouncy = undefined;
    this.phase = 'flying';
    this.shotSteps = 0;
    this.quietSteps = 0;
    this.activeAttackerId = body.id;
    this.activeHasImpacted = false;
    this.firstImpactStep = undefined;
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
    const dasher = this.dashing();
    if (dasher) this.dashVelocity = { ...dasher.body.velocity };
    this.driveRoll();
    this.kit.Engine.update(this.engine, STEP_MS);
    this.stepCount++;
    this.wakeTouchingMovers();
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
    for (const piece of this.pieces.values()) this.kit.Composite.remove(this.engine.world, piece.body);
    this.kit.Composite.remove(this.engine.world, this.ground);
    this.pieces.clear();
  }

  private addBlock(material: MaterialId, x: number, y: number, w: number, h: number, angle: number): void {
    const spec = MATERIALS[material];
    const body = this.kit.Bodies.rectangle(x, y, w, h, { density: spec.density, friction: spec.friction, frictionStatic: spec.frictionStatic, restitution: spec.restitution, angle, label: material, sleepThreshold: PHYSICS.sleepSteps });
    this.kit.Composite.add(this.engine.world, body);
    this.pieces.set(body.id, { id: body.id, kind: 'block', body, material, w, h, anchor: { x: 0, y: 0 }, hp: spec.hp, maxHp: spec.hp, cracked: false });
  }

  /** A 四十塊 with its real concave outline (TL001 collider data). */
  private addTarget(shapeId: string, x: number, y: number): void {
    const spec = MATERIALS.target;
    const shape = this.shapes.targets.get(shapeId) as ShapeDefinition;
    const outline = shape.outline.map((p) => ({ x: p.x * TARGET.scale, y: p.y * TARGET.scale }));
    const body = this.kit.Bodies.fromVertices(x, y, outline, {
      density: spec.density, friction: spec.friction, frictionStatic: spec.frictionStatic, restitution: spec.restitution, label: shapeId, sleepThreshold: PHYSICS.sleepSteps,
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
    const strongest = new Map<number, Hit>();
    const dasher = this.dashing();
    let pierced = false;
    for (const impact of this.impacts.values()) {
      const pa = this.pieces.get(impact.a.id), pb = this.pieces.get(impact.b.id);
      for (const piece of [pa, pb]) {
        if (!piece || piece.kind === 'attacker' || !piece.material || piece.knockedOutAt !== undefined) continue;
        const from = piece === pa ? impact.b : impact.a;
        if (dasher && from === dasher.body && (piece.material === 'wood' || piece.material === 'glass')) {
          // 破竹衝刺 punches straight through planks and glass.
          piece.hp = 0;
          pierced = true;
        } else {
          const factor = this.bouncy && from === this.bouncy ? ABILITY.bounce.damageFactor : 1;
          piece.hp -= damageFrom(impact.strength * factor, MATERIALS[piece.material]);
        }
        if (piece.kind === 'target' && (strongest.get(piece.id)?.strength ?? -1) < impact.strength) {
          strongest.set(piece.id, { strength: impact.strength, source: from.isStatic ? impact.point : from.position });
        }
        if (!piece.cracked && piece.hp > 0 && piece.hp <= piece.maxHp / 2) {
          piece.cracked = true;
          events.push({ type: 'cracked', id: piece.id });
        }
      }
      const attacker = [pa, pb].find((piece) => piece?.kind === 'attacker');
      if (attacker && attacker.id === this.activeAttackerId) this.markImpact();
      if (dasher && attacker === dasher) {
        const other = attacker === pa ? pb : pa;
        // The dash ends on stone, the ground or a 四十塊.
        if (!other || other.material === 'stone' || other.kind === 'target') this.dashUntil = -1;
      }
      if (impact.strength >= SHOT.impactEventMin) {
        const other = attacker === pa ? pb : pa;
        const material = other?.material ?? (other?.kind === 'attacker' ? 'attacker' : 'ground');
        events.push({ type: 'impact', x: impact.point.x, y: impact.point.y, strength: impact.strength, material, attackerId: attacker?.id });
      }
    }
    this.resolveDamage(strongest, events);
    if (pierced && dasher && this.dashVelocity && this.pieces.has(dasher.id)) {
      const keep = ABILITY.dash.keepAfterPierce;
      this.kit.Body.setVelocity(dasher.body, { x: this.dashVelocity.x * keep, y: this.dashVelocity.y * keep });
    }
  }

  /** Remove broken blocks and knock out 四十塊 whose durability ran out. */
  private resolveDamage(strongest: ReadonlyMap<number, Hit>, events: SimEvent[]): void {
    for (const piece of [...this.pieces.values()]) {
      if (piece.kind === 'attacker' || piece.knockedOutAt !== undefined || piece.hp > 0) continue;
      if (piece.kind === 'target') this.knockOut(piece, strongest.get(piece.id), events);
      else this.removePiece(piece, events);
    }
  }

  private dashing(): Piece | undefined {
    if (this.stepCount >= this.dashUntil || this.activeAttackerId === undefined) return undefined;
    return this.pieces.get(this.activeAttackerId);
  }

  /** Tap during flight: use the current partner's ability (once per shot, before its first contact). */
  activateAbility(): SimEvent[] {
    if (!this.canUseAbility) return [];
    const piece = this.pieces.get(this.activeAttackerId as number) as Piece;
    const ability = PARTNER_ABILITY[piece.shapeId as string];
    if (!ability) return [];
    this.abilityUsed = true;
    const launch = this.launches.at(-1);
    if (launch) launch.abilityStep = this.shotSteps;
    const { body } = piece;
    const at = { x: body.position.x, y: body.position.y };
    const heading = this.heading(body);
    const dir = heading.x < 0 ? -1 : 1;
    const events: SimEvent[] = [];
    const extraIds: number[] = [];
    if (ability === 'firework') {
      events.push({ type: 'ability', ability, id: piece.id, x: at.x, y: at.y, extraIds, dir });
      this.removePiece(piece, events);
      this.explode(at, events);
      return events;
    }
    this.kit.Sleeping.set(body, false);
    if (ability === 'dash') {
      this.kit.Body.setVelocity(body, { x: heading.x * ABILITY.dash.speed, y: heading.y * ABILITY.dash.speed });
      this.dashUntil = this.stepCount + ABILITY.dash.duration;
    } else if (ability === 'split') {
      extraIds.push(...this.splitCards(piece));
    } else if (ability === 'bounce') {
      for (const part of body.parts) { part.restitution = ABILITY.bounce.restitution; part.friction = ABILITY.bounce.friction; }
      this.bouncy = body;
      this.kit.Body.setVelocity(body, { x: body.velocity.x * ABILITY.bounce.boost, y: body.velocity.y * ABILITY.bounce.boost });
    } else if (ability === 'slam') {
      this.kit.Body.setMass(body, body.mass * ABILITY.slam.massFactor);
      this.kit.Body.setVelocity(body, { x: 0, y: ABILITY.slam.speed });
      this.kit.Body.setAngularVelocity(body, 0);
    } else if (ability === 'roll') {
      const { massFactor, speed, dive, duration } = ABILITY.roll;
      this.kit.Body.setMass(body, body.mass * massFactor);
      this.kit.Body.setVelocity(body, { x: dir * speed, y: Math.max(body.velocity.y, dive) });
      this.rollDir = dir;
      this.rollUntil = this.stepCount + duration;
    } else if (ability === 'wave') {
      this.wash(at, dir);
      const ride = Math.max(Math.abs(body.velocity.x), ABILITY.wave.ride);
      this.kit.Body.setVelocity(body, { x: dir * ride, y: body.velocity.y });
    }
    events.unshift({ type: 'ability', ability, id: piece.id, x: at.x, y: at.y, extraIds, dir });
    return events;
  }

  private markImpact(): void {
    this.activeHasImpacted = true;
    this.firstImpactStep ??= this.stepCount;
  }

  /**
   * Unit direction the partner is travelling. After a hit it may be nearly still or bouncing back,
   * so fall back to the direction it was fired.
   */
  private heading(body: SimBody): Point {
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed >= 3) return { x: body.velocity.x / speed, y: body.velocity.y / speed };
    const launch = this.launches.at(-1);
    const length = launch ? Math.hypot(launch.vx, launch.vy) : 0;
    return launch && length ? { x: launch.vx / length, y: launch.vy / length } : { x: 1, y: 0 };
  }

  /** 吉祥大翻滾: keep spinning and pushing forward until the roll runs out. */
  private driveRoll(): void {
    if (this.stepCount >= this.rollUntil || this.activeAttackerId === undefined) return;
    const roller = this.pieces.get(this.activeAttackerId);
    if (!roller) { this.rollUntil = -1; return; }
    const { body } = roller;
    const { speed, accel, spin } = ABILITY.roll;
    if (body.isSleeping) this.kit.Sleeping.set(body, false);
    const forward = body.velocity.x * this.rollDir;
    if (forward < speed) this.kit.Body.setVelocity(body, { x: this.rollDir * Math.min(speed, forward + accel), y: body.velocity.y });
    this.kit.Body.setAngularVelocity(body, this.rollDir * spin);
  }

  /**
   * 山澗激流: a band of water ahead of the partner pushes blocks and 四十塊 forward (no direct damage:
   * the knocks they take while tumbling do the work). Stone blocks the water for whatever is behind it.
   */
  private wash(at: Point, dir: number): void {
    const w = ABILITY.wave;
    const reached: { piece: Piece; ahead: number }[] = [];
    for (const piece of this.pieces.values()) {
      if (piece.kind === 'attacker' || piece.knockedOutAt !== undefined || !piece.material) continue;
      const ahead = (piece.body.position.x - at.x) * dir;
      const dy = piece.body.position.y - at.y;
      if (ahead < -w.behind || ahead > w.length || dy < -w.above || dy > w.below) continue;
      reached.push({ piece, ahead });
    }
    const stones = reached.filter(({ piece }) => piece.material === 'stone');
    for (const { piece, ahead } of reached) {
      const { body } = piece;
      const y = body.position.y;
      const shielded = stones.some((stone) => stone.piece !== piece && stone.ahead < ahead && stone.piece.body.bounds.min.y <= y && stone.piece.body.bounds.max.y >= y);
      if (shielded) continue;
      const falloff = 1 - (Math.max(0, ahead) / w.length) * (1 - w.farShare);
      const kick = w.push * falloff * (piece.material === 'stone' ? w.stoneShare : 1);
      this.kit.Sleeping.set(body, false);
      this.kit.Body.setVelocity(body, { x: body.velocity.x + dir * kick, y: body.velocity.y - kick * w.lift });
    }
  }

  /** 煙火爆炸: push and damage everything nearby, fading with distance. */
  private explode(center: Point, events: SimEvent[]): void {
    const { radius, push, strength } = ABILITY.firework;
    const strongest = new Map<number, Hit>();
    for (const piece of this.pieces.values()) {
      if (piece.kind === 'attacker' || piece.knockedOutAt !== undefined || !piece.material) continue;
      const dx = piece.body.position.x - center.x, dy = piece.body.position.y - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const falloff = 1 - distance / radius;
      const ux = distance > 1 ? dx / distance : 0, uy = distance > 1 ? dy / distance : -1;
      this.kit.Sleeping.set(piece.body, false);
      this.kit.Body.setVelocity(piece.body, { x: piece.body.velocity.x + ux * push * falloff, y: piece.body.velocity.y + uy * push * falloff });
      const hit = strength * falloff;
      piece.hp -= damageFrom(hit, MATERIALS[piece.material]);
      if (piece.kind === 'target') strongest.set(piece.id, { strength: hit, source: center });
    }
    this.resolveDamage(strongest, events);
  }

  /** 三張牌分身: two smaller cards fan out above and below the original. */
  private splitCards(piece: Piece): number[] {
    const { body } = piece;
    const shape = this.shapes.attackers.get(piece.shapeId as string) as ShapeDefinition;
    const { spread, scale, offset } = ABILITY.split;
    const speed = Math.hypot(body.velocity.x, body.velocity.y) || 1;
    const nx = -body.velocity.y / speed, ny = body.velocity.x / speed;
    const outline = shape.outline.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const ids: number[] = [];
    for (const side of [-1, 1]) {
      const angle = side * spread;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const card = this.kit.Bodies.fromVertices(body.position.x + nx * offset * side, body.position.y + ny * offset * side, outline.map((p) => ({ ...p })), {
        density: ATTACKER.density, friction: ATTACKER.friction, frictionStatic: ATTACKER.frictionStatic,
        frictionAir: ATTACKER.frictionAir, restitution: ATTACKER.restitution, label: piece.shapeId,
      }, true, 0, 0);
      const anchor = anchorFor(card, minOf(outline));
      this.kit.Body.setInertia(card, compoundInertia(card.position, card.parts.slice(1)));
      this.kit.Body.setVelocity(card, { x: body.velocity.x * cos - body.velocity.y * sin, y: body.velocity.x * sin + body.velocity.y * cos });
      this.kit.Body.setAngle(card, body.angle);
      this.kit.Composite.add(this.engine.world, card);
      this.pieces.set(card.id, { id: card.id, kind: 'attacker', body: card, shapeId: piece.shapeId, w: shape.width * scale, h: shape.height * scale, anchor, hp: Infinity, maxHp: Infinity, cracked: false, artScale: scale });
      ids.push(card.id);
    }
    return ids;
  }

  /**
   * A 四十塊 is out: score it now, then kick it away from what hit it (always upward) and let physics carry it
   * off screen. It stops colliding, so the flight never disturbs the tower.
   */
  private knockOut(piece: Piece, hit: Hit | undefined, events: SimEvent[]): void {
    const { body } = piece;
    piece.knockedOutAt = this.stepCount;
    this.targetsLeft--;
    const points = this.scoring && this.phase !== 'won' && this.phase !== 'lost' ? this.score.addBreak(MATERIALS.target.score, this.stepCount) : 0;
    events.push({ type: 'break', id: piece.id, kind: 'target', material: 'target', shapeId: piece.shapeId, x: body.position.x, y: body.position.y, angle: body.angle, vx: body.velocity.x, points });
    this.wakeAround(body);
    body.collisionFilter.mask = 0;
    for (const part of body.parts) part.collisionFilter.mask = 0;
    this.kit.Sleeping.set(body, false);
    const source = hit ? hit.source : { x: body.position.x - 1, y: body.position.y + 1 };
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
      if (piece.id === this.activeAttackerId) this.markImpact();
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

  /**
   * Any sleeping body touching (or within a few px of) something that is moving wakes up.
   * Matter reports "collision end" for two sleeping bodies when they fall asleep, not when a support later
   * slides away, so a sleeping 四十塊 on a plank knocked out from below would otherwise hang in the air.
   */
  private wakeTouchingMovers(): void {
    const margin = PHYSICS.wakeMargin;
    for (const mover of this.pieces.values()) {
      const body = mover.body;
      if (body.isSleeping || mover.knockedOutAt !== undefined) continue;
      if (body.speed < PHYSICS.wakeSpeed && body.angularSpeed < PHYSICS.wakeAngularSpeed) continue;
      const { min, max } = body.bounds;
      for (const other of this.pieces.values()) {
        if (other === mover || !other.body.isSleeping || other.knockedOutAt !== undefined) continue;
        const b = other.body.bounds;
        if (b.max.x < min.x - margin || b.min.x > max.x + margin || b.max.y < min.y - margin || b.min.y > max.y + margin) continue;
        this.kit.Sleeping.set(other.body, false);
      }
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
