import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { startCorosConnect, disconnectCoros, tryImportDevAuth } from '../../utils/coros-mcp';
import { runCorosSync, type SyncProgress } from '../../utils/insights/coros-sync';
import { CoachSection } from './CoachSection';
import { FitnessCard } from './FitnessCard';
import { LoadChart } from './LoadChart';
import { EfficiencySection } from './EfficiencySection';
import { SeilerCard } from './SeilerCard';
import { DecouplingChart } from './DecouplingChart';
import { PaceAnalysis } from './PaceAnalysis';
import { ActivityDetail } from './ActivityDetail';
import { HrAnalysis } from './HrAnalysis';
import { SleepRecovery } from './SleepRecovery';
import { ActivityOverview } from './ActivityOverview';

export default function InsightsTab() {
  const {
    corosSnapshot, corosAuth, corosLastSyncAt, corosSyncIntervalDays,
    importCorosSnapshot, updateCorosAuth,
    setCorosLastSync, setCorosSyncIntervalDays,
  } = useStore();

  const [syncing, setSyncing] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncGuard = useRef(false);

  const doSync = async (auth: typeof corosAuth) => {
    if (!auth || syncGuard.current) return;
    syncGuard.current = true;
    setSyncError(null);
    setSyncing({ step: '开始同步…', current: 0, total: 0 });
    try {
      const result = await runCorosSync(auth, (p) => setSyncing(p));
      const err = importCorosSnapshot(result.snapshot);
      if (err) throw new Error(err);
      updateCorosAuth(result.nextAuth);
      setCorosLastSync(new Date().toISOString());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncing(null);
      syncGuard.current = false;
    }
  };

  // 打开页面时：已连接且数据过期 → 自动同步
  useEffect(() => {
    if (!corosAuth || syncing || syncGuard.current) return;
    const stale =
      !corosLastSyncAt ||
      Date.now() - new Date(corosLastSyncAt).getTime() > corosSyncIntervalDays * 86400000;
    if (stale) void doSync(corosAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corosAuth]);

  // 开发环境：自动复用本机 OpenCode 的 COROS 授权（免反复 OAuth；生产不触发）
  useEffect(() => {
    if (corosAuth || !import.meta.env.DEV) return;
    let cancelled = false;
    void tryImportDevAuth().then((auth) => {
      if (!cancelled && auth) updateCorosAuth(auth);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 未连接：连接引导 + 手动导入兜底 ──
  if (!corosAuth) {
    return (
      <div className="pb-6">
        <ConnectPanel onConnect={() => void startCorosConnect()} />
        <div className="mt-4 pt-4 border-t border-[var(--color-separator)]">
          <ManualImport onImport={importCorosSnapshot} />
        </div>
        {corosSnapshot && <SnapshotDashboard />}
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* ── 连接与同步状态条 ── */}
      <div className="rounded-2xl bg-[var(--color-surface)] px-4 py-3 mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
          <p className="text-[13.5px] font-semibold whitespace-nowrap">COROS 已连接</p>
          {import.meta.env.DEV && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-blue)]/15 text-[var(--color-blue)] whitespace-nowrap">开发模式 · 复用本机授权</span>
          )}
          <span className="text-[11.5px] text-[var(--color-label-3)] truncate">
            {corosLastSyncAt
              ? `上次同步 ${new Date(corosLastSyncAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
              : '尚未同步'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <label className="text-[11.5px] text-[var(--color-label-3)] flex items-center gap-1">
            每
            <select
              value={corosSyncIntervalDays}
              onChange={(e) => setCorosSyncIntervalDays(Number(e.target.value))}
              className="bg-[var(--color-surface-2)] text-white text-[11.5px] rounded-md px-1.5 py-1 border border-[var(--color-separator)] outline-none"
            >
              <option value={1}>1 天</option>
              <option value={3}>3 天</option>
              <option value={7}>7 天</option>
            </select>
            自动同步
          </label>
          <div className="flex-1" />
          <button
            onClick={() => void doSync(corosAuth)}
            disabled={!!syncing}
            className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-black hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
          <button
            onClick={() => { disconnectCoros(); updateCorosAuth(null); }}
            className="text-[12px] px-2.5 py-1.5 rounded-lg border border-[var(--color-separator)] text-[var(--color-label-3)] hover:text-[var(--color-red)] transition-colors"
          >
            断开
          </button>
        </div>
        {syncing && (
          <p className="text-[11.5px] text-[var(--color-label-2)] mt-2">
            {syncing.step}{syncing.total > 0 ? `（${syncing.current}/${syncing.total}）` : ''}
          </p>
        )}
        {syncError && (
          <p className="text-[11.5px] text-[var(--color-red)] mt-2">同步失败：{syncError}</p>
        )}
      </div>

      {corosSnapshot ? (
        <SnapshotDashboard />
      ) : (
        <div className="pt-8 text-center text-[13px] text-[var(--color-label-3)]">
          {syncing ? '正在从 COROS 拉取你的训练数据…' : '点击「立即同步」拉取 COROS 数据'}
        </div>
      )}
    </div>
  );
}

// ── 面板主体（快照存在时）─────────────────────────────────────────────────────

function SnapshotDashboard() {
  const { corosSnapshot, clearCorosSnapshot } = useStore();
  if (!corosSnapshot) return null;
  const runs = corosSnapshot.activities.filter((a) => a.type === 'run').length;
  const dates = corosSnapshot.activities.map((a) => a.date).sort();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-3 pb-3">
        <Badge>{corosSnapshot.device ?? 'COROS'}</Badge>
        <Badge>{dates[0]} ~ {dates[dates.length - 1]}</Badge>
        <Badge>{corosSnapshot.activities.length} 活动 · {runs} 跑步</Badge>
        <button
          onClick={clearCorosSnapshot}
          className="ml-auto text-[12px] text-[var(--color-label-3)] hover:text-[var(--color-red)] px-2.5 py-1 rounded-lg border border-[var(--color-separator)] transition-colors"
        >
          清除数据
        </button>
      </div>
      <div className="space-y-4">
        <InsightAnchorNav />
        <CoachSection id="insight-rx" snapshot={corosSnapshot} />
        <div className="grid grid-cols-1 gap-4">
          <FitnessCard snapshot={corosSnapshot} />
          <LoadChart id="insight-load" snapshot={corosSnapshot} />
          <div className="min-w-0"><EfficiencySection id="insight-ef" snapshot={corosSnapshot} /></div>
          <div className="min-w-0"><SeilerCard id="insight-seiler" snapshot={corosSnapshot} /></div>
          <div className="min-w-0"><DecouplingChart snapshot={corosSnapshot} /></div>
          <div className="min-w-0"><PaceAnalysis snapshot={corosSnapshot} /></div>
          <div className="min-w-0"><ActivityDetail snapshot={corosSnapshot} /></div>
          <HrAnalysis snapshot={corosSnapshot} />
          <SleepRecovery id="insight-recovery" snapshot={corosSnapshot} />
          <div className="min-w-0"><ActivityOverview id="insight-activity" snapshot={corosSnapshot} /></div>
        </div>
      </div>
    </>
  );
}

// ── 锚点导航（洞察长页面目录）────────────────────────────────────────────────

const INSIGHT_ANCHORS = [
  { id: 'insight-rx', label: '处方' },
  { id: 'insight-load', label: '负荷' },
  { id: 'insight-ef', label: '效率' },
  { id: 'insight-seiler', label: '强度' },
  { id: 'insight-recovery', label: '恢复' },
  { id: 'insight-activity', label: '活动' },
];

function InsightAnchorNav() {
  const [active, setActive] = useState('insight-rx');

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-70px 0px -60% 0px' },
    );
    for (const a of INSIGHT_ANCHORS) {
      const el = document.getElementById(a.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <div className="sticky top-14 z-30 -mx-4 px-4 py-2 bg-[var(--color-bg)]/85 backdrop-blur-xl border-b border-[var(--color-separator)] overflow-x-auto">
      <div className="flex gap-1.5 min-w-max">
        {INSIGHT_ANCHORS.map((a) => (
          <button
            key={a.id}
            onClick={() => document.getElementById(a.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`text-[12px] px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              active === a.id
                ? 'bg-[var(--color-accent)] text-black font-semibold'
                : 'bg-[var(--color-surface-2)] text-[var(--color-label-2)] hover:text-white'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 未连接面板 ────────────────────────────────────────────────────────────────

function ConnectPanel({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="pt-6">
      <h2 className="text-[20px] font-bold tracking-tight">连接你的 COROS</h2>
      <p className="text-[13px] text-[var(--color-label-2)] mt-1.5 leading-relaxed">
        授权后，应用直接从 COROS 拉取你的训练数据（活动、负荷、睡眠、HRV、体能评估），
        自动解读并校准训练计划。数据与授权凭据只存本机。
      </p>
      <p className="text-[12px] text-[var(--color-label-3)] mt-1.5">
        没有 COROS 手表？无需理会本页，训练计划功能不受影响。
      </p>
      <button
        onClick={onConnect}
        className="mt-4 w-full max-w-[420px] rounded-2xl bg-[var(--color-accent)] text-black text-[15px] font-semibold py-3.5 hover:opacity-90 transition-opacity"
      >
        连接 COROS（官方授权）
      </button>
    </div>
  );
}

// ── 手动导入：Garmin FIT 为主入口（拖拽/点选 + 导出引导），COROS 快照折叠 ──

function ManualImport({ onImport }: { onImport: (data: unknown) => string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList) => {
    setError(null);
    const files = Array.from(list);
    const fits = files.filter((f) => /\.fit$/i.test(f.name));
    const jsons = files.filter((f) => /\.json$/i.test(f.name));

    if (fits.length > 0) {
      setBusy(true);
      try {
        const { parseFitFiles } = await import('../../utils/insights/fit-adapter');
        const buffers = await Promise.all(
          fits.map((f) => f.arrayBuffer().then((buffer) => ({ name: f.name, buffer }))),
        );
        const { snapshot, failed } = await parseFitFiles(buffers);
        if (snapshot.activities.length === 0) {
          setError('未能从 FIT 文件解析出活动');
        } else {
          const err = onImport(snapshot);
          if (err) setError(err);
          else if (failed > 0) setError(`已导入 ${snapshot.activities.length} 个活动，${failed} 个文件解析失败`);
        }
      } catch {
        setError('FIT 解析失败');
      } finally {
        setBusy(false);
      }
      return;
    }

    const f = jsons[0] ?? files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setError(onImport(JSON.parse(String(reader.result))));
      } catch {
        setError('文件不是有效的 JSON');
      }
    };
    reader.readAsText(f);
  };

  return (
    <div
      className={`rounded-2xl p-4 border border-dashed transition-colors ${dragOver ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]' : 'border-[var(--color-separator)]'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files); }}
    >
      <p className="text-[13px] font-semibold text-white">Garmin 用户</p>
      <p className="text-[12px] text-[var(--color-label-3)] mt-1 leading-relaxed">
        把 Garmin 活动导出为 .fit 文件后拖进来，或点下面按钮直接选择（手机会打开文件 App）。
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 min-w-[140px] text-[13px] font-semibold px-4 py-3 rounded-xl bg-[var(--color-accent)] text-black hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? '解析中…' : '选择 / 拖入 .fit 文件'}
        </button>
        <a
          href="https://connect.garmin.com/modern/activities"
          target="_blank"
          rel="noopener"
          className="text-[12.5px] px-3 py-3 rounded-xl border border-[var(--color-separator)] text-[var(--color-label-2)] hover:text-white transition-colors"
        >
          去 Garmin Connect 导出 ↗
        </a>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".fit"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ''; }}
      />

      <details className="mt-3">
        <summary className="cursor-pointer list-none text-[11.5px] text-[var(--color-label-3)] hover:text-white transition-colors">
          怎么导出 .fit？（手机 / 电脑）▾
        </summary>
        <ol className="mt-2 space-y-1 text-[11.5px] text-[var(--color-label-2)] leading-relaxed list-decimal list-inside">
          <li>手机浏览器（或电脑）打开 connect.garmin.com 并登录</li>
          <li>进入「活动」→ 点某次活动 → 右上角齿轮 → 导出</li>
          <li>选「导出文件」（即原始 .fit）；手机若无齿轮，把浏览器切到「桌面版网站」</li>
          <li>重复导出想分析的几次跑步，回到本页一次拖入</li>
        </ol>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer list-none text-[11.5px] text-[var(--color-label-3)] hover:text-white transition-colors">
          有 COROS 快照文件（.json）？▾
        </summary>
        <button
          onClick={() => jsonRef.current?.click()}
          className="mt-2 text-[12px] px-3 py-2 rounded-lg border border-[var(--color-separator)] text-[var(--color-label-2)] hover:text-white transition-colors"
        >
          选择 coros-snapshot.json
        </button>
        <input
          ref={jsonRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ''; }}
        />
      </details>

      {error && <p className="text-[12px] text-[var(--color-red)] mt-2">{error}</p>}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-label-2)]">
      {children}
    </span>
  );
}
