import type { RaceDistance, RaceEvent, RaceStatus, RaceTerrain } from './types.js';

// ─── Date parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a Chinese date string to ISO 'YYYY-MM-DD'.
 * Handles:
 *   "2026年5月31日"          → '2026-05-31'
 *   "2026年5月31日星期日"    → '2026-05-31'
 *   "2026年5月30日-31日"     → '2026-05-30'  (range → first date)
 *   "2026年5月30日至31日"    → '2026-05-30'
 *   "2026.5.31"             → '2026-05-31'
 *   "2026-05-31"            → '2026-05-31'
 */
export function parseChineseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // YYYY年M月D日
  const m1 = s.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  }

  // YYYY.M.D or YYYY-M-D
  const m2 = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m2) {
    return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  }

  // "2026.08 待定" / "2026年8月 待定" — month-only, day unknown → use 01 as placeholder
  const m3 = s.match(/(\d{4})[.\-/年]\s*(\d{1,2})/);
  if (m3) {
    return `${m3[1]}-${m3[2].padStart(2, '0')}-01`;
  }

  // "2026 待定" — year-only
  const m4 = s.match(/^(\d{4})\s*(待定|TBD)?$/);
  if (m4) {
    return `${m4[1]}-01-01`;
  }

  return null;
}

// ─── City / province parsing ──────────────────────────────────────────────────

const SEPARATORS = ['・', '·', '•', '·', '丨', '|', '－'];

/**
 * Parse "河北・张家口市涿鹿县" → { province: '河北', city: '张家口' }
 * Handles single-token strings like "北京" (both province and city).
 */
export function parseCityProvince(raw: string): { city: string; province: string } {
  const s = raw.trim();

  let sepIdx = -1;
  let sepLen = 1;
  for (const sep of SEPARATORS) {
    const idx = s.indexOf(sep);
    if (idx !== -1) { sepIdx = idx; sepLen = sep.length; break; }
  }

  let province: string;
  let rest: string;

  if (sepIdx === -1) {
    // e.g. "北京市海淀区" or just "北京"
    province = stripAdmin(s);
    rest = s;
  } else {
    province = s.slice(0, sepIdx).trim();
    rest = s.slice(sepIdx + sepLen).trim();
  }

  // Take just the city part (first level, strip 市/区/县/自治州 etc.)
  const city = extractCity(rest);
  const prov = stripAdmin(province);

  return { province: prov, city };
}

function stripAdmin(s: string): string {
  return s
    .replace(/(自治区|特别行政区|自治州|自治县|直辖市|行政区)$/, '')
    .replace(/[省市区县]$/, '')
    .replace(/[・·•·\s]+$/, '')
    .trim();
}

/**
 * Strip trailing ethnic-group identifier, e.g.:
 *   "大理白族" → "大理"   "临夏回族" → "临夏"   "延边朝鲜族" → "延边"
 *
 * Using an explicit alternation avoids greedy over-stripping like "大理白族"
 * matching "理白族" (2 chars) → "大" instead of "白族" (1 char) → "大理".
 */
const ETHNIC_RE = /(白|回|苗|傣|彝|藏|壮|满|蒙古|维吾尔|朝鲜|土家|布依|侗|瑶|哈尼|黎|傈僳|佤|纳西|东乡|景颇)族$/;

function stripEthnic(s: string): string {
  return s.replace(ETHNIC_RE, '').trim();
}

function extractCity(s: string): string {
  // Replace separator dots with spaces; strip parenthetical venue notes
  const clean = s
    .replace(/[・·•·]/g, ' ')
    .replace(/[（(（][^）)）]*[）)）]/g, '')
    .trim();

  // Try to match known admin suffix (市/区/自治州 etc.)
  const m = clean.match(/^(.+?)(市|区|地区|自治州|自治县|省)/);
  if (m) {
    return stripEthnic(m[1].trim());
  }

  // Fallback: take first space-delimited token, cap at 4 CJK chars
  const first = (clean.split(/\s+/)[0] ?? clean).trim();
  const stripped = stripEthnic(stripAdmin(first));
  return stripped.slice(0, 4) || clean.slice(0, 4);
}

// ─── Distance inference ───────────────────────────────────────────────────────

const FULL_KEYWORDS  = ['全程马拉松', '全马', '42km', '42公里', '42.195'];
const HALF_KEYWORDS  = ['半程马拉松', '半马', '21km', '21公里', '21.0975', '半程'];

/**
 * Infer race distances from name + distance column text.
 *
 * Rules (in priority order):
 *   - Explicit "全马"/"42km"/etc  →  full + half  (big races nearly always have both)
 *   - Explicit "半马"/"半程"       →  half only
 *   - Explicit "10公里"/"10K"      →  10k only
 *   - Generic "马拉松" (no above)  →  full + half  (default for any named marathon)
 *   - Nothing matched              →  full + half  (safe fallback)
 */
export function inferDistances(name: string, distanceText?: string): RaceDistance[] {
  const combined = `${name} ${distanceText ?? ''}`.toLowerCase();

  const hasFull = FULL_KEYWORDS.some(k => combined.includes(k.toLowerCase()));
  const hasHalf = HALF_KEYWORDS.some(k => combined.includes(k.toLowerCase()));

  // Explicit half-only (e.g. "半程马拉松", "半马") without full keywords
  if (hasHalf && !hasFull) return ['half'];
  // Explicit full, or generic "马拉松" → assume both distances (nearly all big races offer both)
  return ['full', 'half'];
}

/**
 * Map a single distance string from a detail page (e.g. "42公里", "21公里", "10公里")
 * to a RaceDistance enum value.
 */
export function mapDistanceString(s: string): RaceDistance | null {
  const t = s.toLowerCase().replace(/\s/g, '');
  if (t.includes('42') || t.includes('全程') || t.includes('全马')) return 'full';
  if (t.includes('21') || t.includes('半程') || t.includes('半马')) return 'half';
  return null;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, RaceStatus> = {
  '报名中':   'open',
  '即将截止': 'open',
  '报名截止': 'closed',
  '已截止':   'closed',
  '已关闭':   'closed',   // reg.zuicool.com uses this label
  '尚未开始': 'upcoming',
  '即将开放': 'upcoming',
  '筹备中':   'upcoming',
  '已取消':   'cancelled',
  '取消':     'cancelled',
  '已延期':   'postponed',
  '延期':     'postponed',
};

export function parseStatus(raw: string): RaceStatus {
  const s = raw.trim();
  return STATUS_MAP[s] ?? 'upcoming';
}

// ─── Terrain / label inference ────────────────────────────────────────────────

export function inferTerrain(name: string): RaceTerrain {
  if (/越野|山地|山区|爬升|trail/i.test(name)) return 'mountain';
  if (/丘陵|起伏|山城|hilly/i.test(name))       return 'hilly';
  return 'flat';
}

// ─── Race quality gates ──────────────────────────────────────────────────────

export type RaceQualityIssue =
  | 'virtual-event'
  | 'non-road-event'
  | 'training-activity'
  | 'travel-package'
  | 'fun-run-only'
  | 'missing-location'
  | 'suspicious-location'
  | 'missing-marathon-distance';

export interface RaceQualityResult {
  keep: boolean;
  issues: RaceQualityIssue[];
}

const REQUIRED_RACE_KEYWORDS = [
  '马拉松', '半马', '全马',
  '21公里', '21.0975', '半程',
];

const VIRTUAL_PATTERNS = [
  /线上|虚拟|地图跑|云跑|轨迹跑/i,
];

const NON_ROAD_PATTERNS = [
  /骑行|铁人|自行车|徒步|健步行|健步走|登山|登高赛|垂直马拉松/i,
  /越野|野跑|跑山赛|山地跑|山地马拉松|爬升赛|trail/i,
];

const TRAINING_PATTERNS = [
  /训练营|积分赛|分站活动|测试赛|体验课/i,
];

const PACKAGE_PATTERNS = [
  /酒店套餐|旅行套餐|住宿套餐|旅游套餐|福利套餐|官方套餐|商务酒店|起点酒店/i,
  /直通名额|官方直通|单名额|纯名额|名额预售|名额&套餐|预售报名|八达通卡套餐/i,
  /3天2晚|4天3晚|5天4晚|三天两晚|四天三晚|五天四晚|三日.*通票/i,
];

const SOFT_FUN_PATTERNS = [
  /亲子|萌娃|儿童|少儿|青少年|欢乐跑|嘉年华|感恩跑|公益跑/i,
];

const EXPLICIT_DISTANCE_RE = /全马|半马|全程马拉松|半程马拉松|21公里|42公里|21\.0|42\.1|42\.195/i;

export function evaluateRaceQuality(race: RaceEvent): RaceQualityResult {
  const issues: RaceQualityIssue[] = [];
  const name = race.name.trim();
  const city = race.city.trim();
  const province = race.province.trim();
  const combinedLocation = `${province}${city}`;

  if (VIRTUAL_PATTERNS.some(re => re.test(name)) || /不限地点|全国/.test(combinedLocation)) {
    issues.push('virtual-event');
  }

  if (NON_ROAD_PATTERNS.some(re => re.test(name))) {
    issues.push('non-road-event');
  }

  if (TRAINING_PATTERNS.some(re => re.test(name))) {
    issues.push('training-activity');
  }

  if (PACKAGE_PATTERNS.some(re => re.test(name))) {
    issues.push('travel-package');
  }

  const hasRequired = REQUIRED_RACE_KEYWORDS.some(k => name.toLowerCase().includes(k.toLowerCase()));
  if (!hasRequired) {
    issues.push('missing-marathon-distance');
  }

  if (SOFT_FUN_PATTERNS.some(re => re.test(name)) && !EXPLICIT_DISTANCE_RE.test(name)) {
    issues.push('fun-run-only');
  }

  if (!city || !province) {
    issues.push('missing-location');
  } else if (city.length > 10 || province.length > 10 || /广场|公园|体育场|会展|中心|示范区/.test(city + province)) {
    issues.push('suspicious-location');
  }

  return { keep: issues.length === 0, issues };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const DEFAULT_HEADERS: HeadersInit = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control':   'no-cache',
};

export async function fetchHtml(url: string, extraHeaders?: HeadersInit): Promise<string> {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, extraHeaders?: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'application/json',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

/** Polite crawl delay between requests (ms). */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── ID generation ────────────────────────────────────────────────────────────

export function makeId(source: 'zc' | 'gt' | 'nr' | 'cr' | 'mb', sourceId: string): string {
  return `${source}-${sourceId}`;
}
