import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  loadWeatherCache, saveWeatherCache, shouldRefetchWeather,
  fetchForecast, geocodeCity,
  loadWeatherLocation, saveWeatherLocation,
  type WeatherLocation,
} from '../utils/weather';
import { heatAdjustment } from '../utils/heat-adjust';
import type { DailyWorkout } from '../utils/training-engine';
import ScienceNote from './ScienceNote';

/**
 * 高温执行提示卡（R2）：一次性 opt-in 定位 → 每日静默刷新预报。
 * 只提示今明两天；失败静默；课程存储永不被修改。
 */
export default function WeatherHintCard({ plan }: { plan: DailyWorkout[] }) {
  const [loc, setLoc] = useState<WeatherLocation | null>(() => loadWeatherLocation());
  const [days, setDays] = useState(() => loadWeatherCache()?.days ?? []);
  const [phase, setPhase] = useState<'idle' | 'locating' | 'denied'>('idle');
  const [cityInput, setCityInput] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const refresh = async (l: WeatherLocation) => {
    const result = await fetchForecast(l.lat, l.lon);
    if (result) { saveWeatherCache(result); setDays(result); }
  };

  useEffect(() => {
    if (!loc) return;
    const cache = loadWeatherCache();
    if (shouldRefetchWeather(cache)) void refresh(loc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  const useMyPosition = () => {
    if (!navigator.geolocation) { setPhase('denied'); return; }
    setPhase('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const l: WeatherLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'gps' };
        saveWeatherLocation(l); setLoc(l); setPhase('idle');
      },
      () => setPhase('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 },
    );
  };

  const useCity = async () => {
    if (!cityInput.trim()) return;
    const g = await geocodeCity(cityInput.trim());
    if (!g) return;
    const l: WeatherLocation = { ...g, source: 'city' };
    saveWeatherLocation(l); setLoc(l); setPhase('idle');
  };

  if (dismissed) return null;

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const tomorrowKey = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
  const dayName = (key: string) => {
    const label = key === todayKey ? '今天' : '明天';
    return `${label}(${format(new Date(key + 'T12:00:00'), 'M/d EEE', { locale: zhCN })})`;
  };

  // 提示行：今明两天有课且高温触发
  const hints = [todayKey, tomorrowKey].flatMap(key => {
    const w = plan.find(x => format(new Date(x.date), 'yyyy-MM-dd') === key);
    if (!w || w.workoutType === 'Rest') return [];
    const wd = days.find(d => d.date === key);
    if (!wd) return [];
    const adv = heatAdjustment(w.workoutType, wd.tempMaxC, wd.humidityMean);
    if (!adv) return [];
    return [{ key, w, wd, adv }];
  });

  // 已配置：有提示显示提示，无提示不占位
  if (loc) {
    if (hints.length === 0) return null;
    return (
      <div className="px-4 pb-3" data-testid="weather-hint">
        <div className="rounded-xl bg-[var(--color-orange)]/10 px-3 py-2 space-y-1">
          {hints.map(({ key, w, wd, adv }) => (
            <div key={key}>
              <p className="text-[11.5px] text-[var(--color-label-2)] leading-relaxed">
                <span className="font-semibold text-[var(--color-orange)]">🌡 {dayName(key)} {w.workoutType} · 最高 {wd.tempMaxC}°C</span>
                {' '}→ 配速建议 +{adv.paceAddSecPerKm}s/km，{adv.advice}
                <span className="block text-[9.5px] text-[var(--color-label-4)] mt-0.5">天气数据来自 open-meteo · 仅供参考</span>
              </p>
              <ScienceNote id="heat" label="为什么高温要降速？" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 未配置：opt-in 入口（拒绝后可手动填城市）
  return (
    <div className="px-4 pb-3" data-testid="weather-optin">
      <div className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 flex items-center gap-2 flex-wrap">
        {phase !== 'denied' ? (
          <>
            <button
              onClick={useMyPosition}
              disabled={phase === 'locating'}
              className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-black active:opacity-80 disabled:opacity-50"
            >
              🌡 启用高温提示（使用我的位置）
            </button>
            <button
              onClick={() => setPhase('denied')}
              className="text-[11px] text-[var(--color-label-3)] underline underline-offset-2"
            >
              或填城市
            </button>
          </>
        ) : (
          <>
            <input
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void useCity(); }}
              placeholder="训练城市，如 广州"
              className="flex-1 min-w-[120px] bg-[var(--color-surface)] text-white text-[12px] rounded-lg px-2 py-1 border border-[var(--color-separator)] outline-none"
            />
            <button
              onClick={() => void useCity()}
              disabled={!cityInput.trim()}
              className="text-[11.5px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-black disabled:opacity-50"
            >
              保存
            </button>
          </>
        )}
        <button onClick={() => setDismissed(true)} className="text-[11px] text-[var(--color-label-4)] ml-auto">×</button>
      </div>
    </div>
  );
}