import { BASE_SPEED, MAX_SPEED_MULTIPLIER, SPEED_RAMP_MAX_SECONDS, SPEED_RAMP_MIN_SECONDS, SPEED_STEP_SECONDS, speedMultiplierAt, scoreMultiplier, runnerScore } from './RunnerScore.ts';
import { RHYTHM_GATE, gateCueLeadForMultiplier, gateCueStart, gateJudgement, gateWindowForMultiplier } from './RunnerGate.ts';
import type { RhythmGate } from './RunnerGate.ts';

/** Logical pixels and seconds. Phaser only presents this fixed-step simulation. */
export const RUNNER = Object.freeze({
  worldWidth: 960, height: 540, groundY: 410, playerX: 150, playerWidth: 44, playerHeight: 30,
  obstacleEntryMargin: 36,
  baseSpeed: BASE_SPEED, maxSpeed: BASE_SPEED * MAX_SPEED_MULTIPLIER, jumpVelocity: -640, doubleJumpVelocity: -730,
  gravity: 2200, fallMultiplier: 1.75, fallMultiplierSpeedIncrease: 0.0625,
  postHangGravitySpeedIncrease: 0.04, apexHangGravityMultiplier: 0, apexVelocity: 80,
  apexHangDuration: 0.08, apexHangSpeedReduction: 0.25,
  jumpHoldDuration: 10 / 120, doubleJumpHoldDuration: 0, jumpHoldGravityMultiplier: 0.5,
  jumpBuffer: 0.12, coyoteTime: 0.09, platformEdgeGap: 10, platformEdgeInset: 4,
  fixedStep: 1 / 120, distanceScale: 0.05,
  coinRadius: 70, maxCoins: 64,
});
export type ObstacleKind = 'box' | 'cone' | 'lamp';
export const OBSTACLES = Object.freeze([
  { kind: 'cone' as const, width: 42, height: 58, label: '交通錐' },
  { kind: 'box' as const, width: 54, height: 48, label: '紙箱' },
  { kind: 'lamp' as const, width: 40, height: 148, label: '路燈' },
]);
export interface Obstacle { id: number; kind: ObstacleKind; x: number; width: number; height: number }
export interface Platform { id: number; x: number; width: number; height: number }
export interface Coin { id: number; x: number; y: number; value: number }
export interface CoinPickup extends Coin { serial: number }
export type RunPhase = 'ready' | 'running' | 'over';

const LEVEL_UP_GLYPHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  L: ['100', '100', '100', '100', '111'],
  E: ['111', '100', '110', '100', '111'],
  V: ['101', '101', '101', '101', '010'],
  U: ['101', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
});
/** A deterministic, collectible coin sign that enters from the right edge. */
export function levelUpCoinPattern(x: number, y: number, spacing = 18): Coin[] {
  const coins: Coin[] = [];
  let column = 0;
  for (const letter of 'LEVEL UP') {
    if (letter === ' ') { column += 2; continue; }
    const glyph = LEVEL_UP_GLYPHS[letter];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '1') coins.push({ id: -1, x: x + (column + col) * spacing, y: y + row * spacing, value: 1 });
      }
    }
    column += 4;
  }
  return coins;
}

/** Suppress hazard entries only one second before and after a LEVEL UP sign enters. */
export function levelUpSpawnSafeUntil(seconds: number, upcomingAt: number, previousAt?: number): number | undefined {
  const time = Math.max(0, seconds);
  const maxSteps = (MAX_SPEED_MULTIPLIER - 1) / 0.5;
  const lastMilestone = maxSteps * SPEED_STEP_SECONDS;
  if (upcomingAt <= lastMilestone && time >= upcomingAt - 1 && time < upcomingAt + 1) return upcomingAt + 1;
  if (previousAt !== undefined && time >= previousAt - 1 && time < previousAt + 1) return previousAt + 1;
  return undefined;
}

export function speedAt(seconds: number): number {
  return BASE_SPEED * speedMultiplierAt(seconds);
}
export function challengeIntervalRange(seconds: number): readonly [number, number] {
  if (seconds < 60) return [3, 3.5];
  if (seconds < 120) return [2.5, 3];
  if (seconds < 180) return [2, 2.5];
  if (seconds < 240) return [1.75, 2.25];
  return [1.5, 2.25];
}
export function sampleChallengeInterval(seconds: number, random: () => number = Math.random): number {
  const [min, max] = challengeIntervalRange(seconds);
  const sample = Math.min(1 - Number.EPSILON, Math.max(0, random()));
  return min + (max - min) * sample;
}
export class JumpMotor {
  y = 0;
  velocity = 0;
  grounded = true;
  jumpsUsed = 0;
  private buffer = 0;
  private coyote: number = RUNNER.coyoteTime;
  private jumpHeld = false;
  private holdRemaining = 0;
  private apexHangRemaining = 0;
  private apexHangTriggered = false;
  private releasedBeforeTakeoff = false;
  edgeOffsetX = 0;
  press(): void { this.buffer = RUNNER.jumpBuffer; this.jumpHeld = true; this.releasedBeforeTakeoff = false; }
  release(): void {
    if (this.buffer > 0) this.releasedBeforeTakeoff = true;
    this.jumpHeld = false; this.holdRemaining = 0;
  }
  clearInput(): void { this.buffer = 0; this.releasedBeforeTakeoff = false; this.release(); }

  private consumeJump(): boolean {
    if (this.buffer <= 0) return false;
    const firstJump = this.grounded || this.coyote > 0;
    if (!firstJump && this.jumpsUsed >= 2) return false;
    this.jumpsUsed = firstJump ? 1 : this.jumpsUsed + 1;
    this.velocity = firstJump ? RUNNER.jumpVelocity : RUNNER.doubleJumpVelocity;
    this.holdRemaining = firstJump ? RUNNER.jumpHoldDuration : RUNNER.doubleJumpHoldDuration;
    this.apexHangRemaining = 0; this.apexHangTriggered = false;
    if (this.releasedBeforeTakeoff) {
      this.holdRemaining = 0; this.releasedBeforeTakeoff = false;
    }
    this.grounded = false; this.coyote = 0; this.buffer = 0;
    return true;
  }

  /** One-way platforms only catch downward crossings from above their top. */
  step(dt: number, supportY: number | null = 0, speedMultiplier = 1): { jumped: boolean; landed: boolean } {
    const difficulty = clampValue(speedMultiplier, 1, MAX_SPEED_MULTIPLIER) - 1;
    this.buffer = Math.max(0, this.buffer - dt);
    if (this.grounded && (supportY === null || Math.abs(this.y - supportY) > 0.01)) this.grounded = false;
    this.coyote = this.grounded ? RUNNER.coyoteTime : Math.max(0, this.coyote - dt);
    // Walking off an edge spends the ground jump after the coyote window.
    if (!this.grounded && this.coyote <= 0) this.jumpsUsed = Math.max(1, this.jumpsUsed);
    let jumped = this.consumeJump();
    let landed = false;
    if (!this.grounded) {
      const previousY = this.y;
      let gravityScale = 1;
      if (this.velocity > 0) {
        gravityScale = RUNNER.fallMultiplier + difficulty * RUNNER.fallMultiplierSpeedIncrease;
        this.apexHangRemaining = 0;
      } else {
        if (!this.apexHangTriggered && this.velocity > -RUNNER.apexVelocity) {
          this.apexHangTriggered = true;
          this.apexHangRemaining = RUNNER.apexHangDuration
            * Math.max(0, 1 - difficulty * RUNNER.apexHangSpeedReduction);
        }
        if (this.apexHangRemaining > 0) {
          gravityScale = RUNNER.apexHangGravityMultiplier;
          this.apexHangRemaining = Math.max(0, this.apexHangRemaining - dt);
        } else if (this.jumpHeld && this.holdRemaining > 0) {
          gravityScale = RUNNER.jumpHoldGravityMultiplier;
          this.holdRemaining = Math.max(0, this.holdRemaining - dt);
        } else if (this.apexHangTriggered) {
          gravityScale = 1 + difficulty * RUNNER.postHangGravitySpeedIncrease;
        }
      }
      this.velocity += RUNNER.gravity * gravityScale * dt;
      this.y += this.velocity * dt;
      if (supportY !== null && previousY <= supportY + 0.01 && this.y >= supportY && this.velocity >= 0) {
        this.y = supportY; this.velocity = 0; this.grounded = true; this.jumpsUsed = 0;
        this.coyote = RUNNER.coyoteTime; landed = true;
        jumped = this.consumeJump() || jumped;
      }
    }
    return { jumped, landed };
  }
}

export class RunnerModel {
  phase: RunPhase = 'ready';
  motor = new JumpMotor();
  elapsed = 0;
  travel = 0;
  speed: number = RUNNER.baseSpeed;
  obstacles: Obstacle[] = [];
  platforms: Platform[] = [];
  gates: RhythmGate[] = [];
  coins: Coin[] = [];
  levelUpCoins: Coin[] = [];
  pickups: CoinPickup[] = [];
  coinsCollected = 0;
  collision?: ObstacleKind | 'gate';
  gateFailure?: 'early' | 'late' | 'missed';
  gatesOpened = 0;
  jumps = 0;
  landings = 0;
  platformLandings = 0;
  private nextId = 0;
  private accumulator = 0;
  private nextChallengeAt = 0;
  private nextSpeedUpgradeAt = SPEED_STEP_SECONDS;
  private lastSpeedUpgradeAt?: number;
  private previousChallenge = '';
  private gatePending = false;
  private nextGateOpportunityAt: number = RHYTHM_GATE.firstAfter;
  private readonly speedRamps: number[] = [];
  viewportWidth: number;
  viewportLeft = 0;
  private readonly random: () => number;
  constructor(viewportWidth = RUNNER.worldWidth, random: () => number = Math.random) {
    this.viewportWidth = viewportWidth; this.random = random;
  }
  get distance(): number { return Math.floor(this.travel * RUNNER.distanceScale); }
  get multiplier(): number { return scoreMultiplier(this.speed); }
  get score(): number { return runnerScore(this.distance, this.coinsCollected, this.multiplier); }
  get activeGate(): RhythmGate | undefined {
    return this.gates.find((gate) => !gate.opened && this.elapsed >= gateCueStart(gate) - 1e-9);
  }
  reset(): void {
    this.phase = 'ready'; this.motor = new JumpMotor();
    this.speedRamps.length = 0;
    for (let i = 0; i < 8; i++) this.speedRamps.push(SPEED_RAMP_MIN_SECONDS + this.random() * (SPEED_RAMP_MAX_SECONDS - SPEED_RAMP_MIN_SECONDS));
    this.elapsed = 0; this.travel = 0; this.speed = this.speedAt(0);
    this.obstacles.length = 0; this.platforms.length = 0; this.gates.length = 0; this.coins.length = 0; this.levelUpCoins.length = 0; this.pickups.length = 0;
    this.gateFailure = undefined; this.gatesOpened = 0;
    this.gatePending = false; this.nextGateOpportunityAt = RHYTHM_GATE.firstAfter;
    this.coinsCollected = 0; this.collision = undefined; this.nextId = 0; this.previousChallenge = '';
    this.accumulator = 0; this.jumps = 0; this.landings = 0; this.platformLandings = 0;
    this.nextSpeedUpgradeAt = SPEED_STEP_SECONDS;
    this.lastSpeedUpgradeAt = undefined;
    this.nextChallengeAt = sampleChallengeInterval(0, this.random);
  }
  start(): void {
    this.reset(); this.phase = 'running';
    this.coinLine(RUNNER.playerX + 180, 5, RUNNER.groundY - 34, 45);
  }
  private speedAt(seconds: number): number {
    return BASE_SPEED * speedMultiplierAt(seconds, this.speedRamps);
  }
  /** One input: jumping normally, timing the door while its cue is active. */
  jump(): void {
    if (this.phase !== 'running') return;
    const gate = this.activeGate;
    if (!gate) { this.motor.press(); return; }
    if (gate.pendingFailure || gate.pendingOpen) { this.motor.clearInput(); return; }
    const judgement = gateJudgement(gate, this.elapsed);
    if (judgement === 'safe') { this.motor.press(); return; }
    this.motor.clearInput();
    if (judgement === 'early') { this.failGate('early'); return; }
    if (judgement === 'late') { gate.pendingFailure = 'late'; return; }
    gate.pendingOpen = true;
  }
  releaseJump(): void { this.motor.release(); }
  private failGate(reason: 'early' | 'late' | 'missed'): void {
    this.gateFailure = reason; this.collision = 'gate'; this.phase = 'over'; this.clearInput();
  }
  clearInput(): void { this.motor.clearInput(); this.accumulator = 0; }
  advance(seconds: number): void {
    if (this.phase !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.accumulator += Math.min(seconds, 0.1);
    while (this.accumulator + 1e-10 >= RUNNER.fixedStep && this.phase === 'running') {
      this.accumulator -= RUNNER.fixedStep; this.step(RUNNER.fixedStep);
    }
  }

  private coinLine(x: number, count: number, y: number, gap = 45): void {
    for (let i = 0; i < count && this.coins.length < RUNNER.maxCoins; i++) {
      this.coins.push({ id: this.nextId++, x: x + i * gap, y, value: 1 });
    }
  }
  private spawnPattern(x: number): boolean {
    // A door gets its own stretch of road, after the previous jump/landing.
    // At x5 it can start off-screen; cue timing is sampled when the door is spawned.
    const left = RUNNER.playerX - RUNNER.playerWidth / 2;
    const clearRoad = this.motor.grounded && this.motor.y === 0
      && !this.obstacles.some((item) => item.x + item.width > left - 32)
      && !this.platforms.some((item) => item.x + item.width > left - 32);
    if (!this.gatePending && this.elapsed >= this.nextGateOpportunityAt && this.previousChallenge !== 'gate'
      && (this.random() < 0.25 || this.elapsed >= this.nextGateOpportunityAt + 8)) this.gatePending = true;
    if (this.gatePending) {
      // Once selected, wait for a landing rather than endlessly replacing the
      // door with ordinary hazards on wide screens whose entry lead is longer.
      if (!clearRoad) return false;
      const right = RUNNER.playerX + RUNNER.playerWidth / 2;
      const lead = Math.max(RHYTHM_GATE.leadSeconds, (x - right) / this.speed + 0.08);
      const arrivalAt = this.elapsed + lead;
      // Do not compete with the LEVEL UP cue (including the approach to it).
      const nextSign = this.nextSpeedUpgradeAt;
      if (arrivalAt + 1 < nextSign || nextSign > 8 * SPEED_STEP_SECONDS) {
        let travel = 0;
        for (let time = 0; time < lead; time += RUNNER.fixedStep) {
          const step = Math.min(RUNNER.fixedStep, lead - time);
          travel += this.speedAt(this.elapsed + time + step) * step;
        }
        this.gates.push({ id: this.nextId++, x: right + travel, width: RHYTHM_GATE.width,
          height: RHYTHM_GATE.height, arrivalAt, opened: false,
          windowSeconds: gateWindowForMultiplier(this.speed / RUNNER.baseSpeed),
          cueLeadSeconds: gateCueLeadForMultiplier(this.speed / RUNNER.baseSpeed) });
        this.previousChallenge = 'gate';
        this.gatePending = false; this.nextGateOpportunityAt = this.elapsed + 12;
        this.nextChallengeAt = Math.max(this.nextChallengeAt, arrivalAt);
        this.coinLine(right + travel + RHYTHM_GATE.width + 100, 5, RUNNER.groundY - 34);
        return true;
      }
      this.gatePending = false; this.nextGateOpportunityAt = nextSign + 1;
    }
    let width: number;
    if (this.previousChallenge !== 'platform' && this.random() < 0.25) {
      width = 250;
      const height = this.random() < 0.5 ? 76 : 100;
      this.platforms.push({ id: this.nextId++, x, width, height });
      this.coinLine(x + 28, 5, RUNNER.groundY - height - 32, 46);
      this.coinLine(x - 145, 3, RUNNER.groundY - 72, 44);
      this.previousChallenge = 'platform';
    } else {
      const choices = OBSTACLES.filter((candidate) => candidate.kind !== this.previousChallenge);
      const definition = choices[Math.floor(this.random() * choices.length)];
      width = definition.width;
      this.obstacles.push({ ...definition, x, id: this.nextId++ });
      const y = RUNNER.groundY - (definition.height > 100 ? 198 : 83);
      this.coinLine(x - 65, 4, y, 43);
      this.previousChallenge = definition.kind;
    }
    this.coinLine(x + width + 210, 7, RUNNER.groundY - 34, 44);
    return true;
  }

  private step(dt: number): void {
    this.elapsed += dt; this.speed = this.speedAt(this.elapsed);
    const movement = this.speed * dt; this.travel += movement;
    for (const obstacle of this.obstacles) obstacle.x -= movement;
    for (const platform of this.platforms) platform.x -= movement;
    for (const gate of this.gates) gate.x -= movement;
    for (const coin of this.coins) coin.x -= movement;
    for (const coin of this.levelUpCoins) coin.x -= movement;
    const entranceX = this.viewportWidth + RUNNER.obstacleEntryMargin;
    const maxSpeedUps = (MAX_SPEED_MULTIPLIER - 1) / 0.5;
    while (this.nextSpeedUpgradeAt <= this.elapsed && this.nextSpeedUpgradeAt / SPEED_STEP_SECONDS <= maxSpeedUps) {
      this.lastSpeedUpgradeAt = this.nextSpeedUpgradeAt;
      this.levelUpCoins.push(...levelUpCoinPattern(entranceX, RUNNER.groundY - 206)
        .map((coin) => ({ ...coin, id: this.nextId++ })));
      this.nextSpeedUpgradeAt += SPEED_STEP_SECONDS;
    }
    const timeFromEdgeToRunner = Math.max(0, (entranceX - RUNNER.playerX) / this.speed);
    while (this.nextChallengeAt <= this.elapsed + timeFromEdgeToRunner) {
      if (this.gates.some((gate) => gate.x + gate.width > RUNNER.playerX - RUNNER.playerWidth / 2 - 32)) {
        this.nextChallengeAt = this.elapsed + timeFromEdgeToRunner + 0.5;
        break;
      }
      // Challenges are scheduled by their arrival time at the runner, then
      // introduced earlier at the far edge. Protect both moments around the
      // sign so a pre-spawned obstacle cannot arrive during the LEVEL UP beat.
      const spawnSafeUntil = levelUpSpawnSafeUntil(this.elapsed, this.nextSpeedUpgradeAt, this.lastSpeedUpgradeAt);
      const arrivalSafeUntil = levelUpSpawnSafeUntil(this.nextChallengeAt, this.nextSpeedUpgradeAt, this.lastSpeedUpgradeAt);
      const safeUntil = spawnSafeUntil === undefined ? arrivalSafeUntil
        : arrivalSafeUntil === undefined ? spawnSafeUntil : Math.max(spawnSafeUntil, arrivalSafeUntil);
      if (safeUntil !== undefined) {
        // Keep the sign's entry beat clear, then let the next hazard enter at the edge.
        this.nextChallengeAt = Math.max(this.nextChallengeAt, safeUntil + timeFromEdgeToRunner + RUNNER.fixedStep);
        break;
      }
      // Keep the challenge's scheduled arrival time while always introducing it
      // just beyond the right edge, rather than placing it partway into view.
      if (!this.spawnPattern(entranceX)) {
        this.nextChallengeAt = this.elapsed + timeFromEdgeToRunner + 0.1;
        break;
      }
      this.nextChallengeAt += sampleChallengeInterval(this.nextChallengeAt, this.random);
    }
    const objectCullLeft = this.viewportLeft - 60;
    const coinCullLeft = this.viewportLeft - 30;
    this.compact(this.obstacles, (item) => item.x + item.width > objectCullLeft);
    this.compact(this.platforms, (item) => item.x + item.width > objectCullLeft);
    this.compact(this.gates, (item) => item.x + item.width > objectCullLeft);
    this.compact(this.levelUpCoins, (coin) => coin.x > coinCullLeft);
    let playerX = RUNNER.playerX + this.motor.edgeOffsetX;
    let left = playerX - RUNNER.playerWidth / 2, right = playerX + RUNNER.playerWidth / 2;
    const gate = this.activeGate;
    if (gate && !gate.pendingFailure && !gate.pendingOpen && gateJudgement(gate, this.elapsed) === 'late') gate.pendingFailure = 'missed';
    let supportY = 0;
    for (const platform of this.platforms) {
      const top = -platform.height;
      let overlaps = right > platform.x && left < platform.x + platform.width;
      if (!overlaps && !this.motor.grounded && this.motor.velocity >= 0
        && this.motor.y >= top - 12 && this.motor.y <= top + 0.01) {
        let correction = 0;
        if (platform.x >= right && platform.x - right <= RUNNER.platformEdgeGap) {
          correction = platform.x + RUNNER.platformEdgeInset - right;
        } else if (left >= platform.x + platform.width
          && left - (platform.x + platform.width) <= RUNNER.platformEdgeGap) {
          correction = platform.x + platform.width - RUNNER.platformEdgeInset - left;
        }
        const maxCorrection = RUNNER.platformEdgeGap + RUNNER.platformEdgeInset;
        correction = clampValue(this.motor.edgeOffsetX + correction, -maxCorrection, maxCorrection) - this.motor.edgeOffsetX;
        if (correction !== 0) {
          this.motor.edgeOffsetX += correction;
          playerX += correction; left += correction; right += correction;
          overlaps = right > platform.x && left < platform.x + platform.width;
        }
      }
      if (overlaps && this.motor.y <= top + 0.01 && top < supportY) supportY = top;
    }
    const motion = this.motor.step(dt, supportY, this.speed / RUNNER.baseSpeed);
    if (motion.landed && supportY === 0) this.motor.edgeOffsetX = 0;
    if (motion.jumped) this.jumps++;
    if (motion.landed) { this.landings++; if (this.motor.y < -1) this.platformLandings++; }
    const feet = RUNNER.groundY + this.motor.y;
    playerX = RUNNER.playerX + this.motor.edgeOffsetX;
    left = playerX - RUNNER.playerWidth / 2; right = playerX + RUNNER.playerWidth / 2;
    for (const door of this.gates) {
      if (!door.opened && right > door.x && left < door.x + door.width
        && feet > RUNNER.groundY - door.height && feet - RUNNER.playerHeight < RUNNER.groundY) {
        if (door.pendingOpen) {
          door.opened = true; door.openedAt = this.elapsed;
          if (door.pendingOpen) this.gatesOpened++;
          continue;
        }
        this.failGate(door.pendingFailure ?? 'missed'); return;
      }
    }
    for (const obstacle of this.obstacles) {
      if (right > obstacle.x && left < obstacle.x + obstacle.width
        && feet > RUNNER.groundY - obstacle.height && feet - RUNNER.playerHeight < RUNNER.groundY) {
        this.phase = 'over'; this.collision = obstacle.kind; this.clearInput(); break;
      }
    }
    if (this.phase !== 'running') return;
    this.collectCoins(this.coins, feet, playerX);
    this.collectCoins(this.levelUpCoins, feet, playerX);
  }
  private collectCoins(coins: Coin[], feet: number, playerX: number): void {
    this.compact(coins, (coin) => {
      if (coin.x < this.viewportLeft - 30) return false;
      const dx = coin.x - playerX, dy = coin.y - (feet - 32);
      if (dx * dx + dy * dy > RUNNER.coinRadius ** 2) return true;
      this.coinsCollected += coin.value;
      if (this.pickups.length < RUNNER.maxCoins) this.pickups.push({ ...coin, serial: this.coinsCollected });
      else { const last = this.pickups[this.pickups.length - 1]; last.value += coin.value; last.serial = this.coinsCollected; }
      return false;
    });
  }
  private compact<T>(items: T[], keep: (item: T) => boolean): void {
    let write = 0;
    for (let read = 0; read < items.length; read++) if (keep(items[read])) items[write++] = items[read];
    items.length = write;
  }
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
