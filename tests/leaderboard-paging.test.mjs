import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.ts';
import { rankingDay, paginateRanking } from '../src/systems/LeaderboardPaging.ts';
import { LeaderboardSystem } from '../src/systems/LeaderboardSystem.ts';
import { RunnerLeaderboard } from '../src/tl002/RunnerLeaderboard.ts';

const NOW = Date.parse('2026-10-19T08:00:00.000Z');
const TODAY = '2026-10-19T08:00:00.000Z';
const YESTERDAY = '2026-10-18T08:00:00.000Z';
const store = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

function database(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  t.after(() => sql.close());
  const env = { ALLOWED_ORIGINS: 'http://localhost:5173', DB: { prepare(query) {
    let values = [];
    return { bind(...args) { values = args; return this; },
      async all() { return { results: sql.prepare(query).all(...values) }; },
      async run() { sql.prepare(query).run(...values); return { success: true }; } };
  } } };
  return { sql, env };
}

function seed(sql, game, id, score, createdAt) {
  if (game === 'stack') sql.prepare(`INSERT INTO leaderboard_scores
    (id, player_name, target, placed_count, dropped_count, elapsed_ms, max_height, base_score, height_bonus, speed_bonus, score, completed, created_at)
    VALUES (?, 'Keeper', 500, 1, 1, 1000, 0, 100, 0, 0, ?, 0, ?)`).run(id, score, createdAt);
  else sql.prepare(`INSERT INTO runner_leaderboard_scores
    (id, player_name, distance, elapsed_ms, coins, multiplier, score, created_at)
    VALUES (?, 'Runner', ?, 1000, 0, 1, ?, ?)`).run(id, score, score, createdAt);
}

async function get(env, path) {
  const response = await worker.fetch(new Request(`http://api.test${path}`), env);
  return { status: response.status, body: await response.json() };
}

test('daily cutoff uses Taiwan midnight across date and year boundaries', () => {
  assert.deepEqual(rankingDay(Date.parse('2026-10-19T15:59:59.999Z')), {
    day: '2026-10-19', startsAt: '2026-10-18T16:00:00.000Z', endsAt: '2026-10-19T16:00:00.000Z',
  });
  assert.equal(rankingDay(Date.parse('2026-10-19T16:00:00.000Z')).day, '2026-10-20');
  assert.equal(rankingDay(Date.parse('2026-12-31T16:00:00.000Z')).day, '2027-01-01');
  const rows = [
    { id: 'before', createdAt: '2026-10-18T15:59:59.999Z' },
    { id: 'start', createdAt: '2026-10-18T16:00:00.000Z' },
    { id: 'end', createdAt: '2026-10-19T15:59:59.999Z' },
    { id: 'after', createdAt: '2026-10-19T16:00:00.000Z' },
  ];
  assert.deepEqual(paginateRanking(rows, 'daily', 1, NOW).entries.map(row => row.id), ['start', 'end']);
});

test('paging caps at 100, clamps a stale page and keeps an empty board on page one', () => {
  const rows = Array.from({ length: 125 }, (_, i) => ({ id: i + 1, createdAt: TODAY }));
  const last = paginateRanking(rows, 'history', 10, NOW);
  assert.equal(last.totalEntries, 100); assert.equal(last.totalPages, 10);
  assert.deepEqual(last.entries.map(row => row.id), [91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
  assert.equal(paginateRanking(rows.slice(0, 25), 'history', 10, NOW).page, 3);
  const empty = paginateRanking([], 'daily', 10, NOW);
  assert.equal(empty.page, 1); assert.equal(empty.totalPages, 1); assert.equal(empty.entries.length, 0);
});

test('additive migrations can be applied repeatedly without changing existing records', t => {
  const { sql } = database(t);
  sql.exec('DROP TABLE runner_leaderboard_scores; DROP INDEX leaderboard_scores_target_day;');
  seed(sql, 'stack', 'old-stack', 2000, YESTERDAY);
  const before = sql.prepare('SELECT * FROM leaderboard_scores').all();
  const runnerMigration = readFileSync(new URL('../worker/migrations/0002_tl002_runner_leaderboard.sql', import.meta.url), 'utf8');
  const dailyMigration = readFileSync(new URL('../worker/migrations/0003_daily_rankings.sql', import.meta.url), 'utf8');
  sql.exec(runnerMigration); sql.exec(dailyMigration);
  seed(sql, 'runner', 'old-runner', 1000, YESTERDAY);
  const runnerBefore = sql.prepare('SELECT * FROM runner_leaderboard_scores').all();
  sql.exec(runnerMigration); sql.exec(dailyMigration);
  assert.deepEqual(sql.prepare('SELECT * FROM leaderboard_scores').all(), before);
  assert.deepEqual(sql.prepare('SELECT * FROM runner_leaderboard_scores').all(), runnerBefore);
});

for (const game of ['stack', 'runner']) {
  const path = game === 'stack' ? '/api/leaderboard?target=500&' : '/api/runner-leaderboard?';
  test(`${game}: SQL pagination filters daily before the top-100 limit and keeps page boundaries stable`, async t => {
    t.mock.method(Date, 'now', () => NOW);
    const { sql, env } = database(t);
    for (let i = 0; i < 100; i++) seed(sql, game, `history-${String(i).padStart(3, '0')}`, 10000 - i, YESTERDAY);
    for (let i = 0; i < 25; i++) seed(sql, game, `today-${String(i).padStart(3, '0')}`, 100 - i, TODAY);
    const first = (await get(env, `${path}period=daily&page=1`)).body;
    const second = (await get(env, `${path}period=daily&page=2`)).body;
    const last = (await get(env, `${path}period=daily&page=10`)).body;
    assert.equal(first.totalEntries, 25); assert.equal(first.totalPages, 3); assert.equal(first.day, '2026-10-19');
    assert.equal(first.entries.length, 10); assert.equal(second.entries[0].id, 'today-010');
    assert.equal(last.page, 3); assert.equal(last.entries.length, 5);
    assert.equal(new Set([...first.entries, ...second.entries, ...last.entries].map(row => row.id)).size, 25);
    const history = (await get(env, `${path}period=history&page=10`)).body;
    assert.equal(history.totalEntries, 100); assert.equal(history.totalPages, 10);
    assert.equal(history.entries[0].id, 'history-090'); assert.equal(history.entries.at(-1).id, 'history-099');
    for (let i = 11; i >= 0; i--) seed(sql, game, `tie-${String(i).padStart(3, '0')}`, 500, TODAY);
    const tiedFirst = (await get(env, `${path}period=daily&page=1`)).body;
    const tiedNext = (await get(env, `${path}period=daily&page=2`)).body;
    assert.deepEqual(tiedFirst.entries.map(row => row.id), Array.from({ length: 10 }, (_, i) => `tie-${String(i).padStart(3, '0')}`));
    assert.deepEqual(tiedNext.entries.slice(0, 2).map(row => row.id), ['tie-010', 'tie-011']);
    if (game === 'stack') assert.equal((await get(env, '/api/leaderboard?target=50&period=daily&page=1')).body.totalEntries, 0);
    for (const query of ['period=nope&page=1', 'period=daily&page=0', 'period=daily&page=11', 'period=history&page=NaN']) {
      assert.equal((await get(env, `${path}${query}`)).status, 400);
    }
  });

  test(`${game}: a lower daily result survives submission and renaming does not move yesterday into today's board`, async t => {
    t.mock.method(Date, 'now', () => NOW);
    const { sql, env } = database(t);
    for (let i = 0; i < 100; i++) seed(sql, game, `history-${String(i).padStart(3, '0')}`, 10000 - i, YESTERDAY);
    const endpoint = game === 'stack' ? '/api/scores' : '/api/runner-scores';
    const payload = game === 'stack'
      ? { target: 500, placedCount: 1, droppedCount: 1, elapsedMilliseconds: 1000, maxHeight: 0 }
      : { distance: 1, coins: 0, multiplier: 1, elapsedMilliseconds: 1000 };
    const post = async (id, name) => worker.fetch(new Request(`http://api.test${endpoint}`, {
      method: 'POST', body: JSON.stringify({ ...payload, id, playerName: name }),
    }), env);
    assert.equal((await post('today-low-score', 'New player')).status, 200);
    const table = game === 'stack' ? 'leaderboard_scores' : 'runner_leaderboard_scores';
    assert.equal(sql.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total, 101);
    assert.deepEqual((await get(env, `${path}period=daily&page=1`)).body.entries.map(row => row.id), ['today-low-score']);
    assert.equal((await post('history-000', 'Renamed')).status, 200);
    assert.equal(sql.prepare(`SELECT created_at FROM ${table} WHERE id = 'history-000'`).get().created_at, YESTERDAY);
    assert.equal((await get(env, `${path}period=daily&page=1`)).body.totalEntries, 1);
    assert.equal((await get(env, `${path}period=history&page=1`)).body.entries[0].playerName, 'Renamed');
  });
}

test('both local fallback stores retain today’s lower score beside a full all-time top 100', t => {
  t.mock.method(Date, 'now', () => NOW);
  const stackStore = store(), runnerStore = store();
  const stack = new LeaderboardSystem(stackStore), runner = new RunnerLeaderboard(runnerStore);
  for (let i = 0; i < 100; i++) {
    stack.save({ id: `old-${i}`, playerName: 'Keeper', target: 500, placedCount: 499, droppedCount: 500,
      elapsedMilliseconds: 1000, maxHeight: 0, baseScore: 49900, heightBonus: 0, speedBonus: 0,
      score: 49900, completed: false, createdAt: YESTERDAY });
    runner.save({ id: `old-${i}`, distance: 10000, coins: 0, multiplier: 1, elapsedMilliseconds: 1000, createdAt: YESTERDAY });
  }
  stack.save({ id: 'today-low', playerName: 'Keeper', target: 500, placedCount: 1, droppedCount: 1,
    elapsedMilliseconds: 1000, maxHeight: 0, baseScore: 100, heightBonus: 0, speedBonus: 0,
    score: 100, completed: false, createdAt: TODAY });
  runner.save({ id: 'today-low', distance: 1, coins: 0, multiplier: 1, elapsedMilliseconds: 1000, createdAt: TODAY });
  const stackReload = new LeaderboardSystem(stackStore), runnerReload = new RunnerLeaderboard(runnerStore);
  assert.equal(stackReload.top(500).length, 100); assert.equal(runnerReload.top().length, 100);
  assert.deepEqual(stackReload.top(500, 'daily').map(row => row.id), ['today-low']);
  assert.deepEqual(runnerReload.top('daily').map(row => row.id), ['today-low']);
});
