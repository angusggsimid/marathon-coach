/**
 * gusto.ts — Scraper for gusto.cn / sport-china.cn
 *
 * gusto.cn is a Vue 3 SPA (Nuxt SSR) that proxies data from:
 *   API A: https://matchapi.gusto.cn/api   (requires auth token)
 *   API B: https://api.sport-china.cn/app/v1
 *
 * Strategy (in priority order):
 *   1. Try to extract Nuxt SSR payload from the public HTML race list
 *   2. Try unauthenticated API calls — may work for public listing endpoints
 *   3. Return empty result with instructions for Playwright-based scraping
 *
 * To enable full scraping on a server, install Playwright and use the
 * commented-out playwrightScrape() function at the bottom.
 */

import * as cheerio from 'cheerio';
import type { RaceEvent, ScrapeResult } from '../types.js';
import {
  fetchHtml, fetchJson, sleep,
  parseChineseDate, parseCityProvince,
  inferDistances, mapDistanceString, parseStatus, inferTerrain, makeId,
} from '../utils.js';

// ─── API endpoints to try (no auth) ──────────────────────────────────────────

const ENDPOINTS = [
  // sport-china public listing (observed in bundle decompile)
  'https://api.sport-china.cn/app/v1/offline/detail/list?pageNum=1&pageSize=100&type=1',
  'https://api.sport-china.cn/app/v1/offline/list?pageNum=1&pageSize=100',
  // matchapi listing
  'https://matchapi.gusto.cn/api/offline/list?pageNum=1&pageSize=100&status=1',
  'https://matchapi.gusto.cn/api/race/list?page=1&pageSize=100',
];

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function scrapeGusto(opts: {
  limit?: number;
  verbose?: boolean;
} = {}): Promise<ScrapeResult> {
  const errors: string[] = [];

  // --- Strategy 1: public Nuxt payload extraction ---
  console.log('[gusto] Trying public Nuxt payload extraction from gusto.cn/race…');
  try {
    const html  = await fetchHtml('https://www.gusto.cn/race');
    const races = extractSsrRaces(html, opts.limit);
    if (races.length > 0) {
      console.log(`[gusto] Nuxt payload extraction found ${races.length} races`);
      return { source: 'gusto', count: races.length, races, errors };
    }
  } catch (e) {
    errors.push(`Nuxt payload fetch failed: ${e}`);
  }

  // --- Strategy 2: unauthenticated API fallback ---
  console.log('[gusto] Trying unauthenticated API endpoints…');
  for (const url of ENDPOINTS) {
    try {
      const data = await fetchJson<unknown>(url);
      const races = parseApiResponse(data, opts.limit);
      if (races.length > 0) {
        console.log(`[gusto] API success at ${url} — ${races.length} races`);
        return { source: 'gusto', count: races.length, races, errors };
      }
      console.log(`[gusto] API at ${url} returned 0 races (may need auth)`);
    } catch (e) {
      errors.push(`API ${url}: ${e}`);
      if (opts.verbose) console.log(`[gusto]   ✗ ${url} → ${e}`);
    }
    await sleep(400);
  }

  // --- Strategy 3: graceful degradation ---
  const msg = [
    'gusto.cn requires authentication for its API.',
    'To scrape gusto fully, run the Playwright-based scraper:',
    '  npm install playwright && npx playwright install chromium',
    '  npm run scrape:gusto -- --playwright',
  ].join('\n');
  console.warn('[gusto]', msg);
  errors.push(msg);

  return { source: 'gusto', count: 0, races: [], errors };
}

// ─── Parse API response (multiple possible shapes) ───────────────────────────

interface ApiRace {
  id?:          number | string;
  raceId?:      number | string;
  name?:        string;
  raceName?:    string;
  title?:       string;
  date?:        string;
  raceDate?:    string;
  startDate?:   string;
  startTime?:   string;
  city?:        string;
  province?:    string;
  address?:     string;
  location?:    string;
  status?:      number | string;
  raceStatus?:  string;
  showSignEndTime?: string;
  distances?:   string[];
  groups?:      Array<{ name?: string; distance?: string }>;
  url?:         string;
  registUrl?:   string;
}

function parseApiResponse(data: unknown, limit = Infinity): RaceEvent[] {
  // Normalise different list shapes: { data: [] }, { data: { list: [] } }, []
  let list: ApiRace[] = [];

  if (Array.isArray(data)) {
    list = data as ApiRace[];
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) {
      list = d.data as ApiRace[];
    } else if (d.data && typeof d.data === 'object') {
      const inner = d.data as Record<string, unknown>;
      if (Array.isArray(inner.list))    list = inner.list as ApiRace[];
      if (Array.isArray(inner.records)) list = inner.records as ApiRace[];
      if (Array.isArray(inner.rows))    list = inner.rows as ApiRace[];
    }
  }

  if (list.length === 0) return [];

  const races: RaceEvent[] = [];
  for (const item of list.slice(0, limit)) {
    try {
      const race = apiItemToRaceEvent(item);
      if (race) races.push(race);
    } catch { /* skip malformed items */ }
  }
  return races;
}

function apiItemToRaceEvent(item: ApiRace): RaceEvent | null {
  const sourceId = String(item.id ?? item.raceId ?? '');
  const name     = (item.name ?? item.raceName ?? item.title ?? '').trim();
  if (!name) return null;

  const rawDate  = item.date ?? item.raceDate ?? item.startDate ?? item.startTime ?? '';
  const date     = parseChineseDate(rawDate) ?? rawDate.slice(0, 10);
  if (!date || date.length < 10) return null;

  const rawCity  = item.city ?? item.address ?? item.location ?? '';
  const rawProv  = item.province ?? '';
  const { city, province } = rawProv
    ? { city: rawCity, province: rawProv }
    : parseCityProvince(rawCity);

  // Distances
  let distances = inferDistances(name);
  if (item.groups?.length) {
    const mapped = item.groups
      .map(g => mapDistanceString(g.name ?? g.distance ?? ''))
      .filter((d): d is import('../types.js').RaceDistance => d !== null);
    if (mapped.length > 0) distances = [...new Set(mapped)];
  }

  const statusRaw = String(item.status ?? item.raceStatus ?? '').trim();
  const status    = isNaN(Number(statusRaw))
    ? inferGustoStatus(statusRaw, item.showSignEndTime)
    : numberToStatus(Number(statusRaw));

  const registrationUrl = item.url ?? item.registUrl ?? (
    sourceId ? `https://www.gusto.cn/race/${sourceId}` : undefined
  );

  return {
    id:   makeId('gt', sourceId || `${name}-${date}`),
    name,
    date,
    city,
    province,
    distances,
    terrain:          inferTerrain(name),
    label:            null,
    status,
    registrationUrl,
    _source:          'gusto',
    _sourceId:        sourceId,
  };
}

function numberToStatus(n: number): import('../types.js').RaceStatus {
  // Common gusto status codes (inferred from bundle analysis)
  switch (n) {
    case 0:  return 'upcoming';
    case 1:  return 'open';
    case 2:  return 'closed';
    case 3:  return 'cancelled';
    case 4:  return 'postponed';
    default: return 'upcoming';
  }
}

// ─── SSR payload extraction ───────────────────────────────────────────────────

function extractSsrRaces(html: string, limit = Infinity): RaceEvent[] {
  // Nuxt SSR injects window.__NUXT__ = {...}  or  <script id="__NUXT_DATA__">
  const patterns = [
    /window\.__NUXT__\s*=\s*(\{.+?\})\s*;/s,
    /window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*;/s,
    /<script[^>]+id="__NUXT_DATA__"[^>]*>(\[.+?\])<\/script>/s,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    try {
      const payload = JSON.parse(m[1]);
      const revived = Array.isArray(payload) ? reviveNuxtPayload(payload) : payload;
      const races   = extractRacesFromPayload(revived, limit);
      if (races.length > 0) return races;
    } catch { /* continue */ }
  }

  // Last resort: look for JSON arrays in <script> tags that look like race data
  const $ = cheerio.load(html);
  let found: RaceEvent[] = [];
  $('script:not([src])').each((_, el) => {
    if (found.length > 0) return;
    const text = $(el).html() ?? '';
    const m    = text.match(/"raceName"\s*:|"raceDate"\s*:|"startDate"\s*:/);
    if (!m) return;
    try {
      // Try to extract the enclosing JSON array / object
      const jsonMatch = text.match(/(\[{.+?}\]|\{{.+?\}})/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        found = parseApiResponse(parsed, limit);
      }
    } catch { /* skip */ }
  });

  return found;
}

function reviveNuxtPayload(payload: unknown[]): unknown {
  const cache = new Map<number, unknown>();

  function reviveRef(index: number): unknown {
    if (cache.has(index)) return cache.get(index);

    const value = payload[index];
    if (Array.isArray(value)) {
      const marker = value[0];
      if (marker === 'Reactive' || marker === 'ShallowReactive') {
        const revived = reviveRef(Number(value[1]));
        cache.set(index, revived);
        return revived;
      }
      if (marker === 'Set') {
        const revived = value.slice(1).map(ref => reviveValue(ref));
        cache.set(index, revived);
        return revived;
      }

      const arr: unknown[] = [];
      cache.set(index, arr);
      arr.push(...value.map(ref => reviveValue(ref)));
      return arr;
    }

    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      cache.set(index, out);
      for (const [key, ref] of Object.entries(value)) {
        out[key] = reviveValue(ref);
      }
      return out;
    }

    cache.set(index, value);
    return value;
  }

  function reviveValue(value: unknown): unknown {
    if (Number.isInteger(value) && Number(value) >= 0 && Number(value) < payload.length) {
      return reviveRef(Number(value));
    }
    return value;
  }

  return reviveRef(0);
}

function extractRacesFromPayload(payload: unknown, limit: number): RaceEvent[] {
  if (!payload || typeof payload !== 'object') return [];

  // Recursively search for arrays that look like race lists
  const candidates: unknown[] = [];

  function walk(node: unknown, depth = 0) {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      if (node.length > 0 && isRaceItem(node[0])) {
        candidates.push(node);
      } else {
        node.forEach(item => walk(item, depth + 1));
      }
    } else if (node && typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(v => walk(v, depth + 1));
    }
  }

  walk(payload);

  for (const candidate of candidates) {
    const races = parseApiResponse(candidate, limit);
    if (races.length > 0) return races;
  }
  return [];
}

function isRaceItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const keys = Object.keys(item as object);
  const raceKeys = ['raceName', 'raceDate', 'name', 'startDate', 'startTime', 'raceId'];
  return raceKeys.some(k => keys.includes(k));
}

function inferGustoStatus(raw: string, signEndTime?: string): import('../types.js').RaceStatus {
  const parsed = parseStatus(raw);
  if (parsed !== 'upcoming' || !signEndTime) return parsed;

  const end = Date.parse(signEndTime.replace(' ', 'T'));
  if (Number.isNaN(end)) return parsed;
  return end >= Date.now() ? 'open' : 'closed';
}

// ─── Playwright-based scraper (requires: npm install playwright) ──────────────
//
// Uncomment and run with: npm run scrape:gusto -- --playwright
//
// import { chromium } from 'playwright';
//
// export async function scrapeGustoPlaywright(): Promise<ScrapeResult> {
//   const browser = await chromium.launch({ headless: true });
//   const page    = await browser.newPage();
//   const captured: unknown[] = [];
//
//   await page.route('**/matchapi.gusto.cn/**', async route => {
//     const response = await route.fetch();
//     try { captured.push(await response.json()); } catch {}
//     await route.fulfill({ response });
//   });
//
//   await page.goto('https://www.gusto.cn/race', { waitUntil: 'networkidle' });
//   await browser.close();
//
//   const races = captured.flatMap(d => parseApiResponse(d));
//   return { source: 'gusto-playwright', count: races.length, races, errors: [] };
// }
