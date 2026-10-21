import test from 'node:test';
import assert from 'node:assert/strict';
import { runnerScore, scoreMultiplier, speedMultiplierAt, BASE_SPEED } from '../src/tl002/RunnerScore.ts';
import { RunnerModel, RUNNER } from '../src/tl002/RunnerModel.ts';
import { RunnerLeaderboard, RUNNER_BOARD_KEY } from '../src/tl002/RunnerLeaderboard.ts';
import { RunnerCountdown } from '../src/tl002/RunnerCountdown.ts';
import { CoinFlightPool } from '../src/tl002/CoinFlight.ts';
import { RunnerAudio } from '../src/tl002/RunnerAudio.ts';
import { RunnerMusic } from '../src/tl002/RunnerMusic.ts';

test('TL002 score uses metres plus coins, the displayed multiplier, integer flooring and a x5 cap', () => {
  assert.equal(runnerScore(172, 25, 1.5), 295);
  assert.equal(runnerScore(172, 25, 5), 985);
  assert.equal(runnerScore(172, 25, 50), 985);
  assert.equal(scoreMultiplier(BASE_SPEED * 1.236), 1.24);
  const model = new RunnerModel(); model.start();
  model.travel = 172 / RUNNER.distanceScale; model.coinsCollected = 25; model.speed = BASE_SPEED * 1.5;
  assert.equal(model.multiplier, 1.5); assert.equal(model.score, 295);
});
test('TL002 speed reaches x5 after eight 30-second upgrades and never exceeds it', () => {
  assert.equal(speedMultiplierAt(0), 1); assert.equal(speedMultiplierAt(30), 1);
  assert.equal(speedMultiplierAt(37.5), 1.5); assert.equal(speedMultiplierAt(240), 4.5);
  assert.equal(speedMultiplierAt(247.5), 5); assert.equal(speedMultiplierAt(300), 5);
  assert.equal(speedMultiplierAt(36000), 5); assert.equal(RUNNER.maxSpeed / RUNNER.baseSpeed, 5);
  assert.equal(speedMultiplierAt(60), 1.5); assert.ok(speedMultiplierAt(63.75) > speedMultiplierAt(60));
  assert.equal(speedMultiplierAt(90), 2); assert.ok(speedMultiplierAt(93.75) > speedMultiplierAt(90));
});
test('TL002 title reset removes round state and refuses to advance until explicit start', () => {
  const model = new RunnerModel(); model.start(); model.advance(0.1); model.jump(); model.advance(0.1);
  model.reset(); model.advance(10); model.jump();
  assert.equal(model.phase, 'ready'); assert.equal(model.elapsed, 0); assert.equal(model.distance, 0);
  assert.equal(model.score, 0); assert.equal(model.coinsCollected, 0); assert.equal(model.motor.jumpsUsed, 0);
  assert.equal(model.coins.length + model.levelUpCoins.length + model.obstacles.length + model.platforms.length, 0);
  model.start(); assert.equal(model.phase, 'running'); assert.equal(model.coins.length, 5);
});

const row = (id, distance, coins, multiplier, elapsedMilliseconds = 10000) => ({
  id, distance, coins, multiplier, elapsedMilliseconds, createdAt: '2026-10-18T09:00:00Z',
});
test('TL002 ranking prioritizes score over distance and uses shorter time for tied scores', () => {
  const board = new RunnerLeaderboard();
  board.save(row('far', 1000, 0, 1)); board.save(row('rich', 500, 100, 3));
  assert.equal(board.top()[0].id, 'rich'); assert.equal(board.best, 1800);
  board.save(row('fast', 600, 0, 3, 5000)); assert.equal(board.top()[0].id, 'fast');
  assert.equal(board.top()[0].score, 1800);
});
test('TL002 legacy records retain their identity, use the old speed curve and persist alongside new scores', () => {
  const data = new Map(), store = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  store.setItem(RUNNER_BOARD_KEY, JSON.stringify([{ id: 'old', distance: 11452, coins: 2125,
    elapsedMilliseconds: 349700, createdAt: '2026-10-18T09:00:00Z' }]));
  const board = new RunnerLeaderboard(store);
  assert.equal(board.top()[0].multiplier, 2.25); assert.equal(board.top()[0].score, 30548);
  board.save(row('new', 10000, 0, 5));
  const reload = new RunnerLeaderboard(store);
  assert.deepEqual(reload.top().map(r => [r.id, r.score]), [['new', 50000], ['old', 30548]]);
});

test('TL002 countdown displays two seconds then START before permitting movement', () => {
  const countdown = new RunnerCountdown(); countdown.start(500);
  assert.equal(countdown.label(500), '2'); assert.equal(countdown.label(1499), '2');
  assert.equal(countdown.label(1500), '1'); assert.equal(countdown.label(2499), '1');
  assert.equal(countdown.label(2500), 'START'); assert.equal(countdown.label(2849), 'START');
  assert.equal(countdown.label(2850), undefined); assert.equal(countdown.active, false);
});
test('TL002 interrupting or restarting a countdown cancels the previous start deadline', () => {
  const countdown = new RunnerCountdown(); countdown.start(0); countdown.cancel();
  assert.equal(countdown.label(3000), undefined); assert.equal(countdown.active, false);
  countdown.start(4000); countdown.start(5000); assert.equal(countdown.label(6350), '1');
  assert.equal(countdown.label(7350), undefined);
});
test('TL002 coin contact cue fires once on absorption-to-bounce, never on pickup or HUD arrival', () => {
  const pool = new CoinFlightPool(), point = { x: 100, y: 100 }; let sounds = 0;
  const tick = dt => pool.advance(dt, point, point, () => sounds++);
  pool.spawn(point, point, 1); tick(0); tick(0.139); assert.equal(sounds, 0);
  tick(0.002); assert.equal(sounds, 1); assert.equal(pool.slots[0].pose.stage, 'bounce');
  tick(0); tick(0.4); tick(1); assert.equal(sounds, 1); assert.equal(pool.settled, 1);
  pool.spawn(point, point, 1); pool.reset(); tick(1); assert.equal(sounds, 1);
});

function fakeContext() {
  const parameter = () => ({ value: 0, events: [], setValueAtTime(value, time) { this.value = value; this.events.push([value, time]); }, exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push([value, time]); }, setTargetAtTime(value, time) { this.value = value; this.events.push([value, time]); } });
  const context = { state: 'suspended', currentTime: 0, destination: {}, oscillators: [], gains: [],
    resume() { this.state = 'running'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
    createGain() { const node = { gain: parameter(), connect() {}, disconnect() {} }; this.gains.push(node); return node; },
    createOscillator() {
      const oscillator = { type: '', frequency: parameter(), onended: null, startedAt: 0, connect() {}, disconnect() {}, start(time) { this.startedAt = time; }, stop() {} };
      this.oscillators.push(oscillator); return oscillator;
    },
  };
  return context;
}
test('TL002 audio unlocks one context and schedules jump, impact, failure and coin cues', () => {
  const context = fakeContext(); let created = 0;
  const audio = new RunnerAudio(() => { created++; return context; });
  audio.jump(); assert.equal(context.oscillators.length, 0);
  audio.unlock(); audio.unlock(); audio.jump(); audio.collision(); audio.failure(); audio.coin();
  assert.equal(created, 1); assert.equal(context.oscillators.length, 9);
  assert.deepEqual([audio.snapshot().jump, audio.snapshot().collision, audio.snapshot().failure, audio.snapshot().coin], [1, 1, 1, 1]);
  for (const oscillator of context.oscillators) oscillator.onended?.();
  assert.equal(audio.snapshot().voices, 0); audio.destroy(); assert.equal(context.state, 'closed');
});
test('TL002 audio unlock resumes Safari interrupted contexts after returning to the page', () => {
  const context = fakeContext(); context.state = 'interrupted';
  const audio = new RunnerAudio(() => context);
  audio.unlock();
  assert.equal(context.state, 'running');
  audio.jump(); assert.equal(audio.snapshot().jump, 1);
  audio.destroy();
});
test('TL002 music primes silently in the start gesture and uses a gain node for Safari volume control', () => {
  const parameter = () => ({ value: 0, events: [], setTargetAtTime(value) { this.value = value; this.events.push(value); } });
  const context = {
    state: 'suspended', currentTime: 0, destination: {}, gains: [],
    resume() { this.state = 'running'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
    createGain() { const node = { gain: parameter(), connect() {}, disconnect() {} }; this.gains.push(node); return node; },
    createMediaElementSource() { return { connect() {}, disconnect() {} }; },
  };
  const track = { loop: false, muted: false, volume: 1, paused: true, plays: 0,
    play() { this.paused = false; this.plays++; return Promise.resolve(); }, pause() { this.paused = true; } };
  const music = new RunnerMusic(track, true, 0.2, () => context);
  music.unlock();
  assert.equal(track.plays, 1); assert.equal(track.loop, true);
  assert.equal(context.gains[0].gain.value, 0, 'the countdown pre-roll stays silent');
  music.afterCountdown(); assert.equal(context.gains[0].gain.value, 0.2);
  music.setVolume(0.36); assert.equal(context.gains[0].gain.value, 0.36);
  music.setEnabled(false); assert.equal(context.gains[0].gain.value, 0);
  music.setEnabled(true); assert.equal(context.gains[0].gain.value, 0.36);
  track.paused = true; music.unlock(); assert.equal(track.plays, 2, 'resume retries media playback after Safari suspends the page');
  music.destroy(); assert.equal(context.state, 'closed'); assert.equal(track.paused, true);
});
test('TL002 uses a louder impact at collision and the separate TL001 failure cue for result settlement', () => {
  const context = fakeContext(), audio = new RunnerAudio(() => context); audio.unlock();
  audio.collision();
  const impact = context.oscillators.slice(0, 3);
  assert.deepEqual(impact.map((voice) => [voice.type, voice.frequency.events[0][0], voice.frequency.events[1][0]]), [
    ['square', 680, 110], ['sawtooth', 240, 42], ['triangle', 95, 28],
  ]);
  audio.failure();
  const failure = context.oscillators.slice(3, 6);
  assert.deepEqual(failure.map((voice) => [voice.type, voice.frequency.events[0][0], voice.frequency.events[1][0], voice.startedAt]), [
    ['sine', 740, 560, 0], ['triangle', 520, 390, 0.16], ['sine', 390, 290, 0.34],
  ]);
  assert.deepEqual([audio.snapshot().collision, audio.snapshot().failure], [1, 1]); audio.destroy();
});
test('TL002 mute/pause stop existing voices and suppress new effects; polyphony remains bounded', () => {
  const context = fakeContext(), audio = new RunnerAudio(() => context); audio.unlock(); audio.jump();
  audio.setPaused(true); assert.equal(audio.snapshot().voices, 0); audio.jump(); assert.equal(audio.snapshot().jump, 1);
  audio.setPaused(false); audio.setMuted(true); audio.collision(); assert.equal(audio.snapshot().collision, 0);
  audio.setMuted(false); for (let i = 0; i < 100; i++) audio.jump();
  assert.ok(audio.snapshot().voices <= 12); audio.destroy(); assert.equal(audio.snapshot().voices, 0);
});
test('TL002 effects volume is independently adjustable and clamped while mute remains a separate switch', () => {
  const context = fakeContext(), audio = new RunnerAudio(() => context);
  audio.setVolume(0.32); audio.unlock(); assert.equal(context.gains[0].gain.value, 0.41600000000000004);
  audio.setMuted(true); audio.setVolume(1.5); assert.equal(context.gains[0].gain.value, 0);
  audio.setMuted(false); assert.ok(Math.abs(context.gains[0].gain.value - 1.95) < 1e-10);
  audio.setVolume(2); assert.ok(Math.abs(context.gains[0].gain.value - 1.95) < 1e-10);
  assert.ok(Math.abs(audio.snapshot().volume - 1.95) < 1e-10); audio.destroy();
});
test('TL002 unavailable audio and rapid coin cues never block gameplay or create unbounded voices', () => {
  const unavailable = new RunnerAudio(() => { throw Error('audio blocked'); });
  assert.doesNotThrow(() => { unavailable.unlock(); unavailable.jump(); unavailable.collision(); unavailable.failure(); unavailable.coin(); unavailable.destroy(); });
  const context = fakeContext(), audio = new RunnerAudio(() => context); audio.unlock();
  for (let i = 0; i < 100; i++) audio.coin();
  assert.equal(audio.snapshot().coin, 1); assert.equal(audio.snapshot().voices, 2); audio.destroy();
});
