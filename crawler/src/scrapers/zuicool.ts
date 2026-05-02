/**
 * zuicool.ts — Scraper for reg.zuicool.com
 *
 * Target: https://reg.zuicool.com/?race_type_id=4  (马拉松·路跑, 117 races, plain HTML)
 *
 * HTML structure of each race card:
 *   div.reg-race-block
 *     h4
 *       a.race-name-a[href=https://reg.zuicool.com/{ID}]
 *         [text: race name]
 *         span.label        ← status: 报名中 / 即将截止 / 报名截止
 *     blockquote
 *       p
 *         [text: date string]
 *         <br>
 *         [text: province·city]
 *
 * Optional detail fetch (--details flag):
 *   div.reg-race-categories table tr td.name h5  ← distance name (e.g. "42公里")
 */

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { RaceEvent, ScrapeResult } from '../types.js';
import {
  fetchHtml, sleep,
  parseChineseDate, parseCityProvince,
  inferDistances, mapDistanceString,
  parseStatus, inferTerrain, makeId,
} from '../utils.js';

// Primary: open-registration races (race_type_id=4 = 马拉松·路跑, zuicool own reg platform)
const REG_URL      = 'https://reg.zuicool.com/?race_type_id=4';
// Open-reg catalog: zuicool.com races currently open (includes external-platform races)
const OPEN_REG_URL = 'https://zuicool.com/events/reg?type=run';
// Catalog: full race database, type=run (路跑), paginated 100 per page (~20 pages)
const CATALOG_URL  = 'https://www.zuicool.com/events?type=run';
const DETAIL_BASE  = 'https://reg.zuicool.com';

// ─── List page ────────────────────────────────────────────────────────────────

export async function scrapeZuicool(opts: {
  fetchDetails?: boolean;
  limit?: number;
  verbose?: boolean;
} = {}): Promise<ScrapeResult> {
  const errors: string[] = [];
  const races: RaceEvent[] = [];

  // ── Source 1: reg.zuicool.com (open-registration races) ──────────────────
  console.log('[zuicool] Fetching registration listing…', REG_URL);
  try {
    const html = await fetchHtmlWithRetry(REG_URL);
    const $ = cheerio.load(html);
    const cards = $('div.reg-race-block').toArray();
    console.log(`[zuicool] reg page: ${cards.length} cards`);

    for (const card of cards) {
      if (races.length >= (opts.limit ?? Infinity)) break;
      try {
        const race = parseRegCard($, card);
        if (!race) continue;
        if (opts.verbose) console.log(`  ✓ ${race.date} ${race.name} [${race.distances.join('/')}]`);
        if (opts.fetchDetails && race._sourceId) {
          await sleep(600);
          try {
            const dd = await fetchDetailDistances(race._sourceId);
            if (dd.length > 0) race.distances = dd;
          } catch (e) { errors.push(`Detail error (${race.name}): ${e}`); }
        }
        races.push(race);
      } catch (e) { errors.push(`Reg parse error: ${e}`); }
    }
  } catch (e) {
    errors.push(`Reg fetch failed: ${e}`);
  }

  // ── Source 2: zuicool.com/events/reg — open-registration sourceId set ───────
  //    This page shows races on zuicool.com with active or upcoming registration.
  //    IMPORTANT: It mixes two statuses —
  //      · "报名截止：MM-DD HH:MM" = registration genuinely open NOW   → add to openSourceIds
  //      · "即将报名"               = registration opening soon          → do NOT add (not open yet)
  //    This catches external-platform races (e.g. 上海马拉松) that won't show
  //    a "报名截止:" button in the main catalog's .meta div.
  const openSourceIds = new Set<string>();
  try {
    console.log('[zuicool] Fetching open-reg catalog (events/reg?type=run)…');
    for (let p = 1; p <= 5; p++) {
      await sleep(400);
      const html = await fetchHtmlWithRetry(`${OPEN_REG_URL}&page=${p}&per-page=100`);
      const $o   = cheerio.load(html);
      const evts = $o('div.event').toArray();
      if (evts.length === 0) break;
      let addedThisPage = 0;
      evts.forEach(ev => {
        const $ev  = $o(ev);
        const href = $ev.find('h4.name a.event-a').attr('href') ?? '';
        const sid  = href.replace(/.*\/event\/(\d+).*/, '$1');
        if (!sid || sid === href) return;

        // Only mark as open if there is an actual registration deadline (not "即将报名")
        const metaText  = $ev.find('div.meta').text();
        const isOpen    = /报名截止|即将截止/.test(metaText);
        const isUpcoming = metaText.includes('即将报名');
        if (isOpen && !isUpcoming) {
          openSourceIds.add(sid);
          addedThisPage++;
        }
      });
      console.log(`[zuicool] open-reg page ${p}: ${evts.length} cards, ${addedThisPage} truly open (${openSourceIds.size} total)`);
      if (evts.length < 100) break;
    }
  } catch (e) {
    errors.push(`Open-reg fetch failed: ${e}`);
  }

  // ── Source 3: zuicool.com/events?type=run — full road-race catalog ─────────
  //    All pages until empty. ~20 pages × 100 cards = 2 000 events.
  //    After isValidRace filter → ~1 200 proper marathon/road races.
  console.log('[zuicool] Fetching full catalog (events?type=run)…');
  const catalogLimit = opts.limit ?? Infinity;
  for (let page = 1; page <= 20; page++) {
    if (races.length >= catalogLimit) break;
    const url = `${CATALOG_URL}&page=${page}&per-page=100`;
    await sleep(500);
    try {
      const html = await fetchHtmlWithRetry(url);
      const $ = cheerio.load(html);
      const events = $('div.event').toArray();
      if (events.length === 0) { console.log(`[zuicool] catalog page ${page}: empty → done`); break; }
      console.log(`[zuicool] catalog page ${page}: ${events.length} cards`);

      for (const ev of events) {
        if (races.length >= catalogLimit) break;
        try {
          const race = parseEventCard($, ev, openSourceIds);
          if (!race) continue;
          // Avoid duplicates already from reg page (match by name).
          // Exception: if catalog version has 'open' status, upgrade existing entry.
          const existing = races.find(r => r.name === race.name);
          if (existing) {
            if (race.status === 'open' && existing.status !== 'open') {
              existing.status = 'open';
            }
            continue;
          }
          if (opts.verbose) console.log(`  ✓ ${race.date} ${race.name} [${race.distances.join('/')}]`);
          races.push(race);
        } catch (e) { errors.push(`Catalog parse error: ${e}`); }
      }
    } catch (e) {
      errors.push(`Catalog page ${page} failed: ${e}`);
      continue;
    }
  }

  console.log(`[zuicool] Done — ${races.length} scraped, ${errors.length} errors`);
  return { source: 'zuicool', count: races.length, races, errors };
}

// ─── Parse reg.zuicool.com card ───────────────────────────────────────────────

function parseRegCard($: cheerio.CheerioAPI, card: AnyNode): RaceEvent | null {
  const $card = $(card);

  // Name: text node inside the <a> (exclude the <span> child text)
  const $anchor = $card.find('h4 a.race-name-a');
  const name = $anchor.clone().find('span').remove().end().text().trim();
  if (!name) return null;

  // Registration URL and source ID
  const href = $anchor.attr('href') ?? '';
  const sourceId = href.replace(/^.*\/(\d+).*$/, '$1');
  const registrationUrl = href || undefined;

  // Status
  const statusRaw = $card.find('h4 a.race-name-a span.label').first().text().trim();
  const status = parseStatus(statusRaw);

  // Date + city: first blockquote's <p>, split on <br>
  const $bq = $card.find('blockquote').first().find('p').first();
  const { dateText, cityText } = splitOnBr($, $bq);

  const date = parseChineseDate(dateText);
  if (!date) {
    // Some cards have date ranges or non-standard formats — skip
    return null;
  }

  const { city, province } = parseCityProvince(cityText);
  const terrain   = inferTerrain(name);
  const distances = inferDistances(name);

  const id = makeId('zc', sourceId || `${name}-${date}`);

  return {
    id,
    name,
    date,
    city,
    province,
    distances,
    terrain,
    label: null,       // IAAF labels not shown on listing; would need detail page
    status,
    registrationUrl,
    _source:   'zuicool',
    _sourceId: sourceId,
  };
}

/**
 * Split a <p> element's contents on the first <br>.
 * Returns { dateText, cityText }.
 */
function splitOnBr($: cheerio.CheerioAPI, $p: cheerio.Cheerio<AnyNode>): {
  dateText: string;
  cityText: string;
} {
  let dateText = '';
  let cityText = '';
  let pastBr   = false;

  $p.contents().each((_, node) => {
    if (node.type === 'tag' && (node as Element).name === 'br') {
      pastBr = true;
      return;
    }
    const text = $(node).text();
    if (!pastBr) dateText += text;
    else         cityText += text;
  });

  return { dateText: dateText.trim(), cityText: cityText.trim() };
}

// ─── Parse www.zuicool.com/events catalog card ────────────────────────────────
//
// Structure:
//   div.event
//     h4.name  a.event-a[href]       ← name
//     div.info p                     ← "YYYY.MM.DD · 省 城市 地区 场地"
//     div.meta p                     ← optional: "报名截止：MM-DD HH:MM" + "点此报名"
//
// Registration status detection:
//   div.meta contains "报名截止："  → status = 'open'   (currently accepting)
//   div.meta contains "即将截止："  → status = 'open'   (closing soon)
//   div.meta empty                   → status = 'upcoming' (not yet open or already closed)

function parseEventCard(
  $: cheerio.CheerioAPI,
  card: AnyNode,
  openSourceIds: Set<string> = new Set(),
): RaceEvent | null {
  const $card = $(card);

  const $a = $card.find('h4.name a.event-a');
  const name = $a.text().trim();
  if (!name) return null;

  const href = $a.attr('href') ?? '';
  // Event URLs look like https://zuicool.com/event/12345 or /event/12345
  const sourceId = href.replace(/.*\/event\/(\d+).*/, '$1');

  const infoText = $card.find('div.info p').first().text().trim();
  // Format: "2026.05.03 · 山西 阳泉市 盂县 仙人乡山南村文体广场"
  // Separator is &middot; (U+00B7) decoded by cheerio
  const parts = infoText.split(/[····・]/);
  const dateText = parts[0]?.trim() ?? '';
  const locText  = parts[1]?.trim() ?? '';

  const dateTBD = /待定|TBD/i.test(dateText);
  const date    = parseChineseDate(dateText);
  if (!date) return null;

  // Location: "省 城市 地区 场地" — take first two tokens.
  // Guard: zuicool occasionally puts a venue address as the first token (e.g.
  // "杨凌农业高新技术产业示范区 杨凌农展广场").  A valid province/city token is
  // ≤ 6 CJK chars; anything longer is a venue string — skip to the next token.
  const locTokens = locText.split(/\s+/).filter(Boolean);
  const provRaw   = locTokens.find(t => t.length <= 6) ?? locTokens[0] ?? '';
  const province  = provRaw;
  const cityIdx   = locTokens.indexOf(provRaw);
  const city      = extractCityFromToken(locTokens[cityIdx + 1] ?? locTokens[0] ?? '');

  // Registration status — two signals:
  //   1. div.meta has "报名截止/即将截止" = uses zuicool's own reg platform → open
  //   2. sourceId in openSourceIds set   = listed on events/reg page → open
  //      (covers races using external platforms like 上海马拉松 etc.)
  const metaText = $card.find('div.meta').text();
  const isOpenByMeta = /报名截止|即将截止/.test(metaText);
  const isOpenById   = sourceId ? openSourceIds.has(sourceId) : false;
  const status: import('../types.js').RaceStatus =
    (isOpenByMeta || isOpenById) ? 'open' : 'upcoming';

  const distances       = inferDistances(name);
  const registrationUrl = href.startsWith('http') ? href
    : href ? `https://zuicool.com${href}` : undefined;

  return {
    id: makeId('zc', sourceId || `${name}-${date}`),
    name,
    date,
    city,
    province,
    distances,
    terrain:   inferTerrain(name),
    label:     null,
    status,
    registrationUrl,
    _source:   'zuicool-events',
    _sourceId: sourceId,
    _dateTBD:  dateTBD || undefined,
  };
}

function extractCityFromToken(s: string): string {
  // "阳泉市" → "阳泉", "忠县" → "忠县", "庆州" → "庆州"
  // Use alternation (not a character class) so multi-char suffixes match whole,
  // and fall back to the original token if stripping would leave < 2 chars.
  const stripped = s.replace(/(自治州|自治县|地区|市|区|县)$/, '').trim();
  return (stripped.length >= 2 ? stripped : s).slice(0, 6);
}

// ─── Detail page: precise distances ──────────────────────────────────────────

async function fetchDetailDistances(sourceId: string): Promise<import('../types.js').RaceDistance[]> {
  const url = `${DETAIL_BASE}/${sourceId}`;
  const html = await fetchHtmlWithRetry(url);
  const $    = cheerio.load(html);

  const distances: import('../types.js').RaceDistance[] = [];
  $('div.reg-race-categories table tr td.name h5').each((_, el) => {
    const text = $(el).text().trim();
    const d    = mapDistanceString(text);
    if (d && !distances.includes(d)) distances.push(d);
  });

  return distances;
}

async function fetchHtmlWithRetry(url: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchHtml(url);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await sleep(800 * (i + 1));
    }
  }
  throw lastError;
}
