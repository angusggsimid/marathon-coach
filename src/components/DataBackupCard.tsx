/**
 * 档案页「数据与备份」：导出 JSON / 选择文件恢复 / 试用诊断导出。
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload, FileJson, AlertTriangle, Shield } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  backupFileName,
  backupToJson,
  buildBackupPayload,
  describeOverwriteFields,
  downloadBackupJson,
  parseBackupJson,
  BACKUP_MAX_BYTES,
  type BackupPayload,
} from '../utils/backup';
import {
  buildDiagnosticPayload,
  detectDisplayMode,
  diagnosticFileName,
  downloadDiagnosticJson,
  mutateMetrics,
  recordChannelOutcome,
  readMetricsFromStorage,
} from '../utils/local-metrics';
import { isWeChatUA } from '../utils/wechat';
import { cn } from '../utils/cn';

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm'; payload: BackupPayload; overwrite: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

export function DataBackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    profile, plan, completions, myRaces, vacations,
    isPlanGenerated, planNeedsRegen, exportSync, activeTab,
    restoreFromBackup,
  } = useStore();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  const flash = (p: Phase, ms = 3200) => {
    setPhase(p);
    if (p.kind === 'success' || p.kind === 'error') {
      setTimeout(() => setPhase({ kind: 'idle' }), ms);
    }
  };

  const handleExport = () => {
    try {
      const payload = buildBackupPayload({
        profile,
        plan,
        completions,
        myRaces,
        vacations,
        isPlanGenerated,
        planNeedsRegen,
        exportSync,
        // 备份 schema 只认四个基础 Tab；洞察是应用内状态，导出时回落 profile（恢复时本就不还原 activeTab）
        activeTab: activeTab === 'insights' ? 'profile' : activeTab,
      });
      const json = backupToJson(payload);
      downloadBackupJson(json, backupFileName());
      mutateMetrics(s => recordChannelOutcome(s, 'backup_export', 'success'));
      flash({ kind: 'success', message: '浏览器下载已触发（备份 JSON）' });
    } catch {
      mutateMetrics(s => recordChannelOutcome(s, 'backup_export', 'fail'));
      flash({ kind: 'error', message: '导出失败，请重试' });
    }
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > BACKUP_MAX_BYTES) {
      mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'fail'));
      flash({ kind: 'error', message: '文件过大（上限 5MB）' });
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      const result = parseBackupJson(text, file.size);
      if (!result.ok) {
        mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'fail'));
        flash({ kind: 'error', message: result.message });
        return;
      }
      setPhase({
        kind: 'confirm',
        payload: result.payload,
        overwrite: describeOverwriteFields(result.payload.data),
      });
    } catch {
      mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'fail'));
      flash({ kind: 'error', message: '读取文件失败' });
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () => {
    if (phase.kind !== 'confirm') return;
    try {
      restoreFromBackup(phase.payload.data);
      // 恢复后 API Key 必须为空
      if (useStore.getState().icuApiKey) {
        mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'fail'));
        flash({ kind: 'error', message: '恢复异常：凭证未清空' });
        return;
      }
      mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'success'));
      flash({ kind: 'success', message: '恢复成功，计划与档案已更新' });
    } catch {
      mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'fail'));
      flash({ kind: 'error', message: '恢复失败，本地数据未改动' });
    }
  };

  const cancelRestore = () => {
    mutateMetrics(s => recordChannelOutcome(s, 'backup_import', 'cancel'));
    setPhase({ kind: 'idle' });
  };

  const handleDiagExport = () => {
    try {
      const metrics = readMetricsFromStorage();
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const dm = detectDisplayMode();
      const payload = buildDiagnosticPayload(metrics, {
        displayMode: dm,
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
        standalone: dm === 'standalone' || dm === 'fullscreen' || dm === 'minimal-ui',
        wechatLikely: isWeChatUA(ua),
      });
      downloadDiagnosticJson(JSON.stringify(payload, null, 2), diagnosticFileName());
      mutateMetrics(s => recordChannelOutcome(s, 'diag_export', 'success'));
      flash({ kind: 'success', message: '浏览器下载已触发（诊断 JSON，仅本机聚合）' });
    } catch {
      flash({ kind: 'error', message: '诊断导出失败' });
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl px-4 py-4" data-testid="data-backup-card">
      <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider">
        数据与备份
      </p>
      <p className="text-[12px] text-[var(--color-label-3)] mt-1 leading-relaxed">
        计划与打卡保存在本机。可导出 JSON 备份，换设备后选择文件恢复。不含 API Key。
      </p>

      <div className="flex flex-col gap-2 mt-3">
        <button
          type="button"
          data-testid="backup-export"
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-surface-2)] text-[13px] font-medium text-white active:opacity-70"
        >
          <Download className="w-4 h-4 text-[var(--color-accent)]" />
          导出备份 JSON
        </button>
        <button
          type="button"
          data-testid="backup-import"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--color-surface-2)] text-[13px] font-medium text-white active:opacity-70 disabled:opacity-40"
        >
          <Upload className="w-4 h-4 text-[var(--color-accent)]" />
          选择 JSON 恢复
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="backup-file-input"
          onChange={handleFile}
        />
      </div>

      <details className="mt-4 pt-3 border-t border-[var(--color-separator)]">
        <summary className="cursor-pointer list-none text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          试用诊断（开发者用）
        </summary>
        <p className="text-[11px] text-[var(--color-label-3)] mt-1 leading-relaxed">
          仅本机聚合计数（打开次数、导出成败等）。不含计划、成绩、赛事、密钥。导出后由你自行提供。
        </p>
        <button
          type="button"
          data-testid="diag-export"
          onClick={handleDiagExport}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--color-separator)] text-[12px] font-medium text-[var(--color-label-2)] active:opacity-70"
        >
          <FileJson className="w-3.5 h-3.5" />
          导出试用诊断 JSON
        </button>
      </details>

      {phase.kind === 'confirm' && (
        <div
          className="mt-3 rounded-xl border border-[var(--color-orange)]/35 bg-[var(--color-orange)]/10 px-3 py-3"
          data-testid="backup-confirm"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--color-orange)] flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-orange)]">确认覆盖本地数据？</p>
              <p className="text-[11px] text-[var(--color-label-2)] mt-1">
                导出时间 {new Date(phase.payload.exportedAt).toLocaleString()} · 将替换：
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {phase.overwrite.map(line => (
                  <li key={line} className="text-[12px] text-white">· {line}</li>
                ))}
              </ul>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  data-testid="backup-confirm-yes"
                  onClick={confirmRestore}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-black text-[13px] font-bold active:opacity-80"
                >
                  确认恢复
                </button>
                <button
                  type="button"
                  data-testid="backup-confirm-no"
                  onClick={cancelRestore}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--color-surface-2)] text-[13px] font-medium text-white active:opacity-70"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(phase.kind === 'error' || phase.kind === 'success') && (
        <p
          data-testid="backup-feedback"
          className={cn(
            'mt-3 text-[12px] font-medium px-1',
            phase.kind === 'error' ? 'text-[var(--color-red)]' : 'text-[var(--color-accent)]',
          )}
        >
          {phase.message}
        </p>
      )}
    </div>
  );
}
