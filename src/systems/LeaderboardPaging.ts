export type RankingPeriod = 'daily' | 'history';
export const RANKING_PAGE_SIZE = 10;
export const RANKING_MAX_PAGES = 10;
export const RANKING_LIMIT = RANKING_PAGE_SIZE * RANKING_MAX_PAGES;
const DAY_MS = 86_400_000;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface RankingPageInfo {
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  period: RankingPeriod;
  day: string | null;
}
export interface RankingPage<T> extends RankingPageInfo { entries: T[] }

export function rankingDay(now = Date.now()): { day: string; startsAt: string; endsAt: string } {
  const start = Math.floor((now + TAIPEI_OFFSET_MS) / DAY_MS) * DAY_MS - TAIPEI_OFFSET_MS;
  return { day: new Date(start + TAIPEI_OFFSET_MS).toISOString().slice(0, 10),
    startsAt: new Date(start).toISOString(), endsAt: new Date(start + DAY_MS).toISOString() };
}

export function filterRankingPeriod<T extends { createdAt: string }>(entries: T[], period: RankingPeriod, now = Date.now()): T[] {
  if (period === 'history') return entries;
  const { startsAt, endsAt } = rankingDay(now);
  const start = Date.parse(startsAt), end = Date.parse(endsAt);
  return entries.filter((entry) => { const time = Date.parse(entry.createdAt); return time >= start && time < end; });
}

export function rankingPageInfo(total: number, requestedPage: number, period: RankingPeriod, now = Date.now()): RankingPageInfo {
  const totalEntries = Math.min(RANKING_LIMIT, Math.max(0, Math.floor(total)));
  const totalPages = Math.max(1, Math.ceil(totalEntries / RANKING_PAGE_SIZE));
  const page = Math.max(1, Math.min(totalPages, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  return { page, pageSize: RANKING_PAGE_SIZE, totalEntries, totalPages, period,
    day: period === 'daily' ? rankingDay(now).day : null };
}

/** Entries arrive in rank order. Filter before limiting so today's lower scores remain visible. */
export function paginateRanking<T extends { createdAt: string }>(entries: T[], period: RankingPeriod, page = 1, now = Date.now()): RankingPage<T> {
  const rows = filterRankingPeriod(entries, period, now).slice(0, RANKING_LIMIT);
  const info = rankingPageInfo(rows.length, page, period, now);
  const offset = (info.page - 1) * RANKING_PAGE_SIZE;
  return { ...info, entries: rows.slice(offset, offset + RANKING_PAGE_SIZE) };
}
