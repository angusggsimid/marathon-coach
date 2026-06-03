import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, MapPin, Flag, Star, Trash2, ChevronDown, ChevronRight,
  ExternalLink, Globe, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useStore } from '../store/useStore';
import type { MyRace, MyRaceGoal, MyRaceDistance } from '../store/useStore';
import { RACES as SEED_RACES } from '../data/races';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedRace {
  id:               string;
  name:             string;
  date:             string;          // 'YYYY-MM-DD'
  city:             string;
  province:         string;
  distances:        ('full' | 'half' | '10k')[];
  terrain:          'flat' | 'hilly' | 'mountain';
  label:            'iaaf-gold' | 'iaaf-silver' | 'iaaf-bronze' | null;
  status:           'open' | 'closed' | 'upcoming' | 'cancelled' | 'postponed';
  altitude?:        number;
  registrationUrl?: string;
  note?:            string;
  _dateTBD?:        boolean;
  _source?:         string;
  sources?:         string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

const FOREIGN_PROVINCES = new Set([
  '日本','韩国','美国','法国','泰国','马来西亚','英国','澳大利亚',
  '香港','澳门','台湾','意大利','德国','西班牙','新加坡','加拿大',
  '新西兰','荷兰','波兰','葡萄牙','瑞典','瑞士','奥地利','比利时',
  '南非','巴西','阿根廷','墨西哥','土耳其','俄罗斯','印度','印度尼西亚',
  '菲律宾','越南','柬埔寨','缅甸','尼泊尔','斯里兰卡','坦桑尼亚','肯尼亚',
  '埃塞俄比亚','摩洛哥','埃及','约旦','以色列','阿联酋','卡塔尔','沙特阿拉伯',
  '伊朗','哈萨克斯坦','乌克兰','捷克','匈牙利','罗马尼亚','希腊','挪威','丹麦','芬兰',
]);

const GOAL_OPTIONS: { value: MyRaceGoal; label: string; sub: string; color: string; bg: string }[] = [
  { value: 'pb',     label: '冲 PB',   sub: '全力备赛 · 三周减量', color: '#FFD60A', bg: 'rgba(255,214,10,0.15)'  },
  { value: 'finish', label: '认真完赛', sub: '稳健备赛 · 两周减量', color: '#32D74B', bg: 'rgba(50,215,75,0.15)'   },
  { value: 'fun',    label: '体验跑',   sub: '轻松参赛 · 不影响计划', color: '#0A84FF', bg: 'rgba(10,132,255,0.15)' },
];

const GOAL_SHORT: Record<MyRaceGoal, string> = { pb: 'PB', finish: '完赛', fun: '体验' };

const LABEL_CONFIG = {
  'iaaf-gold':   { text: '国际金标', color: '#FFD60A', bg: 'rgba(255,214,10,0.15)' },
  'iaaf-silver': { text: '国际银标', color: '#B0B0B0', bg: 'rgba(176,176,176,0.15)' },
  'iaaf-bronze': { text: '国际铜标', color: '#CD7F32', bg: 'rgba(205,127,50,0.15)'  },
};

const TERRAIN_LABEL: Record<string, string> = { flat: '平路', hilly: '起伏', mountain: '山地' };

const DIST_LABEL: Record<string, string> = { full: '全马', half: '半马', '10k': '10K' };

type RaceDataSource = 'json' | 'api' | 'seed';

const DATA_SOURCE_LABEL: Record<RaceDataSource, string> = {
  json: '线上赛事库',
  api: '爬虫服务',
  seed: '离线备用库',
};

const SOURCE_LABEL: Record<string, string> = {
  zuicool: '最酷',
  'zuicool-events': '最酷',
  'zuicool-reg': '最酷报名',
  nowrun: '闹跑',
  chinarun: 'CHINARUN',
  marathonbm: '马拉松报名',
  manual: '人工整理',
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

function classify(r: UnifiedRace): 'open' | 'upcoming' | 'tbd' | 'past' {
  if (r._dateTBD && r.date.slice(0, 4) < TODAY.slice(0, 4)) return 'past';
  if (r._dateTBD)      return 'tbd';
  if (r.date < TODAY)  return 'past';
  if (r.status === 'open') return 'open';
  return 'upcoming';
}

function locLabel(r: UnifiedRace): string {
  const p = r.province, c = r.city;
  if (!p && !c) return '';
  if (!c || p === c) return p || c;
  if (!p) return c;
  return `${p} · ${c}`;
}

function formatDate(dateStr: string, tbd?: boolean): string {
  if (!dateStr) return '日期未定';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (tbd) return `${y}年${m}月（待定）`;
  return `${y}年${m}月${d}日`;
}

function formatGeneratedAt(iso?: string): string {
  if (!iso) return '本地内置数据';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '更新时间未知';
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function sourceKeyLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

function raceSourceKeys(r: UnifiedRace): string[] {
  const raw = r.sources && r.sources.length > 0 ? r.sources : r._source ? [r._source] : [];
  return [...new Set(raw.filter(Boolean))];
}

function sourceSummary(r: UnifiedRace): string {
  const keys = raceSourceKeys(r);
  if (keys.length === 0) return '来源待补充';
  return keys.map(sourceKeyLabel).join(' / ');
}

/** Normalise the hand-curated seed races into UnifiedRace shape */
function normaliseSeed(r: typeof SEED_RACES[0]): UnifiedRace {
  return { ...r, _dateTBD: false } as UnifiedRace;
}

// ─── Proximity warning ────────────────────────────────────────────────────────

const MIN_GAP: Record<string, number> = {
  'full-full': 84,  // 12 weeks: full → full
  'full-half': 42,  // 6 weeks
  'half-full': 42,
  'half-half': 28,  // 4 weeks
  'full-10k':  28,
  '10k-full':  28,
  'half-10k':  14,  // 2 weeks
  '10k-half':  14,
  '10k-10k':   7,
};

function raceProximityWarning(
  newDate: string,
  newDist: MyRaceDistance,
  existing: { date?: string; dateTBD?: boolean; distance: MyRaceDistance; name?: string; raceId: string }[],
): string | null {
  for (const r of existing) {
    if (!r.date || r.dateTBD) continue;
    const diff = Math.abs(
      (new Date(newDate).getTime() - new Date(r.date).getTime()) / 86400000
    );
    const key = `${newDist}-${r.distance}`;
    const minGap = MIN_GAP[key] ?? 28;
    if (diff < minGap) {
      const name = r.name ?? r.raceId;
      return `距「${name}」仅 ${Math.round(diff)} 天，建议间隔 ${minGap / 7} 周以上`;
    }
  }
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RaceTab() {
  const { myRaces, addMyRace, removeMyRace, isPlanGenerated, setActiveTab } = useStore();

  // ── Data loading ──
  const [races, setRaces]       = useState<UnifiedRace[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dataMeta, setDataMeta] = useState<{
    source: RaceDataSource;
    generatedAt?: string;
    error?: string;
  }>({ source: 'seed' });

  useEffect(() => {
    let cancelled = false;

    async function loadRaces() {
      setLoading(true);
      const endpoints: { url: string; source: RaceDataSource }[] = [
        { url: '/races.json', source: 'json' },
        { url: '/api/data', source: 'api' },
      ];
      let lastError = '';

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, { cache: 'no-store' });
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const data: { races?: UnifiedRace[]; generatedAt?: string } = await response.json();
          const list = data.races ?? [];
          if (list.length > 0) {
            if (!cancelled) {
              setRaces(list);
              setDataMeta({ source: endpoint.source, generatedAt: data.generatedAt });
              setLoading(false);
            }
            return;
          }
          lastError = `${endpoint.url} 没有赛事数据`;
        } catch (err) {
          lastError = `${endpoint.url}: ${err instanceof Error ? err.message : '读取失败'}`;
        }
      }

      if (!cancelled) {
        setRaces(SEED_RACES.map(normaliseSeed));
        setDataMeta({ source: 'seed', error: lastError });
        setLoading(false);
      }
    }

    loadRaces();
    return () => { cancelled = true; };
  }, []);

  // ── Filter state ──
  const [query,        setQuery]        = useState('');
  const [distFilter,   setDistFilter]   = useState<'all' | 'full' | 'half'>('all');
  const [openOnly,     setOpenOnly]     = useState(false);
  const [province,     setProvince]     = useState('all');
  const [monthFilter,  setMonthFilter]  = useState('all');

  // ── Sheet state ──
  const [sheet, setSheet]           = useState<UnifiedRace | null>(null);
  const [pickedDist, setPickedDist] = useState<MyRaceDistance>('full');
  const [pickedGoal, setPickedGoal] = useState<MyRaceGoal>('pb');
  const prevPrimaryRef = useRef<string>(''); // tracks primary raceDate before save
  // Collapsible sections
  const [upcomingOpen, setUpcomingOpen] = useState<boolean | null>(null);
  const [tbdOpen,      setTbdOpen]      = useState(false);
  const [pastOpen,     setPastOpen]     = useState(false);

  // ── Custom race form state ──
  const [customOpen,  setCustomOpen]  = useState(false);
  const [customName,  setCustomName]  = useState('');
  const [customDate,  setCustomDate]  = useState('');
  const [customCity,  setCustomCity]  = useState('');
  const [customDist,  setCustomDist]  = useState<MyRaceDistance>('full');
  const [customGoal,  setCustomGoal]  = useState<MyRaceGoal>('pb');
  const [customError, setCustomError] = useState('');

  const openSheet = useCallback((r: UnifiedRace) => {
    setSheet(r);
    const mr = myRaces.find(m => m.raceId === r.id);
    setPickedDist((mr?.distance ?? r.distances[0] ?? 'full') as MyRaceDistance);
    setPickedGoal(mr?.goal ?? 'pb');
  }, [myRaces]);

  const proximityWarning = useMemo(() => {
    if (!sheet || !sheet.date || sheet._dateTBD) return null;
    const others = myRaces.filter(r => r.raceId !== sheet.id);
    return raceProximityWarning(sheet.date, pickedDist, others);
  }, [sheet, pickedDist, myRaces]);

  // ── Stats (global, not filtered) ──
  const stats = useMemo(() => {
    const openCount     = races.filter(r => classify(r) === 'open').length;
    const upcomingCount = races.filter(r => classify(r) === 'upcoming').length;
    const tbdCount      = races.filter(r => classify(r) === 'tbd').length;
    const pastCount     = races.filter(r => classify(r) === 'past').length;
    return { openCount, upcomingCount, tbdCount, pastCount };
  }, [races]);

  const dataTrust = useMemo(() => {
    const keys = new Set<string>();
    let multiSourceCount = 0;
    for (const race of races) {
      const raceKeys = raceSourceKeys(race);
      if (raceKeys.length > 1) multiSourceCount += 1;
      raceKeys.forEach(k => keys.add(k));
    }
    const names = [...keys].map(sourceKeyLabel);
    return {
      sourceNames: names.length > 0 ? names : ['人工整理'],
      multiSourceCount,
    };
  }, [races]);

  // ── Province list ──
  const provinces = useMemo(() => {
    const set = new Set(races.filter(r => classify(r) !== 'past').map(r => r.province).filter(Boolean));
    const domestic = [...set].filter(p => !FOREIGN_PROVINCES.has(p)).sort((a, b) => a.localeCompare(b, 'zh'));
    const hasForeign = [...set].some(p => FOREIGN_PROVINCES.has(p));
    return { domestic, hasForeign };
  }, [races]);

  // ── Month list (dynamic — based on province filter) ──
  const months = useMemo(() => {
    const relevant = races.filter(r => {
      if (classify(r) === 'past') return false;
      if (r._dateTBD) return false;
      if (province === '__foreign__' && !FOREIGN_PROVINCES.has(r.province)) return false;
      if (province !== 'all' && province !== '__foreign__' && r.province !== province) return false;
      return true;
    });
    return [...new Set(relevant.map(r => r.date.slice(0, 7)))].sort();
  }, [races, province]);

  // ── Filtered races ──
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return races.filter(r => {
      if (distFilter !== 'all' && !r.distances.includes(distFilter)) return false;
      if (openOnly && r.status !== 'open') return false;
      if (province === '__foreign__' && !FOREIGN_PROVINCES.has(r.province)) return false;
      else if (province !== 'all' && province !== '__foreign__' && r.province !== province) return false;
      if (monthFilter !== 'all' && !r.date.startsWith(monthFilter)) return false;
      if (q) return (r.name + r.city + r.province).toLowerCase().includes(q);
      return true;
    });
  }, [races, query, distFilter, openOnly, province, monthFilter]);

  // ── Sections ──
  const openRaces     = useMemo(() => filtered.filter(r => classify(r) === 'open').sort((a, b) => a.date.localeCompare(b.date)), [filtered]);
  const upcomingRaces = useMemo(() => filtered.filter(r => classify(r) === 'upcoming').sort((a, b) => a.date.localeCompare(b.date)), [filtered]);
  const tbdRaces      = useMemo(() => filtered.filter(r => classify(r) === 'tbd').sort((a, b) => a.date.localeCompare(b.date)), [filtered]);
  const pastRaces     = useMemo(() => filtered.filter(r => classify(r) === 'past').sort((a, b) => b.date.localeCompare(a.date)), [filtered]);

  const upcomingSectionOpen = upcomingOpen ?? openRaces.length === 0;

  // ── My races ──
  const myRacesSorted = useMemo(() =>
    [...myRaces].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [myRaces]
  );

  const isAdded = sheet ? myRaces.some(r => r.raceId === sheet.id) : false;

  // Keep prevPrimaryRef current — updated via store profile
  const { profile: storeProfile } = useStore();
  useEffect(() => { prevPrimaryRef.current = storeProfile.raceDate; }, [storeProfile.raceDate]);

  const handleSave = () => {
    if (!sheet) return;
    // Snapshot primary race date before mutation
    const prevPrimary = prevPrimaryRef.current;
    addMyRace(sheet.id, pickedDist, pickedGoal, {
      name: sheet.name, date: sheet.date, city: sheet.city,
      province: sheet.province, registrationUrl: sheet.registrationUrl,
      status: sheet.status, dateTBD: sheet._dateTBD,
    });
    setSheet(null);
    // If this is a PB race and plan exists → navigate to profile to regenerate
    if (pickedGoal === 'pb' && isPlanGenerated && sheet.date !== prevPrimary) {
      setActiveTab('profile');
    }
  };

  const handleRemove = () => {
    if (!sheet) return;
    removeMyRace(sheet.id);
    setSheet(null);
  };

  // ── Province change resets month ──
  const handleProvinceChange = (p: string) => {
    setProvince(p);
    setMonthFilter('all');
  };

  // ── Custom race save ──
  const openCustomSheet = () => {
    setCustomName('');
    setCustomDate('');
    setCustomCity('');
    setCustomDist('full');
    setCustomGoal('pb');
    setCustomError('');
    setCustomOpen(true);
  };

  const handleCustomSave = () => {
    if (!customName.trim()) { setCustomError('请填写赛事名称'); return; }
    if (!customDate)        { setCustomError('请选择日期'); return; }
    setCustomError('');
    const id = `custom-${Date.now()}`;
    const prevPrimary = prevPrimaryRef.current;
    addMyRace(id, customDist, customGoal, {
      name:     customName.trim(),
      date:     customDate,
      city:     customCity.trim() || '自定义',
      province: customCity.trim() || '',
      status:   'upcoming',
      dateTBD:  false,
    });
    setCustomOpen(false);
    if (customGoal === 'pb' && isPlanGenerated && customDate !== prevPrimary) {
      setActiveTab('profile');
    }
  };


  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="pb-8">

        {/* ── Stats bar ── */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 mb-4 scrollbar-hide">
          {/* 报名中 — clickable, toggles openOnly */}
          <button
            onClick={() => setOpenOnly(v => !v)}
            className={cn(
              'flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-2xl min-w-[76px] transition-all',
              openOnly
                ? 'bg-[var(--color-accent)]/15 ring-1 ring-[var(--color-accent)]/40'
                : 'bg-[var(--color-surface)]'
            )}
          >
            <span className={cn('text-[22px] font-bold leading-none', 'text-[var(--color-accent)]')}>
              {loading ? '—' : stats.openCount}
            </span>
            <span className="text-[10px] text-[var(--color-label-3)] mt-1">报名中</span>
          </button>
          <div className="flex-shrink-0 flex flex-col items-center bg-[var(--color-surface)] px-4 py-2.5 rounded-2xl min-w-[76px]">
            <span className="text-[22px] font-bold leading-none text-white">
              {loading ? '—' : stats.upcomingCount}
            </span>
            <span className="text-[10px] text-[var(--color-label-3)] mt-1">即将开赛</span>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center bg-[var(--color-surface)] px-4 py-2.5 rounded-2xl min-w-[76px]">
            <span className="text-[22px] font-bold leading-none text-[var(--color-orange)]">
              {loading ? '—' : stats.tbdCount}
            </span>
            <span className="text-[10px] text-[var(--color-label-3)] mt-1">日期待定</span>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center bg-[var(--color-surface)] px-4 py-2.5 rounded-2xl min-w-[76px]">
            <span className="text-[22px] font-bold leading-none text-[var(--color-label-3)]">
              {loading ? '—' : stats.pastCount}
            </span>
            <span className="text-[10px] text-[var(--color-label-4)] mt-1">已结束</span>
          </div>
        </div>

        {!loading && (
          <div className={cn(
            'rounded-2xl px-4 py-3 mb-3 border',
            dataMeta.source === 'seed'
              ? 'bg-[var(--color-orange)]/8 border-[var(--color-orange)]/25'
              : 'bg-[var(--color-surface)] border-[var(--color-separator)]'
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                dataMeta.source === 'seed' ? 'bg-[var(--color-orange)]/15' : 'bg-[var(--color-accent)]/12'
              )}>
                {dataMeta.source === 'seed'
                  ? <AlertTriangle className="w-4 h-4 text-[var(--color-orange)]" />
                  : <ShieldCheck className="w-4 h-4 text-[var(--color-accent)]" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-white">{DATA_SOURCE_LABEL[dataMeta.source]} · {races.length} 场</p>
                  <span className="text-[10px] text-[var(--color-label-3)] whitespace-nowrap">
                    {formatGeneratedAt(dataMeta.generatedAt)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-label-3)] mt-1 leading-relaxed">
                  来源：{dataTrust.sourceNames.join(' / ')}
                  {dataTrust.multiSourceCount > 0 && ` · ${dataTrust.multiSourceCount} 场多源确认`}
                </p>
                {dataMeta.source === 'seed' && (
                  <p className="text-[11px] text-[var(--color-orange)] mt-1 leading-relaxed">
                    当前使用离线备用数据，赛事数量会少于正式发布库。
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Search ── */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-label-3)]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索赛事名称或城市…"
            className="w-full bg-[var(--color-surface)] text-white rounded-2xl pl-10 pr-10 py-3 text-[14px] outline-none placeholder:text-[var(--color-label-4)] border border-transparent focus:border-[var(--color-accent)]/40"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-label-3)]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Filter row: distance + open + province ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 mb-2 scrollbar-hide">
          {(['all', 'full', 'half'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDistFilter(d)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all',
                distFilter === d
                  ? 'bg-[var(--color-accent)] text-black'
                  : 'bg-[var(--color-surface)] text-[var(--color-label-2)]'
              )}
            >
              {d === 'all' ? '全部' : d === 'full' ? '全马' : '半马'}
            </button>
          ))}

          <div className="w-px h-4 bg-[var(--color-separator)] flex-shrink-0" />

          {/* 报名中 chip */}
          <button
            onClick={() => setOpenOnly(v => !v)}
            className={cn(
              'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all',
              openOnly
                ? 'bg-[var(--color-accent)] text-black'
                : 'bg-[var(--color-surface)] text-[var(--color-label-2)]'
            )}
          >
            报名中
          </button>

          <div className="w-px h-4 bg-[var(--color-separator)] flex-shrink-0" />

          {/* Province select */}
          <div className="relative flex-shrink-0">
            <select
              value={province}
              onChange={e => handleProvinceChange(e.target.value)}
              className="appearance-none bg-[var(--color-surface)] text-[var(--color-label-2)] text-[12px] font-semibold pl-3 pr-7 py-1.5 rounded-full outline-none cursor-pointer border border-transparent focus:border-[var(--color-accent)]/40"
            >
              <option value="all">全国</option>
              {provinces.domestic.map(p => <option key={p} value={p}>{p}</option>)}
              {provinces.hasForeign && <option value="__foreign__">国外 🌐</option>}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-label-3)] pointer-events-none" />
          </div>
        </div>

        {/* ── Month chips ── */}
        {months.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 mb-4 scrollbar-hide">
            <button
              onClick={() => setMonthFilter('all')}
              className={cn(
                'flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-all',
                monthFilter === 'all'
                  ? 'bg-[var(--color-accent)] text-black'
                  : 'bg-[var(--color-surface)] text-[var(--color-label-3)]'
              )}
            >
              全部
            </button>
            {months.map(m => {
              const [, mo] = m.split('-');
              return (
                <button
                  key={m}
                  onClick={() => setMonthFilter(m)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-all',
                    monthFilter === m
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'bg-[var(--color-surface)] text-[var(--color-label-3)]'
                  )}
                >
                  {parseInt(mo)}月
                </button>
              );
            })}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="text-center py-10 text-[var(--color-label-3)] text-[13px]">加载赛事数据中…</div>
        )}

        {/* ── My races ── */}
        {!loading && myRacesSorted.length > 0 && (
          <div className="mb-5">
            <SectionLabel icon={<Star className="w-3 h-3" />} title={`我的赛事 · ${myRacesSorted.length} 场`} color="accent" />
            <div className="space-y-2 mt-2">
              {myRacesSorted.map(mr => {
                const live = races.find(r => r.id === mr.raceId);
                const name     = live?.name     ?? mr.name     ?? mr.raceId;
                const date     = live?.date      ?? mr.date     ?? '';
                const city     = live?.city      ?? mr.city     ?? '';
                const regUrl   = live?.registrationUrl ?? mr.registrationUrl;
                const isLiveOpen = (live?.status ?? mr.status) === 'open';
                const goalOpt = GOAL_OPTIONS.find(g => g.value === mr.goal)!;
                return (
                  <div
                    key={mr.raceId}
                    className="bg-[var(--color-surface)] rounded-2xl px-4 py-3 flex items-center gap-3 border border-[var(--color-accent)]/15"
                  >
                    <span
                      className="h-7 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center flex-shrink-0 whitespace-nowrap"
                      style={{ color: goalOpt.color, background: goalOpt.bg }}
                    >
                      {goalOpt.label}
                    </span>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => live && openSheet(live)} >
                      <p className="text-[14px] font-semibold text-white truncate">{name}</p>
                      <p className="text-[11px] text-[var(--color-label-3)] mt-0.5 truncate">
                        {date ? formatDate(date, mr.dateTBD) : '日期未定'}
                        {city ? ` · ${city}` : ''}
                        {' · '}{DIST_LABEL[mr.distance]}
                      </p>
                    </div>
                    {isLiveOpen && regUrl && (
                      <a
                        href={regUrl} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 px-2.5 py-1 bg-[var(--color-accent)] text-black text-[10px] font-bold rounded-lg whitespace-nowrap"
                      >
                        报名 →
                      </a>
                    )}
                    <button
                      onClick={() => removeMyRace(mr.raceId)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--color-label-4)] active:text-[var(--color-red)] flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 报名中 section ── */}
        {!loading && openRaces.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between py-2 mb-1">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-accent)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] inline-block" />
                报名中
              </span>
              <span className="text-[11px] text-[var(--color-label-4)]">{openRaces.length} 场</span>
            </div>
            <RaceCardGroup races={openRaces} myRaces={myRaces} onOpen={openSheet} />
          </div>
        )}

        {/* ── 日期已公布 section ── */}
        {!loading && upcomingRaces.length > 0 && (
          <div className="mb-5">
            <button
              className="w-full flex items-center justify-between py-2 mb-1"
              onClick={() => setUpcomingOpen(v => !(v ?? openRaces.length === 0))}
            >
              <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-label-3)]">日期已公布</span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-label-4)]">
                {upcomingRaces.length} 场
                {upcomingSectionOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            </button>
            {upcomingSectionOpen && <RaceCardGroup races={upcomingRaces} myRaces={myRaces} onOpen={openSheet} />}
          </div>
        )}

        {/* ── 日期待定 section ── */}
        {!loading && tbdRaces.length > 0 && (
          <div className="mb-5">
            <button
              className="w-full flex items-center justify-between py-2 mb-1"
              onClick={() => setTbdOpen(v => !v)}
            >
              <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-label-3)]">日期待定</span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-label-4)]">
                {tbdRaces.length} 场
                {tbdOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            </button>
            {tbdOpen && <RaceCardGroup races={tbdRaces} myRaces={myRaces} onOpen={openSheet} />}
          </div>
        )}

        {/* ── 已结束 section ── */}
        {!loading && pastRaces.length > 0 && (
          <div className="mb-5">
            <button
              className="w-full flex items-center justify-between py-2 mb-1"
              onClick={() => setPastOpen(v => !v)}
            >
              <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-label-3)]">已结束</span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-label-4)]">
                {pastRaces.length} 场
                {pastOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            </button>
            {pastOpen && <RaceCardGroup races={pastRaces} myRaces={myRaces} onOpen={openSheet} />}
          </div>
        )}

        {/* Empty */}
        {!loading && openRaces.length === 0 && upcomingRaces.length === 0 && tbdRaces.length === 0 && (
          <div className="text-center py-16 text-[var(--color-label-3)] text-[14px]">没有找到相关赛事</div>
        )}

        {/* Data source hint */}
        {!loading && (
          <p className="text-center text-[10px] text-[var(--color-label-4)] mt-2">
            {DATA_SOURCE_LABEL[dataMeta.source]} · {races.length} 场 · {formatGeneratedAt(dataMeta.generatedAt)}
          </p>
        )}

        {/* ── Custom race entry button ── */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={openCustomSheet}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-dashed border-[var(--color-label-4)] text-[var(--color-label-3)] text-[13px] font-medium active:opacity-70 transition-opacity"
          >
            <span className="text-[16px] leading-none">＋</span>
            找不到你的赛事？手动添加
          </button>
        </div>
      </div>

      {/* ── Custom race sheet ── */}
      {customOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setCustomOpen(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
            </div>

            <div className="px-5 pt-2 pb-2">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[18px] font-bold text-white">手动添加赛事</h2>
                <button
                  onClick={() => setCustomOpen(false)}
                  className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-label-2)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Name */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider block mb-1.5">赛事名称 *</label>
                <input
                  type="text"
                  placeholder="例：2026 厦门马拉松"
                  value={customName}
                  onChange={e => { setCustomName(e.target.value); setCustomError(''); }}
                  className="w-full bg-[var(--color-surface-2)] rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-[var(--color-label-4)] outline-none border border-transparent focus:border-[var(--color-accent)]/40 transition-colors"
                />
              </div>

              {/* Date + City row */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider block mb-1.5">日期 *</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => { setCustomDate(e.target.value); setCustomError(''); }}
                    className="w-full bg-[var(--color-surface-2)] rounded-xl px-3 py-3 text-[14px] text-white outline-none border border-transparent focus:border-[var(--color-accent)]/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider block mb-1.5">城市</label>
                  <input
                    type="text"
                    placeholder="例：厦门"
                    value={customCity}
                    onChange={e => setCustomCity(e.target.value)}
                    className="w-full bg-[var(--color-surface-2)] rounded-xl px-3 py-3 text-[14px] text-white placeholder:text-[var(--color-label-4)] outline-none border border-transparent focus:border-[var(--color-accent)]/40 transition-colors"
                  />
                </div>
              </div>

              {/* Distance picker */}
              <div className="mb-4">
                <label className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider block mb-1.5">参赛距离</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['full', 'half', '10k'] as MyRaceDistance[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setCustomDist(d)}
                      className={cn(
                        'py-2.5 rounded-xl border text-[13px] font-semibold transition-all',
                        customDist === d
                          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40'
                          : 'border-[var(--color-separator)] text-[var(--color-label-3)] bg-[var(--color-surface-2)]'
                      )}
                    >
                      {DIST_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal picker */}
              <div className="mb-5">
                <label className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider block mb-1.5">参赛目标</label>
                <div className="grid grid-cols-3 gap-2">
                  {GOAL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setCustomGoal(opt.value)}
                      className={cn('py-3 rounded-xl border text-left px-3 transition-all', customGoal === opt.value ? 'border-transparent' : 'border-[var(--color-separator)] bg-[var(--color-surface-2)]')}
                      style={customGoal === opt.value ? { background: opt.bg, borderColor: opt.color + '40' } : {}}
                    >
                      <p className="text-[13px] font-bold leading-none" style={customGoal === opt.value ? { color: opt.color } : { color: 'var(--color-label-2)' }}>{opt.label}</p>
                      <p className="text-[9px] text-[var(--color-label-3)] mt-1 leading-tight">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Inline error */}
              {customError && (
                <p className="mb-3 text-[12px] text-[var(--color-red)] font-medium">{customError}</p>
              )}

              {/* Save */}
              <button
                onClick={handleCustomSave}
                className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px] flex items-center justify-center gap-2"
              >
                <Flag className="w-4 h-4" /> 加入我的赛事
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail sheet ── */}
      {sheet && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSheet(null)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
            </div>

            <div className="px-5 pt-2 pb-2">
              {/* Header */}
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-[19px] font-bold text-white leading-tight flex-1 pr-3">{sheet.name}</h2>
                <button
                  onClick={() => setSheet(null)}
                  className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-label-2)] flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status + label badges */}
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {sheet.status === 'open' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ color: '#32D74B', background: 'rgba(50,215,75,0.12)' }}>● 报名中</span>
                )}
                {sheet.status === 'closed' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: 'var(--color-red)', background: 'var(--color-surface-2)' }}>报名已截止</span>
                )}
                {sheet.status === 'postponed' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: 'var(--color-orange)', background: 'var(--color-surface-2)' }}>已延期</span>
                )}
                {sheet.status === 'cancelled' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: 'var(--color-red)', background: 'var(--color-surface-2)' }}>已取消</span>
                )}
                {sheet.label && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ color: LABEL_CONFIG[sheet.label].color, background: LABEL_CONFIG[sheet.label].bg }}>
                    {LABEL_CONFIG[sheet.label].text}
                  </span>
                )}
              </div>

              {/* Info grid */}
              <div className="bg-[var(--color-surface-2)] rounded-2xl px-4 py-3 grid grid-cols-2 gap-3 mb-4">
                <InfoCell label="日期" value={formatDate(sheet.date, sheet._dateTBD)} />
                <InfoCell label="城市" value={locLabel(sheet)} />
                <InfoCell label="赛道" value={TERRAIN_LABEL[sheet.terrain] ?? '平路'} />
                <InfoCell
                  label={raceSourceKeys(sheet).length > 1 ? '多源确认' : '数据来源'}
                  value={sourceSummary(sheet)}
                  accent={raceSourceKeys(sheet).length > 1}
                />
                {sheet.altitude && sheet.altitude > 1000 && (
                  <InfoCell label="海拔" value={`${sheet.altitude.toLocaleString()} m`} accent />
                )}
              </div>

              {raceSourceKeys(sheet).length > 1 && (
                <p className="text-[12px] text-[var(--color-label-2)] leading-relaxed bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/18 rounded-xl px-4 py-3 mb-4">
                  多个公开来源匹配到同一赛事，日期、城市和项目可信度更高；报名前仍建议以官网页面为准。
                </p>
              )}

              {sheet.note && (
                <p className="text-[12px] text-[var(--color-label-2)] leading-relaxed bg-[var(--color-surface-2)] rounded-xl px-4 py-3 mb-4">{sheet.note}</p>
              )}

              {/* Distance picker */}
              {sheet.distances.length > 1 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-2">参赛距离</p>
                  <div className={cn('grid gap-2', sheet.distances.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                    {sheet.distances.map(d => (
                      <button
                        key={d}
                        onClick={() => setPickedDist(d as MyRaceDistance)}
                        className={cn(
                          'py-2.5 rounded-xl border text-[12px] font-semibold transition-all',
                          pickedDist === d
                            ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40'
                            : 'border-[var(--color-separator)] text-[var(--color-label-3)] bg-[var(--color-surface-2)]'
                        )}
                      >
                        {DIST_LABEL[d] ?? d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Goal picker */}
              <div className="mb-5">
                <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-2">参赛目标</p>
                <div className="grid grid-cols-3 gap-2">
                  {GOAL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPickedGoal(opt.value)}
                      className={cn('py-3 rounded-xl border text-left px-3 transition-all', pickedGoal === opt.value ? 'border-transparent' : 'border-[var(--color-separator)] bg-[var(--color-surface-2)]')}
                      style={pickedGoal === opt.value ? { background: opt.bg, borderColor: opt.color + '40' } : {}}
                    >
                      <p className="text-[13px] font-bold leading-none" style={pickedGoal === opt.value ? { color: opt.color } : { color: 'var(--color-label-2)' }}>{opt.label}</p>
                      <p className="text-[9px] text-[var(--color-label-3)] mt-1 leading-tight">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Proximity warning */}
              {proximityWarning && (
                <div className="mb-4 flex items-start gap-2.5 bg-[var(--color-orange)]/10 border border-[var(--color-orange)]/30 rounded-xl px-3.5 py-3">
                  <span className="text-[var(--color-orange)] text-[14px] flex-shrink-0">⚠</span>
                  <p className="text-[12px] text-[var(--color-orange)] leading-relaxed">{proximityWarning}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {isAdded ? (
                  <>
                    <button onClick={handleSave} className="flex-1 bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px]">更新目标</button>
                    <button onClick={handleRemove} className="w-14 bg-[var(--color-surface-2)] text-[var(--color-red)] font-semibold py-3.5 rounded-2xl flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button onClick={handleSave} className="flex-1 bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px] flex items-center justify-center gap-2">
                    <Flag className="w-4 h-4" /> 加入我的赛事
                  </button>
                )}
                {sheet.status === 'open' && sheet.registrationUrl && (
                  <a
                    href={sheet.registrationUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 text-[var(--color-accent)] font-bold py-3.5 rounded-2xl text-[14px]"
                  >
                    <ExternalLink className="w-4 h-4" /> 去官网报名
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ icon, title, color }: { icon?: React.ReactNode; title: string; color?: 'accent' | 'dim' }) {
  return (
    <p className={cn(
      'text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5',
      color === 'accent' ? 'text-[var(--color-accent)]' : 'text-[var(--color-label-3)]'
    )}>
      {icon}{title}
    </p>
  );
}

function InfoCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-[var(--color-label-3)] uppercase tracking-wider">{label}</p>
      <p className={cn('text-[13px] font-medium mt-0.5', accent ? 'text-[var(--color-orange)]' : 'text-white')}>{value}</p>
    </div>
  );
}

function RaceCardGroup({
  races, myRaces, onOpen,
}: {
  races: UnifiedRace[];
  myRaces: MyRace[];
  onOpen: (r: UnifiedRace) => void;
}) {
  function groupByMonth(list: UnifiedRace[]) {
    const map = new Map<string, UnifiedRace[]>();
    for (const r of list) {
      const k = r.date.slice(0, 7);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }

  const grouped = groupByMonth(races);

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([mk, group]) => {
        const [y, m] = mk.split('-');
        return (
          <div key={mk}>
            <p className="text-[10px] font-semibold text-[var(--color-label-4)] uppercase tracking-wider mb-1.5 px-0.5">
              {y}年 {parseInt(m)}月 · {group.length} 场
            </p>
            <div className="bg-[var(--color-surface)] rounded-2xl overflow-hidden">
              {group.map((race, idx) => {
                const mr      = myRaces.find(r => r.raceId === race.id);
                const added   = !!mr;
                const isOpen  = race.status === 'open';
                const goalOpt = mr ? GOAL_OPTIONS.find(g => g.value === mr.goal) : null;
                const [,, d]  = race.date.split('-').map(Number);
                const MON     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const monStr  = MON[(parseInt(race.date.split('-')[1]) - 1)];

                return (
                  <button
                    key={race.id}
                    onClick={() => onOpen(race)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-[var(--color-surface-2)]',
                      idx < group.length - 1 && 'border-b border-[var(--color-separator)]',
                      isOpen && 'border-l-2 border-l-[var(--color-accent)]/50'
                    )}
                  >
                    {/* Date */}
                    <div className="w-9 flex-shrink-0 text-center">
                      <p className="text-[18px] font-bold text-white leading-none">{d}</p>
                      <p className="text-[9px] text-[var(--color-label-3)] mt-0.5">{monStr}</p>
                      {race._dateTBD && <p className="text-[8px] text-[var(--color-orange)] font-bold mt-0.5">待定</p>}
                    </div>

                    <div className="w-px h-9 bg-[var(--color-separator)] flex-shrink-0" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14px] font-semibold text-white leading-snug">{race.name}</span>
                        {race.label && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ color: LABEL_CONFIG[race.label].color, background: LABEL_CONFIG[race.label].bg }}>
                            {LABEL_CONFIG[race.label].text}
                          </span>
                        )}
                        {raceSourceKeys(race).length > 1 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/12 text-[var(--color-accent)]">
                            多源
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-[var(--color-label-3)] flex items-center gap-0.5">
                          {FOREIGN_PROVINCES.has(race.province)
                            ? <Globe className="w-2.5 h-2.5" />
                            : <MapPin className="w-2.5 h-2.5" />}
                          {locLabel(race)}
                        </span>
                        <span className="text-[var(--color-separator)]">·</span>
                        <span className="text-[11px] text-[var(--color-label-3)]">
                          {race.distances.map(d => DIST_LABEL[d] ?? d).join(' / ')}
                        </span>
                      </div>
                    </div>

                    {/* Right: reg CTA or goal badge or chevron */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {isOpen && race.registrationUrl && (
                        <a
                          href={race.registrationUrl} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="px-2.5 py-1 bg-[var(--color-accent)] text-black text-[10px] font-bold rounded-lg whitespace-nowrap"
                        >
                          去报名 →
                        </a>
                      )}
                      {added && goalOpt ? (
                        <span className="text-[9px] font-bold px-2 py-1 rounded-md whitespace-nowrap" style={{ color: goalOpt.color, background: goalOpt.bg }}>
                          {GOAL_SHORT[mr!.goal]}
                        </span>
                      ) : !isOpen && (
                        <ChevronRight className="w-4 h-4 text-[var(--color-label-4)]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
