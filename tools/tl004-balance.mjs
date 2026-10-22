// Solves, checks and writes the TL004 levels (tools/tl004-levels.mjs → src/tl004/levels/levels.json).
//
// For every level:
//   1. Layout check: no overlapping blocks, and the tower rests completely still after loading.
//   2. Bot: greedy search over angle × power × (ability or not) for each shot; the winning shots are stored
//      as `solution` (the tests replay them) and the best score sets the star thresholds.
//   3. Random players: many runs with random aim, once without and once with abilities, to check that
//      difficulty rises level by level.
//
// Usage: node --experimental-strip-types --no-warnings tools/tl004-balance.mjs [--only=2,5] [--runs=200]
// --only re-solves just those levels (by number) and keeps the rest of levels.json as it is.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSim, isOver, playReplay, shot, wantsAbility } from './tl004-sim-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/tl004/levels/levels.json');

const ANGLES = Array.from({ length: 25 }, (_, i) => -0.05 - i * 0.05);
const POWERS = [0.7, 0.8, 0.9, 1];

const targetCount = (level) => level.blocks.filter((b) => b.material === 'target').length;

/** Plays `prefix` exactly, then fires `candidate` (tapping its ability at a sensible moment if asked). */
function tryCandidate(level, prefix, candidate) {
  const sim = createSim(level);
  playReplay(sim, prefix);
  let record;
  if (!isOver(sim) && sim.phase === 'aiming') {
    sim.launch(candidate.vx, candidate.vy);
    for (let i = 0; i < 3000 && sim.phase === 'flying'; i++) {
      if (candidate.ability && wantsAbility(sim)) sim.activateAbility();
      sim.step();
    }
    // A won level keeps running its bonus steps inside step(); make sure the end state is reached.
    for (let i = 0; i < 5 && sim.phase === 'aiming' && sim.targetsLeft === 0; i++) sim.step();
    const launch = sim.launches.at(-1);
    record = { vx: launch.vx, vy: launch.vy, ...(launch.abilityStep !== undefined ? { abilityStep: launch.abilityStep } : {}) };
  }
  const result = { record, phase: sim.phase, targetsLeft: sim.targetsLeft, score: sim.score.total };
  sim.destroy();
  return result;
}

function randomRuns(level, runs, seed, ability) {
  let state = seed >>> 0;
  const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    const sim = createSim(level);
    for (let i = 0; i < 15000 && !isOver(sim); i++) {
      if (sim.phase === 'aiming') {
        const a = -0.15 - rand() * 0.85, p = 0.65 + rand() * 0.35;
        const s = shot(a, p);
        sim.launch(s.vx, s.vy);
      }
      if (ability && wantsAbility(sim)) sim.activateAbility();
      sim.step();
    }
    if (sim.phase === 'won') wins++;
    sim.destroy();
  }
  return wins;
}

function overlaps(level) {
  const rects = level.blocks.filter((b) => b.material !== 'target' && !b.angle)
    .map((b) => ({ b, minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minY: b.y - b.h / 2, maxY: b.y + b.h / 2 }));
  const problems = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], c = rects[j];
      const dx = Math.min(a.maxX, c.maxX) - Math.max(a.minX, c.minX), dy = Math.min(a.maxY, c.maxY) - Math.max(a.minY, c.minY);
      if (dx > 2 && dy > 2) problems.push(`${a.b.material}@${a.b.x},${a.b.y} overlaps ${c.b.material}@${c.b.x},${c.b.y}`);
    }
  }
  return problems;
}

/** Load the level and let it sit: nothing may move, break or fall, and every 四十塊 must stay near where it was placed. */
function stability(level) {
  const sim = createSim(level);
  const problems = [];
  const specs = level.blocks;
  [...sim.pieces.values()].forEach((piece, i) => {
    const spec = specs[i];
    const drop = Math.hypot(piece.body.position.x - spec.x, piece.body.position.y - spec.y);
    if (drop > (piece.kind === 'target' ? 45 : 12)) problems.push(`${spec.material}@${spec.x},${spec.y} moved ${drop.toFixed(0)} px while settling`);
  });
  if (sim.targetsLeft !== targetCount(level)) problems.push('a 四十塊 was lost while settling');
  const events = [];
  for (let i = 0; i < 600; i++) events.push(...sim.step());
  if (events.length) problems.push(`${events.length} events while standing still`);
  if (![...sim.pieces.values()].every((p) => p.body.isSleeping)) problems.push('not everything is asleep');
  sim.destroy();
  return problems;
}

/** levels.json with one block / shot per line, so diffs stay readable. */
function format(levels) {
  const line = (value) => JSON.stringify(value);
  const list = (items, indent) => `[\n${items.map((item) => `${indent}  ${line(item)}`).join(',\n')}\n${indent}]`;
  const body = levels.map(({ solution = [], blocks, ...rest }) => {
    const head = Object.entries(rest).map(([key, value]) => `      ${line(key)}: ${line(value)}`).join(',\n');
    return `    {\n${head},\n      "solution": ${list(solution, '      ')},\n      "blocks": ${list(blocks, '      ')}\n    }`;
  });
  return `{\n  "version": 1,\n  "levels": [\n${body.join(',\n')}\n  ]\n}\n`;
}

if (!isMainThread) {
  parentPort.on('message', ({ id, task }) => {
    let result;
    if (task.type === 'candidate') result = tryCandidate(task.level, task.prefix, task.candidate);
    else if (task.type === 'random') result = randomRuns(task.level, task.runs, task.seed, task.ability);
    else if (task.type === 'check') result = [...overlaps(task.level), ...(overlaps(task.level).length ? [] : stability(task.level))];
    parentPort.postMessage({ id, result });
  });
} else {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v = 'true'] = a.replace(/^--/, '').split('='); return [k, v]; }));
  const runs = Number(args.runs ?? 200);
  const only = args.only ? new Set(args.only.split(',').map(Number)) : undefined;
  const { LEVELS } = await import('./tl004-levels.mjs');
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).levels : [];

  // Worker pool.
  const size = Math.max(1, availableParallelism() - 1);
  const workers = Array.from({ length: size }, () => new Worker(fileURLToPath(import.meta.url)));
  const idle = [...workers];
  const queue = [];
  const pending = new Map();
  let nextId = 0;
  for (const worker of workers) {
    worker.on('message', ({ id, result }) => { pending.get(id)(result); pending.delete(id); idle.push(worker); pump(); });
    worker.on('error', (error) => { console.error(error); process.exit(1); });
  }
  function pump() {
    while (idle.length && queue.length) {
      const worker = idle.pop();
      const { id, task } = queue.shift();
      worker.postMessage({ id, task });
    }
  }
  const run = (task) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); queue.push({ id, task }); pump(); });

  async function solve(level) {
    const prefix = [];
    let last;
    for (let s = 0; s < level.shots.length; s++) {
      const candidates = [];
      for (const angle of ANGLES) for (const power of POWERS) for (const ability of [false, true]) candidates.push({ ...shot(angle, power), ability });
      const results = await Promise.all(candidates.map((candidate) => run({ type: 'candidate', level, prefix, candidate })));
      const value = (r) => (r.phase === 'won' ? 1e9 : 0) + (targetCount(level) - r.targetsLeft) * 1e6 + r.score;
      last = results.reduce((best, r) => (value(r) > value(best) ? r : best));
      prefix.push(last.record);
      if (last.phase === 'won') break;
    }
    return { solution: prefix, won: last.phase === 'won', score: last.score, targetsLeft: last.targetsLeft };
  }

  const started = Date.now();
  const output = await Promise.all(LEVELS.map(async (level, index) => {
    const number = index + 1;
    const old = previous.find((p) => p.id === level.id);
    if (only && !only.has(number) && old) return old;
    // Thresholds are only known after solving; stars do not matter for the search.
    level = { ...level, stars: level.stars ?? { two: 1e12, three: 1e12 } };
    const fixedStars = LEVELS[index].stars;
    const problems = await run({ type: 'check', level });
    if (problems.length) return { ...level, problems };
    const bot = await solve(level);
    const [plain, smart] = await Promise.all([false, true].map((ability) => {
      const chunks = 10;
      return Promise.all(Array.from({ length: chunks }, (_, c) => run({ type: 'random', level, runs: Math.ceil(runs / chunks), seed: number * 7919 + c * 104729 + (ability ? 1 : 0), ability })))
        .then((wins) => wins.reduce((a, b) => a + b, 0) / (Math.ceil(runs / chunks) * chunks));
    }));
    const targets = targetCount(level);
    const three = Math.floor((0.85 * bot.score) / 1000) * 1000;
    const stars = fixedStars ?? { two: Math.floor((targets * 5000 + three) / 2 / 1000) * 1000, three };
    return {
      id: level.id, name: level.name, shots: level.shots, stars, solution: bot.solution,
      check: { botWon: bot.won, botShots: bot.solution.length, botScore: bot.score, clearNoAbility: +plain.toFixed(3), clearWithAbility: +smart.toFixed(3) },
      blocks: level.blocks,
    };
  }));
  for (const worker of workers) await worker.terminate();

  console.log('  #  name          targets shots  bot          stars(2/3)     random: no ability / with ability');
  let ok = true;
  output.forEach((level, i) => {
    if (level.problems) { ok = false; console.log(`${String(i + 1).padStart(3)}  ${level.name}  LAYOUT PROBLEMS:\n      ${level.problems.join('\n      ')}`); return; }
    const c = level.check;
    if (!c.botWon) ok = false;
    console.log(`${String(i + 1).padStart(3)}  ${level.name.padEnd(8, '　')}  ${String(targetCount(level)).padStart(3)}  ${String(level.shots.length).padStart(5)}   ${c.botWon ? 'won' : 'LOST'} in ${c.botShots} ${String(c.botScore).padStart(6)}  ${String(level.stars.two).padStart(6)}/${String(level.stars.three).padEnd(6)}   ${(c.clearNoAbility * 100).toFixed(0).padStart(3)}% / ${(c.clearWithAbility * 100).toFixed(0).padStart(3)}%`);
  });
  console.log(`(${((Date.now() - started) / 1000).toFixed(0)} s, ${runs} random runs per level and mode)`);
  if (ok || args.force) {
    writeFileSync(OUT, format(output));
    console.log(`wrote ${path.relative(ROOT, OUT)}`);
  } else {
    console.log('not written: fix the levels above (or pass --force)');
  }
}
