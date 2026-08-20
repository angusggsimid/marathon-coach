// 配速格式单一事实源：复用引擎 formatPace（m'ss"，floor 取整，无 60 进位 bug）。
import { formatPace as engineFormatPace } from '../training-engine';

export function formatPace(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return '—';
  return engineFormatPace(sec);
}

export function formatDuration(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
