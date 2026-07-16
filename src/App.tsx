import { type ReactNode, useState, useEffect } from 'react';
import { ProfileForm } from './components/ProfileForm';
import { TrainingStats } from './components/TrainingStats';
import { CalendarView } from './components/CalendarView';
import { RaceTab } from './components/RaceTab';
import { WeChatEscapeBanner } from './components/WeChatEscapeBanner';
import { Activity, CalendarDays, User, Flag } from 'lucide-react';
import { useStore } from './store/useStore';
import { cn } from './utils/cn';
import {
  detectDisplayMode,
  mutateMetrics,
  recordAppInstalled,
  recordBeforeInstallPrompt,
  recordOpen,
} from './utils/local-metrics';
import { isWeChatUA } from './utils/wechat';

function App() {
  const { activeTab, setActiveTab, isPlanGenerated } = useStore();
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

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
            <div className="w-7 h-7 bg-[var(--color-accent)] rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-black" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
              </svg>
            </div>
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

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-[var(--color-bg)]/92 backdrop-blur-xl border-t border-[var(--color-separator)]">
        <div className="max-w-lg mx-auto flex justify-around items-center px-2 pt-2 pb-5">
          <NavItem icon={<User className="w-[22px] h-[22px]" />}         label="档案" isActive={activeTab === 'profile'}  onClick={() => setActiveTab('profile')} />
          <NavItem icon={<Activity className="w-[22px] h-[22px]" />}     label="指标" isActive={activeTab === 'stats'}    onClick={() => setActiveTab('stats')}    disabled={!isPlanGenerated} onDisabledClick={() => showToast('先在「档案」生成训练计划 →')} />
          <NavItem icon={<CalendarDays className="w-[22px] h-[22px]" />} label="训练" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} disabled={!isPlanGenerated} onDisabledClick={() => showToast('先在「档案」生成训练计划 →')} />
          <NavItem icon={<Flag className="w-[22px] h-[22px]" />}         label="赛事" isActive={activeTab === 'races'}    onClick={() => setActiveTab('races')} />
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
