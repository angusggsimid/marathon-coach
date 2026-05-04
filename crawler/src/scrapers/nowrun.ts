/**
 * nowrun.ts — Scraper for nowrun.cn
 *
 * 闹跑是 Next.js 站点：首页公开暴露 2026 赛事详情页链接，详情页的
 * React Flight 数据中包含结构化 race 对象。这里不解析页面文案，只取
 * 结构化字段，避免把展示文本误当数据。
 */

import * as cheerio from 'cheerio';
import type { RaceDistance, RaceEvent, RaceStatus, ScrapeResult } from '../types.js';
import {
  fetchHtml, sleep,
  inferTerrain, makeId, mapDistanceString,
} from '../utils.js';

const HOME_URL = 'https://www.nowrun.cn/';
const DETAIL_BASE = 'https://www.nowrun.cn/race';
const CONCURRENCY = 4;
const DEFAULT_DETAIL_LIMIT = 492;

interface NowrunRace {
  id?: number | string;
  title?: string;
  actual_date?: string;
  estimated_date?: string;
  date?: string;
  province?: string;
  location?: string;
  events?: string[];
  status?: string;
  official_website?: string;
  registration_start?: string;
  registration_end?: string;
}

interface NowrunLink {
  id: string;
  name: string;
}

export async function scrapeNowrun(opts: {
  limit?: number;
  verbose?: boolean;
} = {}): Promise<ScrapeResult> {
  const errors: string[] = [];
  const races: RaceEvent[] = [];
  const limit = Number.isFinite(opts.limit ?? Infinity)
    ? opts.limit ?? DEFAULT_DETAIL_LIMIT
    : DEFAULT_DETAIL_LIMIT;

  console.log('[nowrun] Fetching race index…', HOME_URL);
  let links: NowrunLink[] = [];
  try {
    const html = await fetchHtml(HOME_URL);
    const allLinks = extractRaceLinks(html);
    links = allLinks.slice(0, limit);
    console.log(`[nowrun] index: ${allLinks.length} race links, fetching ${links.length} details`);
  } catch (e) {
    return { source: 'nowrun', count: 0, races: [], errors: [`Index fetch failed: ${e}`] };
  }

  let cursor = 0;
  async function worker() {
    while (cursor < links.length) {
      const link = links[cursor++];
      await sleep(120);
      try {
        const race = await fetchRaceDetail(link);
        if (race) {
          races.push(race);
          if (opts.verbose) console.log(`  ✓ ${race.date} ${race.name}`);
        }
      } catch (e) {
        errors.push(`Detail ${link.id} ${link.name}: ${e}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, links.length) }, () => worker()),
  );

  races.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[nowrun] Done — ${races.length} scraped, ${errors.length} errors`);
  return { source: 'nowrun', count: races.length, races, errors };
}

function extractRaceLinks(html: string): NowrunLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, NowrunLink>();

  $('a[href^="/race/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const id = href.match(/^\/race\/(\d+)/)?.[1];
    const name = $(el).text().trim();
    if (!id || !name) return;
    seen.set(id, { id, name });
  });

  return Array.from(seen.values());
}

async function fetchRaceDetail(link: NowrunLink): Promise<RaceEvent | null> {
  const url = `${DETAIL_BASE}/${link.id}`;
  const html = await fetchHtml(url);
  const payload = extractDetailRacePayload(html);
  const race = payload ?? fallbackRaceFromJsonLd(html, link);
  if (!race) return null;

  const name = (race.title ?? link.name).trim();
  const date = normalizeIsoDate(race.actual_date ?? race.estimated_date ?? race.date ?? '');
  if (!name || !date) return null;

  const province = normalizeProvince(race.province ?? '');
  const city = normalizeCity(race.location ?? province);
  const distances = mapNowrunDistances(race.events ?? [], name);

  return {
    id: makeId('nr', String(race.id ?? link.id)),
    name,
    date,
    city,
    province,
    distances,
    terrain: inferTerrain(name),
    label: null,
    status: inferNowrunStatus(race),
    registrationUrl: race.official_website || url,
    _source: 'nowrun',
    _sourceId: String(race.id ?? link.id),
  };
}

function extractDetailRacePayload(html: string): NowrunRace | null {
  const marker = '\\"race\\":';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const objectStart = html.indexOf('{', markerIndex + marker.length);
  if (objectStart === -1) return null;

  const json = readBalancedJsonObject(html, objectStart);
  if (!json) return null;

  try {
    return JSON.parse(json) as NowrunRace;
  } catch {
    return null;
  }
}

function readBalancedJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function fallbackRaceFromJsonLd(html: string, link: NowrunLink): NowrunRace | null {
  const $ = cheerio.load(html);
  let found: NowrunRace | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    const text = $(el).html() ?? '';
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed['@type'] !== 'SportsEvent') return;
      const location = parsed.location as { name?: string; address?: { addressRegion?: string } } | undefined;
      found = {
        id: link.id,
        title: String(parsed.name ?? link.name),
        actual_date: String(parsed.startDate ?? ''),
        province: location?.address?.addressRegion ?? '',
        location: location?.name ?? '',
        official_website: String(parsed.sameAs ?? ''),
      };
    } catch { /* continue */ }
  });

  return found;
}

function normalizeIsoDate(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function normalizeProvince(raw: string): string {
  return raw
    .replace(/(省|市|自治区|特别行政区)$/, '')
    .trim();
}

function normalizeCity(raw: string): string {
  const cleaned = raw.trim();
  const match = cleaned.match(/^(.+?)(市|区|县|自治州|地区)/);
  return (match?.[1] ?? cleaned).slice(0, 10);
}

function mapNowrunDistances(events: string[], name: string): RaceDistance[] {
  const mapped = events
    .map(event => mapDistanceString(event))
    .filter((distance): distance is RaceDistance => distance !== null);

  if (mapped.length > 0) return [...new Set(mapped)];
  return name.includes('半程') || name.includes('半马') ? ['half'] : ['full', 'half'];
}

function inferNowrunStatus(race: NowrunRace): RaceStatus {
  if (race.status === 'cancelled') return 'cancelled';
  if (race.status === 'postponed') return 'postponed';

  const now = Date.now();
  const start = Date.parse(race.registration_start ?? '');
  const end = Date.parse(race.registration_end ?? '');

  if (!Number.isNaN(start) && now < start) return 'upcoming';
  if (!Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end) return 'open';
  if (!Number.isNaN(end) && now > end) return 'closed';

  const raceDate = Date.parse(race.actual_date ?? race.estimated_date ?? race.date ?? '');
  if (!Number.isNaN(raceDate) && now > raceDate) return 'closed';
  return 'upcoming';
}
