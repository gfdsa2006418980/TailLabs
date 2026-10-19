import { RANKING_LIMIT, RANKING_MAX_PAGES, rankingDay, rankingPageInfo } from '../src/systems/LeaderboardPaging.ts';
import type { RankingPage, RankingPeriod } from '../src/systems/LeaderboardPaging.ts';

interface ScoreRow {
  id: string;
  playerName: string;
  target: number;
  placedCount: number;
  droppedCount: number;
  elapsedMilliseconds: number;
  maxHeight: number;
  baseScore: number;
  heightBonus: number;
  speedBonus: number;
  score: number;
  completed: number;
  createdAt: string;
}

interface RunnerScoreRow {
  id: string;
  playerName: string;
  distance: number;
  elapsedMilliseconds: number;
  coins: number;
  multiplier: number;
  score: number;
  createdAt: string;
}

interface D1Statement {
  bind(...values: Array<string | number>): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

interface Env {
  DB: { prepare(sql: string): D1Statement };
  ALLOWED_ORIGINS: string;
}

interface SubmittedScore {
  id: unknown;
  playerName: unknown;
  target: unknown;
  placedCount: unknown;
  droppedCount: unknown;
  elapsedMilliseconds: unknown;
  maxHeight: unknown;
}

interface SubmittedRunnerScore {
  id: unknown;
  playerName: unknown;
  distance: unknown;
  elapsedMilliseconds: unknown;
  coins: unknown;
  multiplier: unknown;
}

const TARGETS = new Set([10, 50, 100, 500]);
const POINTS_PER_PIECE = 100;
const POINTS_PER_HEIGHT = 2;
const SPEED_TARGET_MS = 600_000;
const SPEED_POINTS_PER_SECOND = 10;
const MAX_LEADERBOARD_ENTRIES = RANKING_LIMIT;
const MAX_RUNNER_DISTANCE = 100_000_000;
const MAX_RUNNER_COINS = 1_000_000;
const RANK_ORDER = `completed DESC,
  CASE WHEN completed = 1 THEN score END DESC,
  CASE WHEN completed = 1 THEN elapsed_ms END ASC,
  CASE WHEN completed = 0 THEN placed_count END DESC,
  CASE WHEN completed = 0 THEN score END DESC,
  CASE WHEN completed = 0 THEN elapsed_ms END DESC,
  created_at ASC, id ASC`;
const recentSubmissions = new Map<string, number>();
const RUNNER_RANK_ORDER = `score DESC, elapsed_ms ASC, coins DESC, distance DESC, created_at ASC, id ASC`;

async function rankingPage<T>(db: Env['DB'], table: string, columns: string, order: string,
  period: RankingPeriod, page: number, target?: number): Promise<RankingPage<T>> {
  const now = Date.now();
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (target !== undefined) { conditions.push('target = ?'); values.push(target); }
  if (period === 'daily') {
    const { startsAt, endsAt } = rankingDay(now);
    conditions.push('created_at >= ? AND created_at < ?');
    values.push(startsAt, endsAt);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM
    (SELECT id FROM ${table} ${where} LIMIT ${RANKING_LIMIT})`).bind(...values).all<{ total: number }>();
  const info = rankingPageInfo(count.results[0]?.total ?? 0, page, period, now);
  const rows = await db.prepare(`SELECT ${columns} FROM ${table} ${where}
    ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values, info.pageSize, (info.page - 1) * info.pageSize).all<T>();
  return { ...info, entries: rows.results };
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request: Request, env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return Array.from(value.trim()).slice(0, 12).join('') || '匿名飼主';
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isValidSubmission(body: SubmittedScore): body is SubmittedScore & {
  id: string; playerName: string; target: number; placedCount: number;
  droppedCount: number; elapsedMilliseconds: number; maxHeight: number;
} {
  return typeof body.id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(body.id)
    && cleanName(body.playerName) !== undefined
    && typeof body.target === 'number' && TARGETS.has(body.target)
    && isIntegerInRange(body.placedCount, 0, body.target)
    && isIntegerInRange(body.droppedCount, body.placedCount, body.target)
    && isIntegerInRange(body.elapsedMilliseconds, 0, 21_600_000)
    && isIntegerInRange(body.maxHeight, 0, 50_000);
}

async function leaderboard(db: Env['DB'], target: number): Promise<ScoreRow[]> {
  const result = await db.prepare(`SELECT id, player_name AS playerName, target,
      placed_count AS placedCount, dropped_count AS droppedCount,
      elapsed_ms AS elapsedMilliseconds, max_height AS maxHeight,
      base_score AS baseScore, height_bonus AS heightBonus,
      speed_bonus AS speedBonus, score, completed, created_at AS createdAt
    FROM leaderboard_scores WHERE target = ? ORDER BY ${RANK_ORDER} LIMIT ${MAX_LEADERBOARD_ENTRIES}`).bind(target).all<ScoreRow>();
  return result.results;
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [key, last] of recentSubmissions) if (now - last > 60_000) recentSubmissions.delete(key);
  const previous = recentSubmissions.get(ip);
  if (previous !== undefined && now - previous < 2_000) return true;
  recentSubmissions.set(ip, now);
  return false;
}

async function submitScore(request: Request, env: Env): Promise<Response> {
  let body: SubmittedScore;
  let raw: string;
  try { raw = await request.text(); }
  catch { return json(request, env, { error: 'invalid_json' }, 400); }
  if (raw.length > 4096) return json(request, env, { error: 'request_too_large' }, 413);
  try { body = JSON.parse(raw) as SubmittedScore; }
  catch { return json(request, env, { error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || !isValidSubmission(body)) return json(request, env, { error: 'invalid_score' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM leaderboard_scores WHERE id = ?').bind(body.id).all<{ id: string }>();
  if (existing.results.length) {
    await env.DB.prepare('UPDATE leaderboard_scores SET player_name = ? WHERE id = ?').bind(cleanName(body.playerName)!, body.id).run();
  } else {
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip && isRateLimited(ip)) return json(request, env, { error: 'please_wait' }, 429);

    const completed = body.placedCount === body.target && body.droppedCount === body.target;
    const baseScore = body.placedCount * POINTS_PER_PIECE;
    const heightBonus = Math.floor(body.maxHeight) * POINTS_PER_HEIGHT;
    const speedBonus = completed ? Math.max(0, Math.floor((SPEED_TARGET_MS - body.elapsedMilliseconds) / 1000)) * SPEED_POINTS_PER_SECOND : 0;
    const score = baseScore + heightBonus + speedBonus;
    const createdAt = new Date(Date.now()).toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO leaderboard_scores
        (id, player_name, target, placed_count, dropped_count, elapsed_ms, max_height,
         base_score, height_bonus, speed_bonus, score, completed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(body.id, cleanName(body.playerName)!, body.target, body.placedCount, body.droppedCount,
        body.elapsedMilliseconds, body.maxHeight, baseScore, heightBonus, speedBonus, score, Number(completed), createdAt).run();
  }

  const rows = await leaderboard(env.DB, body.target);
  const rank = rows.findIndex((row) => row.id === body.id);
  return json(request, env, { rank: rank < 0 ? null : rank + 1 });
}

function isValidRunnerSubmission(body: SubmittedRunnerScore): body is SubmittedRunnerScore & {
  id: string; playerName: string; distance: number; elapsedMilliseconds: number; coins: number; multiplier: number;
} {
  return typeof body.id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(body.id)
    && cleanName(body.playerName) !== undefined
    && isIntegerInRange(body.distance, 0, MAX_RUNNER_DISTANCE)
    && isIntegerInRange(body.elapsedMilliseconds, 0, 21_600_000)
    && isIntegerInRange(body.coins, 0, MAX_RUNNER_COINS)
    && typeof body.multiplier === 'number' && Number.isFinite(body.multiplier)
    && body.multiplier >= 1 && body.multiplier <= 5
    && Math.abs(body.multiplier * 100 - Math.round(body.multiplier * 100)) < 1e-7;
}

async function runnerLeaderboard(db: Env['DB']): Promise<RunnerScoreRow[]> {
  const result = await db.prepare(`SELECT id, player_name AS playerName, distance,
      elapsed_ms AS elapsedMilliseconds, coins, multiplier, score, created_at AS createdAt
    FROM runner_leaderboard_scores ORDER BY ${RUNNER_RANK_ORDER} LIMIT ${MAX_LEADERBOARD_ENTRIES}`).all<RunnerScoreRow>();
  return result.results;
}

async function submitRunnerScore(request: Request, env: Env): Promise<Response> {
  let body: SubmittedRunnerScore;
  let raw: string;
  try { raw = await request.text(); }
  catch { return json(request, env, { error: 'invalid_json' }, 400); }
  if (raw.length > 4096) return json(request, env, { error: 'request_too_large' }, 413);
  try { body = JSON.parse(raw) as SubmittedRunnerScore; }
  catch { return json(request, env, { error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || !isValidRunnerSubmission(body)) return json(request, env, { error: 'invalid_score' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM runner_leaderboard_scores WHERE id = ?').bind(body.id).all<{ id: string }>();
  if (existing.results.length) {
    await env.DB.prepare('UPDATE runner_leaderboard_scores SET player_name = ? WHERE id = ?')
      .bind(cleanName(body.playerName)!, body.id).run();
  } else {
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip && isRateLimited(`${ip}:runner`)) return json(request, env, { error: 'please_wait' }, 429);
    const multiplier = Math.round(body.multiplier * 100) / 100;
    const score = Math.floor((body.distance + body.coins) * Math.min(5, Math.max(1, multiplier)) + 1e-9);
    const createdAt = new Date(Date.now()).toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO runner_leaderboard_scores
        (id, player_name, distance, elapsed_ms, coins, multiplier, score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(body.id, cleanName(body.playerName)!, body.distance, body.elapsedMilliseconds,
        body.coins, multiplier, score, createdAt).run();
  }

  const rows = await runnerLeaderboard(env.DB);
  const rank = rows.findIndex((row) => row.id === body.id);
  return json(request, env, { rank: rank < 0 ? null : rank + 1 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get('Origin');
    if (origin && !headers['Access-Control-Allow-Origin']) return json(request, env, { error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (request.method === 'GET' && ['/api/leaderboard', '/api/runner-leaderboard'].includes(url.pathname)) {
      const period = url.searchParams.get('period') ?? 'history';
      const page = Number(url.searchParams.get('page') ?? 1);
      if (period !== 'daily' && period !== 'history') return json(request, env, { error: 'invalid_period' }, 400);
      if (!Number.isInteger(page) || page < 1 || page > RANKING_MAX_PAGES) return json(request, env, { error: 'invalid_page' }, 400);
      if (url.pathname === '/api/leaderboard') {
        const target = Number(url.searchParams.get('target'));
        if (!TARGETS.has(target)) return json(request, env, { error: 'invalid_target' }, 400);
        return json(request, env, await rankingPage<ScoreRow>(env.DB, 'leaderboard_scores',
          `id, player_name AS playerName, target, placed_count AS placedCount, dropped_count AS droppedCount,
           elapsed_ms AS elapsedMilliseconds, max_height AS maxHeight, base_score AS baseScore,
           height_bonus AS heightBonus, speed_bonus AS speedBonus, score, completed, created_at AS createdAt`,
          RANK_ORDER, period, page, target));
      }
      return json(request, env, await rankingPage<RunnerScoreRow>(env.DB, 'runner_leaderboard_scores',
        `id, player_name AS playerName, distance, elapsed_ms AS elapsedMilliseconds,
         coins, multiplier, score, created_at AS createdAt`, RUNNER_RANK_ORDER, period, page));
    }
    if (request.method === 'POST' && url.pathname === '/api/scores') return submitScore(request, env);
    if (request.method === 'POST' && url.pathname === '/api/runner-scores') return submitRunnerScore(request, env);
    if (request.method === 'GET' && url.pathname === '/api/health') return json(request, env, { ok: true });
    return json(request, env, { error: 'not_found' }, 404);
  },
};
