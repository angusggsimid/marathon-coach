/**
 * chinarun.ts — CHINARUN 玩比赛赛事列表抓取器
 *
 * 这个源里混有不少海外直通名额、酒店套餐和旅游产品，所以这里只抓列表页
 * 的结构化赛事卡片，最终是否发布交给统一质量门槛判断。
 */

import * as cheerio from 'cheerio';
import type { RaceDistance, RaceEvent, RaceStatus, ScrapeResult } from '../types.js';
import {
  fetchHtml,
  inferDistances,
  inferTerrain,
  makeId,
  parseChineseDate,
  sleep,
} from '../utils.js';

const BASE_URL = 'https://www.chinarun.com';
const DEFAULT_PAGE_LIMIT = 1;

const LISTS = [
  {
    category: '全程马拉松',
    firstPage: `${BASE_URL}/html/event_k_%E5%85%A8%E7%A8%8B%E9%A9%AC%E6%8B%89%E6%9D%BE_0_.html`,
    page: (pageNo: number) => `${BASE_URL}/html/event_k_%E5%85%A8%E7%A8%8B%E9%A9%AC%E6%8B%89%E6%9D%BE_0___i${pageNo}.html`,
  },
  {
    category: '半程马拉松',
    firstPage: `${BASE_URL}/html/event_k_%20%E5%8D%8A%E7%A8%8B%E9%A9%AC%E6%8B%89%E6%9D%BE_0_.html`,
    page: (pageNo: number) => `${BASE_URL}/html/event_k_%20%E5%8D%8A%E7%A8%8B%E9%A9%AC%E6%8B%89%E6%9D%BE_0___i${pageNo}.html`,
  },
] as const;

export async function scrapeChinarun(opts: {
  limit?: number;
  verbose?: boolean;
} = {}): Promise<ScrapeResult> {
  const errors: string[] = [];
  const races: RaceEvent[] = [];
  const seen = new Set<string>();
  const limit = Number.isFinite(opts.limit ?? Infinity) ? opts.limit ?? Infinity : Infinity;
  const pageLimit = Number.isFinite(limit) ? Math.max(1, Math.ceil(limit / 50)) : DEFAULT_PAGE_LIMIT;

  console.log('[chinarun] Fetching race lists…');

  for (const list of LISTS) {
    const maxPages = Math.min(pageLimit, DEFAULT_PAGE_LIMIT);

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      if (races.length >= limit) break;

      const url = pageNo === 1 ? list.firstPage : list.page(pageNo);
      try {
        const html = await fetchHtml(url, { Referer: `${BASE_URL}/html/event.html` });
        const parsed = parseListPage(html, list.category);

        if (opts.verbose) {
          console.log(`  ${list.category} page ${pageNo}: ${parsed.length} cards`);
        }

        for (const race of parsed) {
          if (races.length >= limit) break;
          const key = `${race._sourceId}-${race.date}`;
          if (seen.has(key)) continue;
          seen.add(key);
          races.push(race);
          if (opts.verbose) console.log(`  ✓ ${race.date} ${race.name}`);
        }
      } catch (e) {
        errors.push(`${list.category} page ${pageNo}: ${e}`);
      }

      await sleep(250);
    }
  }

  races.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[chinarun] Done — ${races.length} scraped, ${errors.length} errors`);
  return { source: 'chinarun', count: races.length, races, errors };
}

function parseListPage(html: string, category: string): RaceEvent[] {
  const $ = cheerio.load(html);
  const races: RaceEvent[] = [];

  $('ul.ulHdList li').each((_, el) => {
    const link = $(el).find('.divName a.n').first();
    const href = link.attr('href') ?? '';
    const sourceId = href.match(/event-(\d+)\.html/)?.[1];
    const name = $(el).find('.spName').first().text().trim();
    const date = parseChineseDate($(el).find('.date .d').first().text().trim());
    const location = normalizeLocation($(el).find('.city').first().text().trim());
    const status = parseChinarunStatus($(el).find('a.aLink').first().text().trim());

    if (!sourceId || !name || !date) return;

    races.push({
      id: makeId('cr', sourceId),
      name,
      date,
      city: location.city,
      province: location.province,
      distances: inferChinarunDistances(name, category),
      terrain: inferTerrain(name),
      label: null,
      status,
      registrationUrl: new URL(href, BASE_URL).toString(),
      _source: 'chinarun',
      _sourceId: sourceId,
    });
  });

  return races;
}

function inferChinarunDistances(name: string, category: string): RaceDistance[] {
  if (/半程马拉松|半马|21公里|21\.0975/i.test(`${name} ${category}`) && !/全程马拉松|全马|42/i.test(name)) {
    return ['half'];
  }
  return inferDistances(name, category);
}

function parseChinarunStatus(raw: string): RaceStatus {
  if (/立即报名|报名中|我要报名/.test(raw)) return 'open';
  if (/截止|结束|关闭/.test(raw)) return 'closed';
  if (/取消/.test(raw)) return 'cancelled';
  if (/延期/.test(raw)) return 'postponed';
  return 'upcoming';
}

function normalizeLocation(raw: string): { city: string; province: string } {
  const cleaned = raw.trim();
  if (!cleaned) return { city: '', province: '' };

  if (/^(日本|韩国|泰国|美国|英国|法国|德国|意大利|西班牙|奥地利|加拿大|新加坡|尼泊尔|俄罗斯|瑞典|以色列|新西兰)城$/.test(cleaned)) {
    return { city: '', province: '' };
  }

  const special = cleaned.match(/^中国?(香港|澳门|台湾)$/);
  if (special) return { city: special[1], province: special[1] };

  const municipality = cleaned.match(/^(北京|上海|天津|重庆)/);
  if (municipality) return { city: municipality[1], province: municipality[1] };

  const compact = cleaned.replace(/^中国/, '');
  const cityMatch = compact.match(/^(.+?)(市|区|县|自治州|地区)/);
  const city = (cityMatch?.[1] ?? compact).replace(/[省市区县]$/, '').trim();
  return { city: city.slice(0, 10), province: city.slice(0, 10) };
}
