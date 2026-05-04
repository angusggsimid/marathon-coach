/**
 * marathonbm.ts — Scraper for marathonbm.com
 *
 * 马拉松报名公开页面使用公开列表接口展示赛事，详情接口包含公开省市区。
 * 这里只读取公开赛事字段，不访问登录、报名表单、订单或个人资料接口。
 */

import type { RaceEvent, RaceStatus, ScrapeResult } from '../types.js';
import {
  fetchJson,
  inferDistances,
  inferTerrain,
  makeId,
  sleep,
} from '../utils.js';

const BASE_URL = 'https://www.marathonbm.com';
const API_BASE = 'https://gateway.marathonbm.com';
const LIST_URL = `${API_BASE}/api-smc/ui-m-nl/v1/mh/ams`;
const DETAIL_URL = `${API_BASE}/api-smc/ui-m-nl/v1/mh/amd`;
const DEFAULT_LIMIT = 120;
const PAGE_SIZE = 120;

const API_HEADERS: HeadersInit = {
  'domain-scope': 'www.marathonbm.com',
  platform: 'pc',
  Referer: `${BASE_URL}/event`,
};

interface MarathonbmResponse<T> {
  code?: number;
  message?: string;
  data?: T;
}

interface MarathonbmListItem {
  id?: number | string;
  title?: string;
  enrollStartDate?: string;
  enrollEndDate?: string;
  matchStartDate?: string;
  matchEndDate?: string;
  status?: number;
  state?: number;
  currentTime?: string;
}

interface MarathonbmDetail extends MarathonbmListItem {
  province?: string;
  city?: string;
  area?: string;
}

export async function scrapeMarathonbm(opts: {
  limit?: number;
  verbose?: boolean;
} = {}): Promise<ScrapeResult> {
  const errors: string[] = [];
  const races: RaceEvent[] = [];
  const limit = Number.isFinite(opts.limit ?? Infinity) ? opts.limit ?? DEFAULT_LIMIT : DEFAULT_LIMIT;

  console.log('[marathonbm] Fetching public race list…');
  let items: MarathonbmListItem[] = [];
  try {
    const url = `${LIST_URL}?size=${Math.min(limit, PAGE_SIZE)}`;
    const response = await fetchJson<MarathonbmResponse<MarathonbmListItem[]>>(url, API_HEADERS);
    items = Array.isArray(response.data) ? response.data.slice(0, limit) : [];
    console.log(`[marathonbm] list: ${items.length} race cards`);
  } catch (e) {
    return { source: 'marathonbm', count: 0, races: [], errors: [`List fetch failed: ${e}`] };
  }

  for (const item of items) {
    const id = item.id == null ? '' : String(item.id);
    if (!id) continue;

    await sleep(180);
    try {
      const detail = await fetchDetail(id);
      const race = itemToRace(detail ?? item);
      if (!race) continue;
      races.push(race);
      if (opts.verbose) console.log(`  ✓ ${race.date} ${race.name}`);
    } catch (e) {
      errors.push(`Detail ${id} ${item.title ?? ''}: ${e}`);
    }
  }

  races.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[marathonbm] Done — ${races.length} scraped, ${errors.length} errors`);
  return { source: 'marathonbm', count: races.length, races, errors };
}

async function fetchDetail(id: string): Promise<MarathonbmDetail | null> {
  const url = `${DETAIL_URL}?id=${encodeURIComponent(id)}`;
  const response = await fetchJson<MarathonbmResponse<MarathonbmDetail>>(url, API_HEADERS);
  return response.data ?? null;
}

function itemToRace(item: MarathonbmDetail | MarathonbmListItem): RaceEvent | null {
  const sourceId = item.id == null ? '' : String(item.id);
  const name = (item.title ?? '').trim();
  const date = normalizeDate(item.matchStartDate ?? '');
  if (!sourceId || !name || !date) return null;

  return {
    id: makeId('mb', sourceId),
    name,
    date,
    city: normalizeCity((item as MarathonbmDetail).city ?? ''),
    province: normalizeProvince((item as MarathonbmDetail).province ?? ''),
    distances: inferDistances(name),
    terrain: inferTerrain(name),
    label: null,
    status: inferMarathonbmStatus(item),
    registrationUrl: `${BASE_URL}/eventDetail?eventId=${encodeURIComponent(sourceId)}&html=true`,
    _source: 'marathonbm',
    _sourceId: sourceId,
  };
}

function normalizeDate(raw: string): string | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeProvince(raw: string): string {
  return raw
    .replace(/(省|市|自治区|特别行政区)$/, '')
    .trim();
}

function normalizeCity(raw: string): string {
  return raw
    .replace(/(市|区|县|自治州|地区)$/, '')
    .trim()
    .slice(0, 10);
}

function inferMarathonbmStatus(item: MarathonbmListItem): RaceStatus {
  const state = item.state ?? 0;
  if ((state & 1) === 1) return 'cancelled';
  if ((state & 4) === 4) return 'postponed';

  const current = Date.parse((item.currentTime ?? '').replace(/-/g, '/'));
  const start = Date.parse((item.enrollStartDate ?? '').replace(/-/g, '/'));
  const end = Date.parse((item.enrollEndDate ?? '').replace(/-/g, '/'));
  if (!Number.isNaN(current) && !Number.isNaN(start) && current < start) return 'upcoming';
  if (!Number.isNaN(current) && !Number.isNaN(start) && !Number.isNaN(end) && current >= start && current <= end) {
    return 'open';
  }
  if (!Number.isNaN(current) && !Number.isNaN(end) && current > end) return 'closed';

  return item.status === 1 ? 'open' : 'upcoming';
}
