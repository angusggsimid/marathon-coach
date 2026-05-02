import type { DailyWorkout } from './training-engine';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  LSD: 'LSD长跑', Tempo: '节奏跑', TempoIntervals: '节奏间歇',
  Interval: '间歇跑', Fartlek: '法特莱克', Hills: '坡度跑',
  Progression: '渐进跑', Cruise: '巡航间歇', Easy: '轻松跑',
  Recovery: '恢复跑', MP: '马拉松配速', Race: '比赛日🏆',
};

const EMOJI: Record<string, string> = {
  LSD: '🏃', Tempo: '🔥', TempoIntervals: '🔥', Interval: '⚡️',
  Fartlek: '🌊', Hills: '⛰️', Progression: '📈', Cruise: '🚀',
  Easy: '😌', Recovery: '💤', MP: '🎯', Race: '🏆',
};

function escICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toICSDate(d: Date): string {
  return format(d, 'yyyyMMdd');
}

// Fold long lines per RFC 5545 (max 75 octets, fold with CRLF + space)
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = ' ' + line.slice(75);
  }
  out.push(line);
  return out.join('\r\n');
}

// ─── Summary / Description builders ──────────────────────────────────────────

function buildSummary(w: DailyWorkout): string {
  const label = TYPE_LABELS[w.workoutType] ?? w.workoutType;
  const emoji = EMOJI[w.workoutType] ?? '🏃';
  const km = w.distanceKm && w.distanceKm > 0 ? ` · ${w.distanceKm}km` : '';
  return `${emoji} ${label}${km}`;
}

function buildDescription(w: DailyWorkout): string {
  const lines: string[] = [w.description];
  if (w.targetPace) lines.push(`📍 配速目标：${w.targetPace}`);
  if (w.targetHR)   lines.push(`❤️ 心率区间：${w.targetHR}`);
  if (w.details) {
    if (w.details.warmup) {
      const seg = w.details.warmup;
      const dist = seg.distanceKm ? `${seg.distanceKm}km` : seg.durationMins ? `${seg.durationMins}min` : '';
      lines.push(`🔆 热身：${seg.name}${dist ? ' ' + dist : ''}`);
    }
    if (w.details.main.length > 0) {
      const parts = w.details.main.map(seg => {
        const dist = seg.distanceKm ? `${seg.distanceKm}km` : seg.durationMins ? `${seg.durationMins}min` : '';
        const reps = seg.reps && seg.reps > 1 ? ` ×${seg.reps}` : '';
        return `${seg.name}${dist ? ' ' + dist : ''}${reps}`;
      });
      lines.push(`💪 主训练：${parts.join(' → ')}`);
    }
    if (w.details.cooldown) {
      const seg = w.details.cooldown;
      const dist = seg.distanceKm ? `${seg.distanceKm}km` : seg.durationMins ? `${seg.durationMins}min` : '';
      lines.push(`🌙 冷身：${seg.name}${dist ? ' ' + dist : ''}`);
    }
  }
  return lines.join('\\n');
}

// ─── ICS generator ───────────────────────────────────────────────────────────

export function generateICS(plan: DailyWorkout[], calName = '马拉松训练计划'): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Marathon Training App//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escICS(calName)}`,
    'X-WR-TIMEZONE:Asia/Shanghai',
    'X-APPLE-CALENDAR-COLOR:#30D158',
  ];

  for (const w of plan) {
    if (w.workoutType === 'Rest') continue;

    const startDate = new Date(w.date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    out.push('BEGIN:VEVENT');
    out.push(`DTSTART;VALUE=DATE:${toICSDate(startDate)}`);
    out.push(`DTEND;VALUE=DATE:${toICSDate(endDate)}`);
    out.push(foldLine(`SUMMARY:${escICS(buildSummary(w))}`));
    out.push(foldLine(`DESCRIPTION:${buildDescription(w)}`));
    out.push(`DTSTAMP:${stamp}`);
    out.push(`UID:marathon-${format(startDate, 'yyyy-MM-dd')}-${w.workoutType}@marathon-app`);
    if (w.workoutType === 'Race') out.push('STATUS:TENTATIVE');
    out.push('END:VEVENT');
  }

  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

export function downloadICS(plan: DailyWorkout[], filename = '马拉松训练计划.ics'): void {
  const content = generateICS(plan);
  const blob = new Blob(['\uFEFF' + content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
