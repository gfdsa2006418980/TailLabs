import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RUNNER, speedAt } from '../src/tl002/RunnerModel.ts';
import { RHYTHM_GATE, gateCueWindow, gateJudgement, gateProgress, gateTarget, gateWindowForMultiplier } from '../src/tl002/RunnerGate.ts';

function fixture(elapsed = 0) {
  const model = new RunnerModel(680, () => 0); model.start();
  model.elapsed = elapsed; model.speed = speedAt(elapsed);
  model.nextChallengeAt = Infinity; model.nextSpeedUpgradeAt = Infinity;
  const lead = RHYTHM_GATE.leadSeconds + 0.15;
  const gate = { id: 999, x: RUNNER.playerX + RUNNER.playerWidth / 2 + model.speed * lead,
    width: RHYTHM_GATE.width, height: RHYTHM_GATE.height, arrivalAt: elapsed + lead, opened: false,
    windowSeconds: gateWindowForMultiplier(model.speed / RUNNER.baseSpeed) };
  model.gates.push(gate);
  return { model, gate };
}
function until(model, seconds, fps = 120) {
  while (model.elapsed + 1e-9 < seconds && model.phase === 'running') model.advance(1 / fps);
}

test('TL002 gate windows match the playtested x1–x5 values with smooth transitions', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(gateWindowForMultiplier), [0.75, 0.5, 0.4, 0.3, 0.2]);
  for (const [speed, seconds] of [[1.5, 0.625], [2.5, 0.45], [3.5, 0.35], [4.5, 0.25]])
    assert.ok(Math.abs(gateWindowForMultiplier(speed) - seconds) < 1e-9);
  assert.equal(gateWindowForMultiplier(-1), 0.75); assert.equal(gateWindowForMultiplier(20), 0.2);
  assert.equal(gateWindowForMultiplier(NaN), 0.75);
  let previous = 0.75;
  for (let i = 0; i <= 1000; i++) {
    const current = gateWindowForMultiplier(1 + i / 250);
    assert.ok(current <= previous && current >= 0.2 && current <= 0.75); previous = current;
  }
});

test('TL002 every difficulty has inclusive boundaries and an exactly matching green cue interval', () => {
  for (const multiplier of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
    const gate = { ...fixture().gate, windowSeconds: gateWindowForMultiplier(multiplier) };
    const target = gateTarget(gate), half = gate.windowSeconds / 2;
    const earlyStart = target - half - RHYTHM_GATE.earlyFailureSeconds;
    assert.equal(gateJudgement(gate, earlyStart - 0.001), 'safe');
    assert.equal(gateJudgement(gate, earlyStart), 'early');
    assert.equal(gateJudgement(gate, target - half - 0.001), 'early');
    assert.equal(gateJudgement(gate, target - half), 'open');
    assert.equal(gateJudgement(gate, target + half), 'open');
    assert.equal(gateJudgement(gate, target + half + 0.001), 'late');
    const cueStarts = gate.arrivalAt - RHYTHM_GATE.cueSeconds, cue = gateCueWindow(gate);
    assert.equal(gateProgress(gate, cueStarts), 0); assert.equal(gateProgress(gate, gate.arrivalAt), 1);
    assert.ok(Math.abs(cueStarts + cue.left * RHYTHM_GATE.cueSeconds - (target - half)) < 1e-9);
    assert.ok(Math.abs(cueStarts + (cue.left + cue.width) * RHYTHM_GATE.cueSeconds - (target + half)) < 1e-9);
    assert.ok(Math.abs(cueStarts + cue.earlyLeft * RHYTHM_GATE.cueSeconds - earlyStart) < 1e-9);
    assert.ok(Math.abs(cue.earlyWidth * RHYTHM_GATE.cueSeconds - 0.5) < 1e-9);
    assert.ok(Math.abs(cue.earlyLeft + cue.earlyWidth - cue.left) < 1e-9);
    assert.ok(Math.abs(cue.lateLeft - cue.left - cue.width) < 1e-9);
    assert.ok(Math.abs(cue.lateLeft + cue.lateWidth - 1) < 1e-9);
    assert.ok(cue.earlyLeft * RHYTHM_GATE.cueSeconds >= 0.425 - 1e-9, 'safe jumping is available after the cue first appears');
    assert.ok(target - half - cueStarts >= 0.8 - 1e-9, 'advance warning remains available');
    assert.ok(gate.arrivalAt - (target + half) >= 0.2 - 1e-9, 'opening can finish before physical passage');
  }
});

test('TL002 ordinary input jumps before the cue; input in the half-second early danger zone ends the run', () => {
  const { model, gate } = fixture();
  model.jump(); model.advance(RUNNER.fixedStep); assert.equal(model.jumps, 1);
  until(model, gateTarget(gate) - gate.windowSeconds / 2 - RHYTHM_GATE.earlyFailureSeconds + 0.05);
  const jumps = model.jumps; model.jump();
  assert.equal(model.phase, 'over'); assert.equal(model.collision, 'gate'); assert.equal(model.gateFailure, 'early');
  assert.equal(model.jumps, jumps); assert.equal(gate.opened, false);
});

test('TL002 the visible gray lead-in allows jumps without failing or opening the gate', () => {
  for (const fps of [20, 30, 60, 120]) for (const elapsed of [0, 45, 75, 105, 135, 165, 195, 225, 300]) {
    const { model, gate } = fixture(elapsed);
    until(model, gate.arrivalAt - RHYTHM_GATE.cueSeconds + 0.02, fps);
    assert.equal(model.activeGate, gate); assert.equal(gateJudgement(gate, model.elapsed), 'safe');
    model.jump(); model.advance(1 / fps);
    assert.equal(model.phase, 'running'); assert.equal(model.gateFailure, undefined);
    assert.equal(model.jumps, 1); assert.equal(gate.opened, false);
    until(model, gateTarget(gate), fps); model.jump();
    assert.equal(model.phase, 'running'); assert.equal(gate.opened, true);
  }
});

test('TL002 early failure freezes the run across all speed tiers and restart clears the failure', () => {
  for (const elapsed of [0, 45, 75, 105, 135, 165, 195, 225, 300]) {
    const { model, gate } = fixture(elapsed);
    const opensAt = gateTarget(gate) - gate.windowSeconds / 2;
    until(model, opensAt - 0.02); model.jump();
    assert.equal(model.phase, 'over'); assert.equal(model.gateFailure, 'early');
    assert.equal(gate.opened, false); assert.equal(model.jumps, 0);
    const frozen = JSON.stringify(model);
    for (let i = 0; i < 30; i++) { model.jump(); model.advance(0.1); }
    assert.equal(JSON.stringify(model), frozen);
    model.reset(); assert.equal(model.phase, 'ready'); assert.equal(model.gateFailure, undefined);
    model.start(); model.jump(); model.advance(RUNNER.fixedStep);
    assert.equal(model.phase, 'running'); assert.equal(model.jumps, 1); assert.equal(model.gateFailure, undefined);
  }
});

test('TL002 correctly timed input opens once, consumes no jump, and permits passage at x1 and x5', () => {
  for (const fps of [20, 30, 60, 120]) for (const elapsed of [0, 300]) {
    const { model, gate } = fixture(elapsed);
    until(model, gateTarget(gate), fps);
    model.jump(); assert.equal(gate.opened, true); assert.equal(model.gatesOpened, 1);
    assert.equal(model.jumps, 0); assert.equal(model.motor.jumpsUsed, 0);
    until(model, gate.arrivalAt + 0.7, fps);
    assert.equal(model.phase, 'running'); assert.equal(model.activeGate, undefined);
    assert.ok(gate.x + gate.width < RUNNER.playerX - RUNNER.playerWidth / 2);
  }
});

test('TL002 missed timing records a failure, keeps the world running and ends only at closed-door contact', () => {
  for (const fps of [20, 30, 60, 120]) for (const elapsed of [0, 45, 75, 105, 135, 165, 195, 225, 300]) {
    const { model, gate } = fixture(elapsed);
    until(model, gateTarget(gate) + gate.windowSeconds / 2 + 0.02, fps);
    assert.equal(model.phase, 'running'); assert.equal(gate.pendingFailure, 'missed');
    assert.equal(model.gateFailure, undefined); assert.equal(model.collision, undefined); assert.equal(gate.opened, false);
    assert.ok(gate.x > RUNNER.playerX + RUNNER.playerWidth / 2, 'runner has not reached the door');
    const before = { time: model.elapsed, travel: model.travel, score: model.score, coins: model.coinsCollected };
    model.coins.push({ id: 10000, x: RUNNER.playerX + 10, y: RUNNER.groundY - 32, value: 1 });
    model.jump(); model.advance(0.1);
    assert.equal(model.phase, 'running'); assert.equal(gate.opened, false); assert.equal(model.jumps, 0);
    assert.ok(model.elapsed > before.time && model.travel > before.travel && model.score > before.score);
    assert.ok(model.coinsCollected > before.coins);
    assert.equal(gate.pendingFailure, 'missed', 'late retry must preserve the original failure');
    until(model, gate.arrivalAt + 0.1, fps);
    assert.equal(model.phase, 'over'); assert.equal(model.collision, 'gate'); assert.equal(model.gateFailure, 'missed');
    assert.ok(gate.x < RUNNER.playerX + RUNNER.playerWidth / 2 && gate.x + gate.width > RUNNER.playerX - RUNNER.playerWidth / 2);
    assert.ok(model.elapsed >= gate.arrivalAt - 1e-8 && model.elapsed <= gate.arrivalAt + RUNNER.fixedStep + 1e-8);
    const frozen = JSON.stringify(model);
    model.jump(); model.advance(0.1); assert.equal(JSON.stringify(model), frozen);
  }
});

test('TL002 late input records its reason and cannot open the door before the eventual collision', () => {
  const { model, gate } = fixture();
  model.elapsed = gateTarget(gate) + gate.windowSeconds / 2 + 0.001;
  gate.x = RUNNER.playerX + RUNNER.playerWidth / 2 + model.speed * (gate.arrivalAt - model.elapsed);
  model.jump(); assert.equal(model.phase, 'running'); assert.equal(model.gateFailure, undefined);
  assert.equal(gate.pendingFailure, 'late'); assert.equal(gate.opened, false);
  model.jump(); model.advance(RUNNER.fixedStep);
  assert.equal(gate.pendingFailure, 'late'); assert.equal(gate.opened, false); assert.equal(model.jumps, 0);
  until(model, gate.arrivalAt + 0.1);
  assert.equal(model.phase, 'over'); assert.equal(model.gateFailure, 'late');
  model.reset(); assert.equal(model.gates.length, 0); assert.equal(model.gateFailure, undefined); assert.equal(model.gatesOpened, 0);
});

test('TL002 pausing keeps a pending missed-door failure, while restarting discards it', () => {
  const { model, gate } = fixture();
  until(model, gateTarget(gate) + gate.windowSeconds / 2 + 0.02);
  const frozen = JSON.stringify([gate, model.elapsed, model.travel]);
  model.clearInput(); model.clearInput();
  assert.equal(JSON.stringify([gate, model.elapsed, model.travel]), frozen);
  assert.equal(model.phase, 'running'); assert.equal(gate.pendingFailure, 'missed');
  model.start(); assert.equal(model.gates.length, 0); assert.equal(model.gateFailure, undefined);
  model.jump(); model.advance(RUNNER.fixedStep);
  assert.equal(model.phase, 'running'); assert.equal(model.jumps, 1);
});

test('TL002 clearing input for pause preserves the exact window and discards buffered jump', () => {
  const { model, gate } = fixture();
  until(model, gateTarget(gate));
  model.motor.press(); model.clearInput();
  const frozenTime = model.elapsed;
  // Paused/countdown presentation does not call advance; wall time is irrelevant.
  model.clearInput(); assert.equal(model.elapsed, frozenTime); assert.equal(gateJudgement(gate, model.elapsed), 'open');
  model.jump(); model.advance(RUNNER.fixedStep);
  assert.equal(gate.opened, true); assert.equal(model.jumps, 0);
});

test('TL002 generation reserves a separate road, full cue and recovery at every capped speed', () => {
  for (const width of [680, 960, 1240]) for (const elapsed of [12, 42, 72, 102, 132, 162, 192, 222, 252, 300]) {
    const model = new RunnerModel(width, () => 0); model.start();
    model.elapsed = elapsed; model.nextChallengeAt = elapsed;
    model.nextSpeedUpgradeAt = Math.ceil((elapsed + 0.01) / 30) * 30;
    model.advance(RUNNER.fixedStep);
    const gate = model.gates[0]; assert.ok(gate, `width=${width}, elapsed=${elapsed}`);
    assert.equal(gate.windowSeconds, gateWindowForMultiplier(model.speed / RUNNER.baseSpeed));
    assert.ok(gate.x >= width + RUNNER.obstacleEntryMargin - 0.001);
    assert.ok(gate.arrivalAt - model.elapsed >= RHYTHM_GATE.leadSeconds - 1e-9);
    assert.equal(model.obstacles.length + model.platforms.length, 0);
    until(model, gateTarget(gate)); model.jump();
    until(model, gate.arrivalAt);
    assert.equal(model.phase, 'running');
    const right = RUNNER.playerX + RUNNER.playerWidth / 2;
    assert.ok(gate.x <= right + 0.1 && gate.x >= right - model.speed * RUNNER.fixedStep - 0.1,
      `opening aligns with physical arrival during speed ramps: width=${width}, t=${elapsed}, x=${gate.x}`);
    until(model, gate.arrivalAt + 0.2);
    assert.equal(model.obstacles.length + model.platforms.length, 0, 'no competing jump while opening/passing');
  }
});

test('TL002 a generated gate keeps its timing and cue width while the world speeds up', () => {
  const model = new RunnerModel(680, () => 0); model.start();
  model.elapsed = 31; model.nextChallengeAt = 31; model.nextSpeedUpgradeAt = 60;
  model.advance(RUNNER.fixedStep);
  const gate = model.gates[0]; assert.ok(gate);
  const lockedWindow = gate.windowSeconds, lockedCue = gateCueWindow(gate);
  until(model, gateTarget(gate));
  assert.ok(gateWindowForMultiplier(model.speed / RUNNER.baseSpeed) < lockedWindow);
  assert.equal(gate.windowSeconds, lockedWindow); assert.deepEqual(gateCueWindow(gate), lockedCue);
  model.clearInput();
  assert.equal(gate.windowSeconds, lockedWindow);
  model.jump(); assert.equal(gate.opened, true); assert.equal(model.phase, 'running');
});

test('TL002 door generation waits for previous obstacle/platform and avoids LEVEL UP cues', () => {
  for (const type of ['obstacles', 'platforms']) {
    const model = new RunnerModel(680, () => 0); model.start();
    model.elapsed = 12; model.nextChallengeAt = 12;
    model[type].push({ id: 888, kind: 'box', x: 300, width: 250, height: 76 });
    model.advance(RUNNER.fixedStep); assert.equal(model.gates.length, 0);
  }
  const model = new RunnerModel(680, () => 0); model.start();
  model.elapsed = 27.9; model.nextChallengeAt = 27.9;
  model.advance(RUNNER.fixedStep); assert.equal(model.gates.length, 0);
});

test('TL002 a selected door reserves its turn on a wide screen until the runner lands', () => {
  const model = new RunnerModel(1240, () => 0); model.start();
  model.elapsed = 12; model.nextChallengeAt = 12;
  model.platforms.push({ id: 888, x: -100, width: 250, height: 76 });
  model.motor.y = -76; model.motor.grounded = true;
  model.advance(RUNNER.fixedStep);
  assert.equal(model.gates.length, 0); assert.equal(model.obstacles.length, 0);
  until(model, 13);
  assert.equal(model.phase, 'running'); assert.equal(model.motor.grounded, true);
  assert.equal(model.gates.length, 1, 'ordinary challenges do not starve a pending door');
  assert.equal(model.obstacles.length, 0);
  assert.ok(model.gates[0].arrivalAt - model.elapsed > RHYTHM_GATE.cueSeconds);
});
