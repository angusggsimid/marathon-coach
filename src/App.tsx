import { type ReactNode, useState, useEffect, lazy, Suspense } from 'react';
import { ProfileForm } from './components/ProfileForm';
import { TrainingStats } from './components/TrainingStats';
import { CalendarView } from './components/CalendarView';
import { RaceTab } from './components/RaceTab';
import { WeChatEscapeBanner } from './components/WeChatEscapeBanner';
import { Activity, CalendarDays, User, Flag, Brain } from 'lucide-react';
import { useStore } from './store/useStore';
import { cn } from './utils/cn';

// 洞察 Tab 代码分割：echarts 等重依赖不进首屏包
const InsightsTab = lazy(() => import('./components/insights/InsightsTab'));
import {
  detectDisplayMode,
  mutateMetrics,
  recordAppInstalled,
  recordBeforeInstallPrompt,
  recordOpen,
} from './utils/local-metrics';
import { isWeChatUA } from './utils/wechat';
import { handleCorosCallback } from './utils/coros-mcp';

function App() {
  const { activeTab, setActiveTab, isPlanGenerated, updateCorosAuth } = useStore();
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // COROS OAuth 授权回调：交换 token → 保存 → 清理 URL → 跳转洞察 Tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await handleCorosCallback(code, state);
        if (cancelled) return;
        updateCorosAuth(auth);
        history.replaceState(null, '', location.pathname);
        setActiveTab('insights');
        showToast('COROS 已连接');
      } catch (e) {
        if (!cancelled) showToast(e instanceof Error ? e.message : 'COROS 连接失败');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 本机会话指标：打开、display-mode、微信入口、安装事件（不上传）
  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    mutateMetrics(s =>
      recordOpen(s, {
        displayMode: detectDisplayMode(),
        isWeChat: isWeChatUA(ua),
      }),
    );

    const onBip = () => {
      mutateMetrics(s => recordBeforeInstallPrompt(s));
    };
    const onInstalled = () => {
      mutateMetrics(s => recordAppInstalled(s));
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-label)] pb-24">

      {/* Header — minimal, typographic */}
      <header className="sticky top-0 z-40 bg-[var(--color-bg)]/90 backdrop-blur-xl border-b border-[var(--color-separator)]">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/pwa-192x192.png"
              alt=""
              draggable={false}
              className="w-7 h-7 rounded-lg object-cover"
            />
            <span className="text-[15px] font-semibold text-white tracking-tight">马拉松备赛</span>
          </div>
          {isPlanGenerated && (
            <span className="text-[11px] font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2.5 py-1 rounded-full">
              计划已生成
            </span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 pt-5">
        <WeChatEscapeBanner />
        {activeTab === 'profile'  && <ProfileForm />}
        {activeTab === 'stats'    && <TrainingStats />}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'races'    && <RaceTab />}
      </main>
      {/* 洞察与其他 Tab 同宽（手机式窄栏），内部单栏，全端一致 */}
      {activeTab === 'insights' && (
        <main className="max-w-lg mx-auto px-4 pt-5">
          <Suspense fallback={<div className="pt-10 text-center text-[13px] text-[var(--color-label-3)]">正在载入洞察…</div>}>
            <InsightsTab />
          </Suspense>
        </main>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-[var(--color-bg)]/92 backdrop-blur-xl border-t border-[var(--color-separator)]">
        <div className="max-w-lg mx-auto flex justify-around items-center px-2 pt-2 pb-5">
          <NavItem icon={<User className="w-[22px] h-[22px]" />}         label="档案" isActive={activeTab === 'profile'}  onClick={() => setActiveTab('profile')} />
          <NavItem icon={<Activity className="w-[22px] h-[22px]" />}     label="指标" isActive={activeTab === 'stats'}    onClick={() => setActiveTab('stats')}    disabled={!isPlanGenerated} onDisabledClick={() => showToast('先在「档案」生成训练计划 →')} />
          <NavItem icon={<CalendarDays className="w-[22px] h-[22px]" />} label="训练" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} disabled={!isPlanGenerated} onDisabledClick={() => showToast('先在「档案」生成训练计划 →')} />
          <NavItem icon={<Flag className="w-[22px] h-[22px]" />}         label="赛事" isActive={activeTab === 'races'}    onClick={() => setActiveTab('races')} />
          <NavItem icon={<Brain className="w-[22px] h-[22px]" />}        label="洞察" isActive={activeTab === 'insights'} onClick={() => setActiveTab('insights')} />
        </div>
      </nav>

      {/* Guidance toast */}
      {toast && (
        <div
          key={toast}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-[#1C1C1E]/95 text-white text-[13px] font-medium px-5 py-2.5 rounded-full shadow-xl whitespace-nowrap animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick, disabled, onDisabledClick }: {
  icon: ReactNode; label: string; isActive: boolean; onClick: () => void; disabled?: boolean; onDisabledClick?: () => void;
}) {
  return (
    <button
      onClick={disabled ? onDisabledClick : onClick}
      className={cn(
        'flex flex-col items-center gap-1 min-w-[64px] py-1 rounded-xl transition-all cursor-pointer',
        disabled ? 'opacity-30' : 'active:opacity-60',
        isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-label-3)]'
      )}
    >
      {icon}
      <span className={cn('text-[10px] font-medium', isActive ? 'text-[var(--color-accent)]' : '')}>{label}</span>
    </button>
  );
}

export default App;
