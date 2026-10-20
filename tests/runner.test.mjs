import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, JumpMotor, RUNNER, OBSTACLES, speedAt, challengeIntervalRange, sampleChallengeInterval, levelUpCoinPattern, levelUpSpawnSafeUntil } from '../src/tl002/RunnerModel.ts';
import { SPEED_STEP_SECONDS, speedMultiplierAt } from '../src/tl002/RunnerScore.ts';
import { gateJudgement } from '../src/tl002/RunnerGate.ts';
import { RunnerLeaderboard, RUNNER_BOARD_KEY } from '../src/tl002/RunnerLeaderboard.ts';

function stepMotor(motor, seconds, support = 0) {
  for (let t = 0; t < seconds - 1e-8; t += RUNNER.fixedStep) motor.step(RUNNER.fixedStep, support);
}
function seeded(seed) {
  let state = seed;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function entry(id, distance, elapsedMilliseconds = 10000) {
  return { id, distance, elapsedMilliseconds, coins: 12, multiplier: 1, createdAt: '2026-10-18T09:00:00.000Z' };
}
function play(model, seconds, fps = 60, observe = () => {}) {
  let releaseJumpAt = Infinity;
  let firstJumpAt = null;
  const pressJump = (hold = 0.04) => {
    if (model.motor.grounded && model.motor.jumpsUsed === 0) firstJumpAt = model.elapsed;
    model.jump(); releaseJumpAt = model.elapsed + hold;
  };
  for (let frame = 0; frame < seconds * fps; frame++) {
    if (model.elapsed >= releaseJumpAt) { model.releaseJump(); releaseJumpAt = Infinity; }
    if (model.motor.grounded && model.motor.jumpsUsed === 0) firstJumpAt = null;
    const gate = model.activeGate;
    const obstacle = model.obstacles.find((o) => o.x + o.width > RUNNER.playerX - RUNNER.playerWidth / 2);
    const platform = model.platforms.find((p) => p.x + p.width > RUNNER.playerX - RUNNER.playerWidth / 2);
    if (gate) {
      if (gateJudgement(gate, model.elapsed) === 'open') model.jump();
    }
    if (!gate && model.motor.grounded) {
      const edge = RUNNER.playerX + RUNNER.playerWidth / 2;
      if (platform && model.motor.y === 0 && (!obstacle || platform.x < obstacle.x)
        && platform.x - edge <= model.speed * 0.30) pressJump(0.04);
      else if (obstacle && obstacle.x - edge <= model.speed * (obstacle.height > 100 ? 0.36 : 0.17)) {
        pressJump(obstacle.height > 100 ? RUNNER.jumpHoldDuration : 0.04);
      }
    } else if (!gate && obstacle?.height > 100 && model.motor.jumpsUsed === 1 && firstJumpAt !== null
      && model.elapsed - firstJumpAt >= 0.24 - (model.speed / RUNNER.baseSpeed - 1) * 0.0075 - 1e-6
      && obstacle.x - (RUNNER.playerX + RUNNER.playerWidth / 2) <= model.speed * 0.18) {
      // The first jump peaks below the lamp; spend the shorter second jump late in the arc.
      model.jump(); firstJumpAt = null;
    }
    model.advance(1 / fps);
    model.pickups.length = 0;
    observe(model);
    if (model.phase !== 'running') return false;
    assert.ok(model.coins.length <= RUNNER.maxCoins && model.levelUpCoins.length <= 62);
    assert.ok(model.obstacles.length <= 3 && model.platforms.length <= 2);
    assert.ok(model.gates.length <= 1);
  }
  return true;
}

test('TL002 speed increases every 30 seconds with a short ramp and caps at x5', () => {
  assert.equal(SPEED_STEP_SECONDS, 30);
  const multiplier = [0, 29.99, 30, 33.75, 37.5, 59.99, 60, 67.5, 239.99, 240, 247.5, 900].map((t) => speedMultiplierAt(t));
  assert.deepEqual(multiplier.slice(0, 3), [1, 1, 1]);
  assert.ok(multiplier[3] > 1 && multiplier[3] < 1.5);
  assert.equal(multiplier[4], 1.5); assert.equal(multiplier[5], 1.5); assert.equal(multiplier[6], 1.5); assert.equal(multiplier[7], 2);
  assert.equal(multiplier[8], 4.5); assert.equal(multiplier[9], 4.5); assert.equal(multiplier[10], 5); assert.equal(multiplier[11], 5);
  const speeds = [0, 30, 60, 120, 240, 480, 900].map(speedAt);
  assert.deepEqual([...speeds].sort((a, b) => a - b), speeds); assert.equal(speedAt(900), RUNNER.maxSpeed);
  for (const duration of [5, 7.5, 10]) {
    assert.equal(speedMultiplierAt(30 + duration, [duration]), 1.5);
    assert.ok(speedMultiplierAt(30 + duration / 2, [duration]) > 1);
    assert.ok(speedMultiplierAt(30 + duration / 2, [duration]) < 1.5);
  }
});
test('TL002 operation challenges use the requested random time windows', () => {
  assert.deepEqual(challengeIntervalRange(0), [3, 3.5]);
  assert.deepEqual(challengeIntervalRange(59.99), [3, 3.5]);
  assert.deepEqual(challengeIntervalRange(60), [2.5, 3]);
  assert.deepEqual(challengeIntervalRange(119.99), [2.5, 3]);
  assert.deepEqual(challengeIntervalRange(120), [2, 2.5]);
  assert.deepEqual(challengeIntervalRange(179.99), [2, 2.5]);
  assert.deepEqual(challengeIntervalRange(180), [1.75, 2.25]);
  assert.deepEqual(challengeIntervalRange(239.99), [1.75, 2.25]);
  assert.deepEqual(challengeIntervalRange(240), [1.5, 2.25]);
  for (const seconds of [0, 60, 120, 180, 240, 600]) for (let seed = 0; seed < 20; seed++) {
    const interval = sampleChallengeInterval(seconds, seeded(seed));
    const [min, max] = challengeIntervalRange(seconds);
    assert.ok(interval >= min && interval <= max);
  }
});
test('TL002 only pauses hazard entry around a LEVEL UP sign and spells the words in real coins', () => {
  assert.equal(levelUpSpawnSafeUntil(28.99, 30), undefined);
  assert.equal(levelUpSpawnSafeUntil(29, 30), 31);
  assert.equal(levelUpSpawnSafeUntil(30, 60, 30), 31);
  assert.equal(levelUpSpawnSafeUntil(30.999, 60, 30), 31);
  assert.equal(levelUpSpawnSafeUntil(31, 60, 30), undefined);
  assert.equal(levelUpSpawnSafeUntil(59, 60, 30), 61);
  assert.equal(levelUpSpawnSafeUntil(60.999, 90, 60), 61);
  assert.equal(levelUpSpawnSafeUntil(61, 90, 60), undefined);
  const letters = levelUpCoinPattern(1000, 200);
  assert.equal(letters.length, 62);
  assert.ok(Math.min(...letters.map((coin) => coin.x)) === 1000);
  assert.ok(Math.max(...letters.map((coin) => coin.x)) < 1000 + 33 * 18);
  assert.equal(Math.max(...letters.map((coin) => coin.y)) - Math.min(...letters.map((coin) => coin.y)), 4 * 18);
  assert.ok(letters.every((coin) => coin.value === 1));
});
test('TL002 hazards resume one second after the sign while speed is still rising', () => {
  const model = new RunnerModel(RUNNER.worldWidth, () => 0); model.start();
  model.speedRamps.fill(5); model.elapsed = 29.995; model.nextChallengeAt = 30;
  model.advance(1 / 120);
  assert.equal(model.obstacles.length + model.platforms.length, 0);
  assert.equal(model.levelUpCoins.length, 62);
  for (let i = 0; i < 0.9 * 120; i++) model.advance(1 / 120);
  assert.equal(model.obstacles.length + model.platforms.length, 0);
  while (model.elapsed < 31.2 && model.phase === 'running') model.advance(1 / 120);
  assert.ok(model.obstacles.length + model.platforms.length + model.gates.length > 0);
  assert.ok(model.elapsed < 35, 'hazards return while the five-second speed ramp is active');
});
test('TL002 a challenge planned to arrive during LEVEL UP is delayed before edge spawn', () => {
  const model = new RunnerModel(RUNNER.worldWidth, () => 0); model.start();
  model.speedRamps.fill(5); model.elapsed = 27.35; model.nextChallengeAt = 30;
  model.advance(1 / 120);
  assert.equal(model.obstacles.length + model.platforms.length, 0,
    'a challenge due to reach the runner at 30 seconds is not pre-spawned at the edge');
  assert.ok(model.nextChallengeAt > 33, 'the delayed challenge is scheduled after the sign window and edge travel time');
});
test('TL002 LEVEL UP sign coins use normal collection and pickup effects', () => {
  const model = new RunnerModel(RUNNER.worldWidth, () => 0); model.start();
  model.coins.length = 0;
  model.levelUpCoins.push({ id: 999, x: RUNNER.playerX, y: RUNNER.groundY - 32, value: 1 });
  model.advance(1 / 120);
  assert.equal(model.coinsCollected, 1);
  assert.equal(model.pickups.length, 1);
  assert.equal(model.pickups[0].value, 1);
  assert.equal(model.levelUpCoins.length, 0);
});
test('TL002 hazards enter from the current responsive right edge', () => {
  for (const viewportWidth of [680, RUNNER.worldWidth, 1240]) {
    const model = new RunnerModel(viewportWidth, () => 0); model.start();
    model.nextChallengeAt = 0;
    model.advance(1 / 120);
    const first = [...model.obstacles, ...model.platforms][0];
    assert.ok(first, 'the earliest scheduled challenge is prepared before it reaches the runner');
    assert.equal(first.x, viewportWidth + RUNNER.obstacleEntryMargin);
    model.advance(0.1); model.advance(0.1);
    const moved = [...model.obstacles, ...model.platforms].find((item) => item.id === first.id);
    assert.ok(moved && moved.x < viewportWidth, 'the challenge enters from the right edge and moves into view');
    assert.equal(model.viewportWidth, viewportWidth);

    const upgrade = new RunnerModel(viewportWidth, () => 0); upgrade.start();
    upgrade.elapsed = 29.995; upgrade.nextChallengeAt = 60; upgrade.advance(1 / 120);
    assert.equal(Math.min(...upgrade.levelUpCoins.map((coin) => coin.x)), viewportWidth + RUNNER.obstacleEntryMargin,
      'the collectible LEVEL UP sign also begins beyond the visible edge');
  }
});

test('TL002 zoomed-out left viewport keeps obstacles, platforms, gates and coins until off-screen', () => {
  const model = new RunnerModel(); model.start(); model.advance(0.01);
  model.viewportLeft = -150; // x5 with a 960px logical viewport and the runner anchored at x150.
  model.obstacles.push({ ...OBSTACLES[0], id: 8001, x: -175 });
  model.platforms.push({ id: 8002, x: -170, width: 250, height: 76 });
  model.gates.push({ id: 8003, x: -190, width: 72, height: 238, arrivalAt: 100,
    opened: true, openedAt: 0, windowSeconds: 0.2, cueLeadSeconds: 0.6 });
  model.coins.push({ id: 8004, x: -165, y: RUNNER.groundY - 32, value: 1 });
  model.levelUpCoins.push({ id: 8005, x: -160, y: RUNNER.groundY - 32, value: 1 });
  model.advance(RUNNER.fixedStep);
  assert.ok(model.obstacles.some((item) => item.id === 8001), 'a hazard still visible at the left edge is retained');
  assert.ok(model.platforms.some((item) => item.id === 8002), 'a platform still visible at the left edge is retained');
  assert.ok(model.gates.some((item) => item.id === 8003), 'a gate still visible at the left edge is retained');
  assert.ok(model.coins.some((item) => item.id === 8004), 'a visible coin is not culled early');
  assert.ok(model.levelUpCoins.some((item) => item.id === 8005), 'visible level-up coins are not culled early');

  model.obstacles.push({ ...OBSTACLES[0], id: 8011, x: -500 });
  model.platforms.push({ id: 8012, x: -500, width: 250, height: 76 });
  model.gates.push({ id: 8013, x: -500, width: 72, height: 238, arrivalAt: 100,
    opened: true, openedAt: 0, windowSeconds: 0.2, cueLeadSeconds: 0.6 });
  model.coins.push({ id: 8014, x: -500, y: RUNNER.groundY - 32, value: 1 });
  model.levelUpCoins.push({ id: 8015, x: -500, y: RUNNER.groundY - 32, value: 1 });
  model.advance(RUNNER.fixedStep);
  assert.ok(!model.obstacles.some((item) => item.id === 8011));
  assert.ok(!model.platforms.some((item) => item.id === 8012));
  assert.ok(!model.gates.some((item) => item.id === 8013));
  assert.ok(!model.coins.some((item) => item.id === 8014));
  assert.ok(!model.levelUpCoins.some((item) => item.id === 8015));
});
test('TL002 one jump has a readable apex and faster descent', () => {
  const motor = new JumpMotor(); motor.press();
  let peak = 0, ascent = 0, descent = 0;
  for (let i = 0; i < 100; i++) {
    motor.step(RUNNER.fixedStep); peak = Math.min(peak, motor.y);
    if (motor.velocity < 0) ascent += RUNNER.fixedStep; else if (!motor.grounded) descent += RUNNER.fixedStep;
    if (i > 3 && motor.grounded) break;
  }
  assert.ok(peak < -120 && peak > -132, `the first-jump ceiling is lowered but still clears low obstacles (peak=${peak})`);
  assert.ok(descent < ascent);
});
test('TL002 holding jump raises higher; releasing ends the extra height boost', () => {
  function peakHeight(holdSeconds) {
    const motor = new JumpMotor(); motor.press(); motor.step(RUNNER.fixedStep);
    const heldSteps = Math.floor(holdSeconds / RUNNER.fixedStep);
    for (let i = 0; i < heldSteps; i++) motor.step(RUNNER.fixedStep);
    motor.release();
    let peak = motor.y;
    for (let i = 0; i < 240 && !motor.grounded; i++) {
      motor.step(RUNNER.fixedStep); peak = Math.min(peak, motor.y);
    }
    return -peak;
  }
  const tap = peakHeight(0), held = peakHeight(RUNNER.jumpHoldDuration);
  assert.ok(held > tap + 20, `holding should add a visible height difference after the apex hang (tap=${tap}, held=${held})`);
  assert.ok(tap >= OBSTACLES.find((obstacle) => obstacle.kind === 'cone').height + 8,
    `a short tap clears the tallest low obstacle (tap=${tap})`);
  assert.ok(held < OBSTACLES.find((obstacle) => obstacle.kind === 'lamp').height,
    `even a full first-jump hold stays below the high obstacle (held=${held})`);
});
test('TL002 first and second jumps rise the same height while their combined ceiling stays unchanged', () => {
  function firstJumpPeak() {
    const motor = new JumpMotor(); motor.press();
    let peak = 0;
    for (let i = 0; i < 240; i++) {
      motor.step(RUNNER.fixedStep); peak = Math.min(peak, motor.y);
      if (i > 0 && motor.grounded) break;
    }
    return -peak;
  }
  const motor = new JumpMotor(); motor.press();
  for (let i = 0; i < Math.round(0.16 / RUNNER.fixedStep); i++) motor.step(RUNNER.fixedStep);
  const secondTakeoffY = motor.y;
  motor.press(); motor.step(RUNNER.fixedStep);
  let secondPeakY = motor.y;
  for (let i = 0; i < 240 && motor.velocity < 0; i++) {
    motor.step(RUNNER.fixedStep); secondPeakY = Math.min(secondPeakY, motor.y);
  }
  const firstHeight = firstJumpPeak(), secondHeight = secondTakeoffY - secondPeakY;
  assert.ok(secondHeight >= firstHeight * 0.95 && secondHeight <= firstHeight * 1.05,
    `first and second jump heights should match (first=${firstHeight}, second=${secondHeight})`);
  assert.ok(Math.abs(firstHeight + secondHeight - 249.7) <= 5,
    `the sum of both jump rises should stay near its previous ceiling (first=${firstHeight}, second=${secondHeight})`);
});
test('TL002 the first jump alone cannot clear the high hazard, but the second jump can at x1 and x5', () => {
  function crosses(kind, speed, hold, approachSeconds, doubleJumpAt = Infinity) {
    const obstacle = OBSTACLES.find((item) => item.kind === kind);
    const motor = new JumpMotor(); motor.press();
    const playerLeft = RUNNER.playerX - RUNNER.playerWidth / 2;
    const playerRight = RUNNER.playerX + RUNNER.playerWidth / 2;
    let x = playerRight + speed * approachSeconds, overlapped = false, collided = false;
    for (let i = 0; i < 240 && x + obstacle.width > playerLeft; i++) {
      motor.step(RUNNER.fixedStep, 0, speed / RUNNER.baseSpeed); x -= speed * RUNNER.fixedStep;
      if ((hold === 0 && i === 0) || (hold > 0 && (i + 1) * RUNNER.fixedStep >= hold)) motor.release();
      const overlap = x < playerRight && x + obstacle.width > playerLeft;
      if (overlap) overlapped = true;
      const feet = RUNNER.groundY + motor.y;
      const collision = feet > RUNNER.groundY - obstacle.height
        && feet - RUNNER.playerHeight < RUNNER.groundY;
      if (overlap && collision) collided = true;
      if (kind === 'lamp' && !motor.grounded && (i + 1) * RUNNER.fixedStep >= doubleJumpAt && motor.jumpsUsed === 1) motor.press();
    }
    assert.equal(overlapped, true);
    return !collided;
  }
  for (const speed of [RUNNER.baseSpeed, RUNNER.maxSpeed]) {
    assert.equal(crosses('cone', speed, 0, 0.17), true);
    assert.equal(crosses('box', speed, 0, 0.17), true);
    assert.equal(crosses('lamp', speed, RUNNER.jumpHoldDuration, 0.33), false,
      `first jump alone must not clear the lamp at speed ${speed}`);
    assert.equal(crosses('lamp', speed, RUNNER.jumpHoldDuration, 0.33, 0.24), true,
      `second jump must clear the lamp at speed ${speed}`);
  }
});
test('TL002 the apex has an extended hang and descent remains faster than ascent', () => {
  const apex = new JumpMotor(); apex.grounded = false; apex.jumpsUsed = 1; apex.y = -90; apex.velocity = -50;
  const before = apex.velocity; apex.step(RUNNER.fixedStep);
  assert.ok(apex.velocity - before < RUNNER.gravity * RUNNER.fixedStep,
    'gravity is suspended near the apex to create a longer hang');
  assert.ok(apex.apexHangRemaining > RUNNER.apexHangDuration - RUNNER.fixedStep * 1.1,
    'the dedicated hang timer remains active after entering the apex band');
  const falling = new JumpMotor(); falling.grounded = false; falling.jumpsUsed = 1; falling.y = -80; falling.velocity = 100;
  const fallBefore = falling.velocity; falling.step(RUNNER.fixedStep);
  assert.ok(falling.velocity - fallBefore > RUNNER.gravity * RUNNER.fixedStep);
});
test('TL002 gravity does not accumulate during the apex hang and resumes after it', () => {
  const motor = new JumpMotor(); motor.grounded = false; motor.jumpsUsed = 1; motor.y = -90; motor.velocity = -50;
  motor.step(RUNNER.fixedStep);
  assert.ok(motor.apexHangRemaining > 0, 'the motor entered its apex hang');
  const velocityDuringHang = motor.velocity;
  assert.equal(velocityDuringHang, -50, 'gravity does not accumulate while hanging');
  while (motor.apexHangRemaining > 0) {
    motor.step(RUNNER.fixedStep);
    assert.equal(motor.velocity, velocityDuringHang, 'vertical velocity stays suspended during the hang');
  }
  const beforeGravityResumes = motor.velocity;
  motor.step(RUNNER.fixedStep);
  assert.ok(motor.velocity > beforeGravityResumes, 'gravity starts accumulating again after the hang');
});
test('TL002 higher speed shortens the apex hang and strengthens gravity', () => {
  function sample(speedMultiplier) {
    const motor = new JumpMotor(); motor.grounded = false; motor.jumpsUsed = 1; motor.y = -90; motor.velocity = -50;
    motor.step(RUNNER.fixedStep, 0, speedMultiplier);
    const hangRemaining = motor.apexHangRemaining;
    while (motor.apexHangRemaining > 0) motor.step(RUNNER.fixedStep, 0, speedMultiplier);
    const beforeGravity = motor.velocity; motor.step(RUNNER.fixedStep, 0, speedMultiplier);
    const ascentGravity = motor.velocity - beforeGravity;
    const falling = new JumpMotor(); falling.grounded = false; falling.jumpsUsed = 1; falling.y = -10; falling.velocity = 100;
    const beforeFall = falling.velocity; falling.step(RUNNER.fixedStep, 0, speedMultiplier);
    return { hangRemaining, ascentGravity, fallGravity: falling.velocity - beforeFall };
  }
  const x1 = sample(1), x5 = sample(5);
  assert.ok(x5.hangRemaining < x1.hangRemaining, 'the high-speed apex hang is shorter');
  assert.equal(x5.hangRemaining, 0, 'x5 has no apex hang');
  assert.ok(x5.ascentGravity > x1.ascentGravity, 'post-hang variable gravity strengthens with speed');
  assert.ok(Math.abs(x5.ascentGravity / (RUNNER.gravity * RUNNER.fixedStep) - 1.16) < 1e-9,
    'x5 uses the faster post-hang gravity accumulation');
  assert.ok(x5.fallGravity > x1.fallGravity, 'fast descent strengthens with speed');
});
test('TL002 apex hang duration decreases linearly to zero from x1 through x5', () => {
  const expected = [0.08, 0.06, 0.04, 0.02, 0];
  for (let multiplier = 1; multiplier <= 5; multiplier++) {
    const motor = new JumpMotor(); motor.grounded = false; motor.jumpsUsed = 1; motor.y = -90; motor.velocity = -50;
    motor.step(RUNNER.fixedStep, 0, multiplier);
    const expectedRemaining = Math.max(0, expected[multiplier - 1] - RUNNER.fixedStep);
    assert.ok(Math.abs(motor.apexHangRemaining - expectedRemaining) < 1e-9,
      `x${multiplier} hang follows the linear duration curve`);
  }
});
test('TL002 double jump resets upward velocity exactly once; a third press cannot add height', () => {
  const motor = new JumpMotor(); motor.press(); stepMotor(motor, 0.16);
  motor.press(); assert.equal(motor.step(RUNNER.fixedStep).jumped, true); assert.equal(motor.jumpsUsed, 2);
  stepMotor(motor, 0.05); const before = motor.velocity;
  motor.press(); assert.equal(motor.step(RUNNER.fixedStep).jumped, false); assert.ok(motor.velocity > before);
  stepMotor(motor, 1.5); assert.equal(motor.grounded, true); assert.equal(motor.jumpsUsed, 0);
});
test('TL002 buffered third input near landing becomes the next ground jump', () => {
  const motor = new JumpMotor(); motor.press(); stepMotor(motor, 0.16); motor.press(); motor.step(RUNNER.fixedStep);
  while (!(motor.velocity > 0 && motor.y > -35)) motor.step(RUNNER.fixedStep);
  motor.press(); let fired = false;
  for (let i = 0; i < 14; i++) { const event = motor.step(RUNNER.fixedStep); if (event.jumped && event.landed) fired = true; }
  assert.equal(fired, true); assert.equal(motor.jumpsUsed, 1);
});
test('TL002 stale third input expires and cannot trigger an automatic landing jump', () => {
  const motor = new JumpMotor(); motor.press(); stepMotor(motor, 0.08); motor.press(); stepMotor(motor, 0.08);
  motor.press(); stepMotor(motor, 1.5); assert.equal(motor.grounded, true); assert.equal(motor.jumpsUsed, 0);
});
test('TL002 coyote time preserves the first jump; late ledge input spends the sole air jump', () => {
  const grace = new JumpMotor(); stepMotor(grace, 0.05, null); grace.press(); grace.step(RUNNER.fixedStep, null);
  assert.equal(grace.jumpsUsed, 1);
  const late = new JumpMotor(); stepMotor(late, 0.12, null); late.press(); late.step(RUNNER.fixedStep, null);
  assert.equal(late.jumpsUsed, 2); late.press(); assert.equal(late.step(RUNNER.fixedStep, null).jumped, false);
});
test('TL002 short and held first jumps clear ordinary obstacles but need the second jump for a lamp', () => {
  for (const speed of [RUNNER.baseSpeed, 480, RUNNER.maxSpeed]) {
    for (const obstacle of OBSTACLES) {
      const motor = new JumpMotor(), tall = obstacle.kind === 'lamp';
      let x = RUNNER.playerX + RUNNER.playerWidth / 2 + speed * (tall ? 0.33 : 0.15), time = 0, second = false;
      motor.press();
      while (x + obstacle.width > RUNNER.playerX - RUNNER.playerWidth / 2) {
        if (tall && time >= 0.24 && !second) { motor.press(); second = true; }
        motor.step(RUNNER.fixedStep); x -= speed * RUNNER.fixedStep; time += RUNNER.fixedStep;
        const overlap = x < RUNNER.playerX + RUNNER.playerWidth / 2 && x + obstacle.width > RUNNER.playerX - RUNNER.playerWidth / 2;
        assert.ok(!overlap || motor.y <= -obstacle.height, `${obstacle.kind}, speed=${speed}, y=${motor.y}, t=${time}`);
      }
    }
  }
  assert.ok(OBSTACLES.find((o) => o.kind === 'lamp').height > RUNNER.jumpVelocity ** 2 / (2 * RUNNER.gravity));
});
test('TL002 a short tap clears low obstacles while a held first jump still hits the streetlamp', () => {
  const shortTap = new RunnerModel(); shortTap.start(); shortTap.advance(0.01);
  shortTap.obstacles.length = 0;
  shortTap.obstacles.push({ ...OBSTACLES[2], id: 9998, x: RUNNER.playerX + 22 + shortTap.speed * 0.30 });
  shortTap.jump(); shortTap.advance(RUNNER.fixedStep); shortTap.releaseJump();
  for (let i = 0; i < 90 && shortTap.phase === 'running'; i++) shortTap.advance(1 / 120);
  assert.equal(shortTap.phase, 'over'); assert.equal(shortTap.collision, 'lamp');

  const held = new RunnerModel(); held.start(); held.advance(0.01);
  held.obstacles.length = 0;
  held.obstacles.push({ ...OBSTACLES[2], id: 9999, x: RUNNER.playerX + 22 + held.speed * 0.30 }); held.jump();
  for (let i = 0; i < 90 && held.phase === 'running'; i++) {
    if (i === 28) held.jump();
    held.advance(1 / 120);
  }
  assert.equal(held.phase, 'running'); assert.equal(held.collision, undefined);
});
test('TL002 platforms pass through from below, catch descending feet and reset both jumps', () => {
  const model = new RunnerModel(); model.start();
  model.platforms.push({ id: 999, x: 110, width: 250, height: 76 }); model.jump();
  let roseThrough = false;
  for (let i = 0; i < 100; i++) {
    model.advance(1 / 120);
    if (model.motor.y < -76 && model.motor.velocity < 0) { assert.equal(model.motor.grounded, false); roseThrough = true; }
    if (model.platformLandings) break;
  }
  assert.equal(roseThrough, true); assert.equal(model.platformLandings, 1);
  assert.equal(model.motor.y, -76); assert.equal(model.motor.jumpsUsed, 0);
  model.jump(); model.advance(1 / 120); assert.equal(model.motor.jumpsUsed, 1); assert.ok(model.motor.velocity < 0);
});
test('TL002 a narrow platform near-miss nudges the runner onto the platform edge', () => {
  for (const side of ['near', 'far']) {
    const model = new RunnerModel(); model.start();
    const width = 140, height = 76, top = -height;
    const playerLeft = RUNNER.playerX - RUNNER.playerWidth / 2;
    const playerRight = RUNNER.playerX + RUNNER.playerWidth / 2;
    const x = side === 'near'
      ? playerRight + 6
      : playerLeft - width - 6;
    model.platforms.push({ id: 991, x, width, height });
    model.motor.y = top - 8; model.motor.velocity = 300; model.motor.grounded = false; model.motor.jumpsUsed = 1;
    for (let i = 0; i < 12 && model.platformLandings === 0; i++) model.advance(RUNNER.fixedStep);
    assert.equal(model.platformLandings, 1, `${side} edge should catch after the small correction`);
    assert.ok(Math.abs(model.motor.edgeOffsetX) > 0 && Math.abs(model.motor.edgeOffsetX) <= RUNNER.platformEdgeGap + RUNNER.platformEdgeInset);
    assert.equal(model.motor.y, top);
  }
});
test('TL002 platform edge assist leaves a wider gap alone', () => {
  const model = new RunnerModel(); model.start();
  const height = 76, top = -height, playerRight = RUNNER.playerX + RUNNER.playerWidth / 2;
  model.platforms.push({ id: 992, x: playerRight + RUNNER.platformEdgeGap + 8, width: 140, height });
  model.motor.y = top - 5; model.motor.velocity = 120; model.motor.grounded = false; model.motor.jumpsUsed = 1;
  model.advance(RUNNER.fixedStep);
  assert.equal(model.motor.edgeOffsetX, 0);
  assert.equal(model.platformLandings, 0);
});
test('TL002 landing on a platform and walking off produces a fall with coyote time', () => {
  const model = new RunnerModel(); model.start(); model.motor.y = -76;
  model.platforms.push({ id: 999, x: 0, width: 137, height: 76 });
  for (let i = 0; i < 20 && model.motor.grounded; i++) model.advance(1 / 120);
  assert.equal(model.motor.grounded, false); model.jump(); model.advance(1 / 120); assert.equal(model.motor.jumpsUsed, 1);
});
test('TL002 random challenge patterns vary and never repeat the exact same type consecutively', () => {
  const model = new RunnerModel(960, seeded(9)); model.start();
  const seen = new Map();
  assert.equal(play(model, 100, 60, (state) => {
    for (const item of [...state.obstacles, ...state.platforms, ...state.gates]) if (!seen.has(item.id)) seen.set(item.id, 'arrivalAt' in item ? 'gate' : item.kind ?? 'platform');
  }), true);
  const kinds = [...seen.values()];
  assert.ok(kinds.includes('cone') && kinds.includes('box') && kinds.includes('lamp') && kinds.includes('platform'));
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1]);
  assert.ok(kinds.length >= 20);
});
test('TL002 36 seeded three-minute runs solve varied hazards and platforms at 30/60/120 FPS', () => {
  for (const fps of [30, 60, 120]) for (const width of [680, 960]) for (let seed = 1; seed <= 6; seed++) {
    const model = new RunnerModel(width, seeded(seed)); model.start();
    assert.equal(play(model, 180, fps), true, `hit ${model.collision}, fps=${fps}, width=${width}, seed=${seed}, t=${model.elapsed}`);
    assert.ok(model.platformLandings >= 4); assert.ok(model.coinsCollected > 100); assert.ok(model.distance > 4000);
  }
});
test('TL002 accelerated play remains solvable through the x5 cap and late challenge timing', () => {
  for (const fps of [30, 60, 120]) for (let seed = 11; seed <= 13; seed++) {
    const model = new RunnerModel(680, seeded(seed)); model.start();
    assert.equal(play(model, 510, fps), true, `hit ${model.collision}, fps=${fps}, seed=${seed}, t=${model.elapsed}`);
    assert.equal(model.multiplier, 5); assert.ok(model.platformLandings >= 4); assert.ok(model.gatesOpened > 0);
  }
});
test('TL002 nearby coins are collected once, queued once and counted before animation completes', () => {
  const model = new RunnerModel(); model.start();
  model.coins.length = 0; model.coins.push({ id: 999, x: RUNNER.playerX + 10, y: RUNNER.groundY - 32, value: 1 });
  model.advance(1 / 60); assert.equal(model.coinsCollected, 1); assert.equal(model.pickups.length, 1);
  assert.equal(model.pickups[0].value, 1); model.advance(1 / 60); assert.equal(model.coinsCollected, 1);
});
test('TL002 out-of-range coins are never sucked through the whole screen', () => {
  const model = new RunnerModel(); model.start(); model.coins.length = 0;
  model.coins.push({ id: 999, x: RUNNER.playerX, y: RUNNER.groundY - 220, value: 1 }); model.advance(1 / 120);
  assert.equal(model.coinsCollected, 0); assert.ok(model.coins.some((coin) => coin.id === 999));
});
test('TL002 a delayed renderer keeps a bounded pickup queue without losing coin value', () => {
  const model = new RunnerModel(); model.start(); model.coins.length = 0;
  for (let i = 0; i < 200; i++) {
    model.coins.push({ id: 100000 + i, x: RUNNER.playerX, y: RUNNER.groundY - 32, value: 1 });
    model.advance(1 / 120);
  }
  assert.equal(model.coinsCollected, 200); assert.equal(model.pickups.length, RUNNER.maxCoins);
  assert.equal(model.pickups.reduce((sum, coin) => sum + coin.value, 0), 200);
});
test('TL002 collision freezes score, coins and world; restart clears all round state', () => {
  const model = new RunnerModel(); model.start(); while (model.phase === 'running') model.advance(1 / 30);
  const frozen = JSON.stringify([model.elapsed, model.travel, model.coinsCollected, model.obstacles, model.platforms, model.coins]);
  for (let i = 0; i < 60; i++) { model.jump(); model.advance(0.1); }
  assert.equal(JSON.stringify([model.elapsed, model.travel, model.coinsCollected, model.obstacles, model.platforms, model.coins]), frozen);
  model.start(); assert.equal(model.distance, 0); assert.equal(model.coinsCollected, 0); assert.equal(model.pickups.length, 0);
  assert.equal(model.motor.jumpsUsed, 0); assert.equal(model.platformLandings, 0); assert.equal(model.collision, undefined);
});
test('TL002 fixed stepping gives identical scores across frame rates and bounds stalled frames', () => {
  const values = [30, 60, 120].map((fps) => {
    const model = new RunnerModel(960, seeded(5)); model.start();
    while (model.phase === 'running') model.advance(1 / fps);
    return [model.distance, Math.round(model.elapsed * 1000), model.coinsCollected];
  });
  assert.deepEqual(values[0], values[1]); assert.deepEqual(values[1], values[2]);
  const model = new RunnerModel(); model.start(); model.advance(30); assert.ok(model.elapsed <= 0.101);
});
test('TL002 retains the top 100 total scores, coin counts and elapsed-time tie ordering', () => {
  const saved = storage(), board = new RunnerLeaderboard(saved);
  for (let i = 0; i < 115; i++) board.save(entry(`r${i}`, i * 100)); board.save(entry('fast', 11400, 5000));
  const reload = new RunnerLeaderboard(saved); const top = reload.top();
  assert.equal(top.length, 100);
  assert.equal(reload.best, 11412); assert.equal(top[0].id, 'fast'); assert.equal(top[0].coins, 12);
  assert.equal(top[1].id, 'r114'); assert.equal(top.at(-1)?.id, 'r16');
});
test('TL002 older distance-only entries remain readable and duplicate saves do not duplicate a run', () => {
  const saved = storage(); const legacy = entry('old', 40); delete legacy.coins; delete legacy.multiplier;
  saved.setItem(RUNNER_BOARD_KEY, JSON.stringify([legacy]));
  const first = new RunnerLeaderboard(saved), second = new RunnerLeaderboard(saved);
  second.save(entry('new', 50)); second.save(entry('new', 50)); assert.equal(first.top().length, 2);
  assert.equal(first.top().find((row) => row.id === 'old').coins, undefined);
});
test('TL002 malformed storage and invalid coins never prevent session scoring', () => {
  const board = new RunnerLeaderboard({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(board.save(entry('session', 100)), 1); assert.equal(board.best, 112); assert.equal(board.persistent, false);
  for (const bad of [{ distance: -1 }, { distance: NaN }, { elapsedMilliseconds: -1 }, { coins: -1 }, { coins: 1.5 }, { score: NaN }, { multiplier: 5.1 }, { multiplier: 0 }, { createdAt: 'invalid' }])
    assert.equal(board.save({ ...entry('bad', 10), ...bad }), undefined);
});
