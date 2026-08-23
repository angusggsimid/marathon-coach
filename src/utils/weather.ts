/**
 * 天气数据：open-meteo（免费、无 key、CORS 开放）+ 本地缓存（24h 节流）。
 * 失败一律静默返回 null/空——天气提示是增强功能，绝不阻塞主流程。
 */

export interface DayWeather {
  date: string; // YYYY-MM-DD
  tempMaxC: number;
  humidityMean?: number;
}

export interface WeatherCache {
  fetchedAt: string;
  days: DayWeather[];
}

export interface WeatherLocation {
  lat: number;
  lon: number;
  source: 'gps' | 'city';
}

const WEATHER_KEY = 'marathon-weather';
const LOCATION_KEY = 'marathon-weather-location';
const FETCH_TIMEOUT_MS = 6000;

/** open-meteo hourly 响应 → 按日聚合（日最高温 + 均湿） */
export function parseOpenMeteo(json: unknown): DayWeather[] {
  const hourly = (json as { hourly?: { time?: string[]; temperature_2m?: (number | null)[]; relative_humidity_2m?: (number | null)[] } }).hourly;
  if (!hourly?.time?.length) return [];

  const byDay = new Map<string, { max: number; rhSum: number; rhN: number }>();
  for (let i = 0; i < hourly.time.length; i++) {
    const t = hourly.temperature_2m?.[i];
    if (t == null) continue;
    const day = hourly.time[i].slice(0, 10);
    const cur = byDay.get(day) ?? { max: -Infinity, rhSum: 0, rhN: 0 };
    cur.max = Math.max(cur.max, t);
    const rh = hourly.relative_humidity_2m?.[i];
    if (rh != null) { cur.rhSum += rh; cur.rhN += 1; }
    byDay.set(day, cur);
  }
  return [...byDay.entries()].map(([date, v]) => ({
    date,
    tempMaxC: Math.round(v.max * 10) / 10,
    ...(v.rhN > 0 ? { humidityMean: Math.round(v.rhSum / v.rhN) } : {}),
  }));
}

/** 缓存超过 24h（或缺失）→ 需要刷新 */
export function shouldRefetchWeather(
  cache: WeatherCache | null,
  now: Date = new Date(),
): boolean {
  if (!cache?.fetchedAt) return true;
  const age = now.getTime() - new Date(cache.fetchedAt).getTime();
  return !(age >= 0 && age < 24 * 3600000);
}

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 近 3 天逐小时预报 → 按日聚合；失败 null */
export async function fetchForecast(lat: number, lon: number): Promise<DayWeather[] | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&hourly=temperature_2m,relative_humidity_2m&forecast_days=3&timezone=auto';
  const json = await fetchJson(url);
  if (!json) return null;
  const days = parseOpenMeteo(json);
  return days.length > 0 ? days : null;
}

/** 城市名 → 坐标；失败 null */
export async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;
  const json = await fetchJson(url) as { results?: { latitude: number; longitude: number }[] } | null;
  const r = json?.results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude } : null;
}

// ── localStorage 缓存 ────────────────────────────────────────────────────────

export function loadWeatherCache(): WeatherCache | null {
  try {
    const raw = localStorage.getItem(WEATHER_KEY);
    return raw ? JSON.parse(raw) as WeatherCache : null;
  } catch { return null; }
}

export function saveWeatherCache(days: DayWeather[]): void {
  try {
    localStorage.setItem(WEATHER_KEY, JSON.stringify({ fetchedAt: new Date().toISOString(), days }));
  } catch { /* 存储满则放弃 */ }
}

export function loadWeatherLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? JSON.parse(raw) as WeatherLocation : null;
  } catch { return null; }
}

export function saveWeatherLocation(loc: WeatherLocation): void {
  try { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch { /* 忽略 */ }
}