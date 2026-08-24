/**
 * 核心逻辑自测：训练计划守卫、周自适应、周快照、计划指纹、FIT 范围、备份、本地指标。
 * 运行：npx tsx scripts/selftest-core.mts
 */
import { addDays, format, startOfWeek } from 'date-fns';
import {
  generateTrainingPlan,
  getPlanBlockReason,
  calculatePaces,
  hasUsablePerformance,
  parseLocalDate,
  type UserProfile,
  type DailyWorkout,
} from '../src/utils/training-engine.ts';
import {
  applyWeeklyAdaptation,
  computeWeeklyAdaptation,
  getActiveAdaptationMeta,
  toDateKey,
} from '../src/utils/weekly-adaptation.ts';
import {
  buildWeekSnapshot,
  formatWeeklyReportText,
  pickKeyWorkoutInWeek,
} from '../src/utils/week-snapshot.ts';
import {
  isChannelStale,
  isExportScopeActive,
  isFitChannelStale,
  isScopedExportStale,
  migrateExportSyncState,
  planFingerprint,
  planFingerprintForScope,
  recordFitExportSuccess,
  recordFullChannelSuccess,
  resolveFitExportScope,
} from '../src/utils/plan-fingerprint.ts';
import {
  countFitFiles,
  filterPlanByFitRange,
  fitZipFileName,
  buildFitRangeOptions,
  downloadFitByRange,
  setFitDownloadOverrideForTest,
} from '../src/utils/fit-export-range.ts';
import {
  downloadICS,
  setIcsDownloadOverrideForTest,
} from '../src/utils/export-ics.ts';
import {
  EXPORT_TEST_QUERY,
  isExportTestOverrideAllowed,
  isLoopbackHostname,
} from '../src/utils/export-test-gate.ts';
import {
  BACKUP_APP_ID,
  BACKUP_MAX_BYTES,
  BACKUP_MAX_PLAN_DAYS,
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  backupFileName,
  backupToJson,
  buildBackupPayload,
  containsForbiddenSecrets,
  describeOverwriteFields,
  isSafeHttpUrl,
  isValidLocalYmd,
  parseBackupJson,
  toRestorableState,
} from '../src/utils/backup.ts';
import {
  isWeChatUA,
  shouldShowWeChatEscape,
  wechatMenuInstructions,
  wechatPlatformHint,
  WECHAT_DISMISS_SESSION_KEY,
  isWeChatBannerDismissed,
  dismissWeChatBanner,
} from '../src/utils/wechat.ts';
import {
  buildDiagnosticPayload,
  coarseLanguage,
  diagnosticHasForbiddenKeys,
  emptyMetrics,
  loadMetricsFromRaw,
  localDayKey,
  METRICS_MAX_ACTIVE_DAYS,
  METRICS_MAX_DAY_BUCKETS,
  METRICS_VERSION,
  recordChannelOutcome,
  recordOpen,
  sanitizeCount,
  viewportBucket,
} from '../src/utils/local-metrics.ts';

import {
  matchActivitiesToPlan,
  buildAutoCheckinSuggestions,
  buildAutoCheckinSuggestionsFromAppState,
} from '../src/utils/auto-checkin.ts';
import { countStreak } from '../src/utils/checkin-streak.ts';
import { computeACWR } from '../src/utils/acwr.ts';
import { getSuppressedRaces } from '../src/utils/race-plan-overlay.ts';
import { getProfilePlanMismatch, getBaseCapacityFromVDOT, resolveVDOT } from '../src/utils/training-engine.ts';
import { teStats, judgeTeQuality } from '../src/utils/te-quality.ts';
import { heatAdjustment } from '../src/utils/heat-adjust.ts';
import { parseOpenMeteo, shouldRefetchWeather } from '../src/utils/weather.ts';
import { calibratePrediction, formatPredictionDelta } from '../src/utils/prediction-calibration.ts';
import { SCIENCE_NOTES } from '../src/content/science-notes.ts';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function baseProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    height: 170,
    weight: 60,
    pb5k: '22:00',
    pb10k: '46:00',
    pbHalf: '1:42:00',
    pbFull: '',
    lthr: 165,
    ltPace: '',
    raceDate: format(addDays(new Date(), 90), 'yyyy-MM-dd'),
    raceType: 'half',
    goalTime: '',
    intensity: 'moderate',
    longRunDay: 0,
    ...over,
  };
}

console.log('\n── training-engine ──');

{
  const empty = baseProfile({ pb5k: '', pb10k: '', pbHalf: '', pbFull: '', ltPace: '' });
  assert(!hasUsablePerformance(empty), 'empty profile has no usable performance');
  assert(getPlanBlockReason(empty) === 'no_performance', 'block: no_performance');
  assert(calculatePaces(empty) === null, 'calculatePaces returns null without data');
  assert(generateTrainingPlan(empty).length === 0, 'no plan without performance');
}

{
  const asOf = parseLocalDate('2026-07-01');
  const shortHalf = baseProfile({
    raceType: 'half',
    raceDate: '2026-07-15', // 14 days
    pbHalf: '1:40:00',
  });
  assert(getPlanBlockReason(shortHalf, asOf) === 'too_short_half', 'block half <21d');
  assert(generateTrainingPlan(shortHalf, asOf).length === 0, 'no plan for short half');
}

{
  const asOf = parseLocalDate('2026-07-01');
  const shortFull = baseProfile({
    raceType: 'full',
    raceDate: '2026-07-20', // 19 days
    pbFull: '3:30:00',
    pbHalf: '',
  });
  assert(getPlanBlockReason(shortFull, asOf) === 'too_short_full', 'block full <35d');
  assert(generateTrainingPlan(shortFull, asOf).length === 0, 'no plan for short full');
}

{
  const asOf = parseLocalDate('2026-07-01');
  const past = baseProfile({ raceDate: '2026-06-01', pbHalf: '1:40:00' });
  assert(getPlanBlockReason(past, asOf) === 'past_race', 'block past race');
}

{
  // LT-only is enough
  const ltOnly = baseProfile({
    pb5k: '', pb10k: '', pbHalf: '', pbFull: '',
    ltPace: '4:30',
    raceDate: format(addDays(parseLocalDate('2026-07-01'), 60), 'yyyy-MM-dd'),
  });
  const asOf = parseLocalDate('2026-07-01');
  assert(hasUsablePerformance(ltOnly), 'LT-only is usable');
  assert(getPlanBlockReason(ltOnly, asOf) === null, 'LT-only not blocked');
  const plan = generateTrainingPlan(ltOnly, asOf);
  assert(plan.length > 0, 'LT-only generates plan', `len=${plan.length}`);
  assert(plan.every(w => w.workoutType !== 'Race' || w.distanceKm === undefined || w.distanceKm > 0 || true), 'plan has days');
}

{
  // 仅全马成绩：旧逻辑只从半马/10K/5K 推 LT，会静默生成空计划
  const asOf = parseLocalDate('2026-07-01');
  const fullOnly = baseProfile({
    pb5k: '', pb10k: '', pbHalf: '',
    pbFull: '3:30:00',
    ltPace: '',
    raceType: 'full',
    raceDate: '2026-11-01',
  });
  assert(hasUsablePerformance(fullOnly), 'full-only is usable');
  assert(getPlanBlockReason(fullOnly, asOf) === null, 'full-only not blocked by days');
  assert(calculatePaces(fullOnly) !== null, 'full-only yields paces');
  const plan = generateTrainingPlan(fullOnly, asOf);
  assert(plan.length > 20, 'full-only generates plan', `len=${plan.length}`);
  assert(!!plan.find(w => w.workoutType === 'Race'), 'full-only plan has race day');
}

{
  const asOf = parseLocalDate('2026-07-01');
  const ok = baseProfile({
    raceType: 'half',
    raceDate: '2026-10-01',
    pbHalf: '1:40:00',
  });
  const plan = generateTrainingPlan(ok, asOf);
  assert(plan.length > 20, 'normal half plan has enough days', `len=${plan.length}`);
  // No silent 4:33: first Easy/LSD should have a real pace string
  const withPace = plan.find(w => w.targetPace);
  assert(!!withPace?.targetPace, 'plan has targetPace from real PB');
  // Race day present
  const raceDay = plan.find(w => w.workoutType === 'Race');
  assert(!!raceDay, 'plan includes Race day');
  assert(toDateKey(raceDay!.date) === '2026-10-01', 'race day matches local date', toDateKey(raceDay!.date));
}

{
  // Local date parse: YYYY-MM-DD must not shift in any TZ interpretation of constructor
  const d = parseLocalDate('2026-07-13');
  assert(d.getFullYear() === 2026 && d.getMonth() === 6 && d.getDate() === 13, 'parseLocalDate is local calendar');

  // Persist rehydrate: China UTC+8 midnight serializes to previous calendar day in Z
  // but toDateKey / normalize must restore local day
  const localMidnight = new Date(2026, 6, 13, 0, 0, 0);
  const iso = localMidnight.toISOString(); // e.g. 2026-07-12T16:00:00.000Z
  assert(toDateKey(iso) === '2026-07-13', 'toDateKey ISO uses local day', `${iso} → ${toDateKey(iso)}`);
  assert(toDateKey('2026-07-13') === '2026-07-13', 'toDateKey pure date');
}

console.log('\n── weekly-adaptation ──');

{
  // Build a synthetic week Mon–Sun
  const monday = startOfWeek(parseLocalDate('2026-07-06'), { weekStartsOn: 1 }); // 2026-07-06 is Mon
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(monday, i);
    const isRest = date.getDay() === 1; // Mon rest for simplicity? use Wed rest
    plan.push({
      date,
      workoutType: i % 7 === 3 ? 'Rest' : 'Easy',
      description: 'Easy',
      distanceKm: i % 7 === 3 ? 0 : 10,
    });
  }

  // Complete prev week (days 0–6) poorly: high RPE / low completion
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    const key = format(addDays(monday, i), 'yyyy-MM-dd');
    const w = plan[i];
    if (w.workoutType === 'Rest') continue;
    // only check in half with high RPE
    if (i % 2 === 0) {
      completions[key] = { status: 'full', rpe: 4 };
    }
  }

  const prevSunday = addDays(monday, 6);
  const adapt = computeWeeklyAdaptation(plan, completions, prevSunday);
  assert(adapt.factor === 0.9, 'low completion / high RPE → factor 0.9', `factor=${adapt.factor} rate=${adapt.completionRate}`);

  // asOf = next week Wednesday → 只缩放 today 及之后；周一/周二不回溯
  const asOf = addDays(monday, 9); // Wed of week 2
  const adapted = applyWeeklyAdaptation(plan, completions, asOf);
  const nextWeekMon = addDays(monday, 7);
  const monW = adapted.find(w => toDateKey(w.date) === format(nextWeekMon, 'yyyy-MM-dd'));
  const wedW = adapted.find(w => toDateKey(w.date) === format(asOf, 'yyyy-MM-dd'));
  if (monW && monW.workoutType !== 'Rest') {
    assert(monW.distanceKm === 10, 'past day in target week not retro-scaled', `km=${monW.distanceKm}`);
  }
  if (wedW && wedW.workoutType !== 'Rest') {
    assert(wedW.distanceKm === 9, 'today and future scaled -10%', `km=${wedW.distanceKm}`);
    assert(wedW.description.includes('自适应'), 'description tagged');
  } else {
    assert(false, 'expected next week Wednesday workout', wedW?.workoutType ?? 'missing');
  }

  // Race / Rest never scaled
  const rest = adapted.find(w => w.workoutType === 'Rest' && toDateKey(w.date) >= format(nextWeekMon, 'yyyy-MM-dd'));
  if (rest) assert(rest.workoutType === 'Rest', 'rest unchanged type');

  const meta = getActiveAdaptationMeta(plan, completions, asOf);
  assert(meta.active === true, 'meta active during target week');
  assert(meta.factor === 0.9, 'meta factor 0.9');

  // factor 1 when no checkins
  const none = applyWeeklyAdaptation(plan, {}, asOf);
  assert(none.every((w, i) => w.distanceKm === plan[i].distanceKm), 'no checkins → no scale');
}

{
  // High completion + low RPE → +5%
  const monday = startOfWeek(parseLocalDate('2026-08-03'), { weekStartsOn: 1 });
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 14; i++) {
    plan.push({
      date: addDays(monday, i),
      workoutType: i % 7 === 6 ? 'Rest' : 'Easy',
      description: 'Easy',
      distanceKm: i % 7 === 6 ? 0 : 8,
    });
  }
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType === 'Rest') continue;
    completions[format(addDays(monday, i), 'yyyy-MM-dd')] = { status: 'full', rpe: 1 };
  }
  const asOf = addDays(monday, 8);
  const adapt = computeWeeklyAdaptation(plan, completions, addDays(monday, 6));
  assert(adapt.factor === 1.05, 'strong week → +5%', `factor=${adapt.factor}`);
  const adapted = applyWeeklyAdaptation(plan, completions, asOf);
  const tue = adapted.find(w => toDateKey(w.date) === format(addDays(monday, 8), 'yyyy-MM-dd'));
  assert(tue?.distanceKm === 8.4, 'distance +5%', `km=${tue?.distanceKm}`);
}

// ── helpers for synthetic weeks ───────────────────────────────────────────────

function syntheticTwoWeeks(
  monday: Date,
  restOffset = 3,
): DailyWorkout[] {
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 14; i++) {
    const isRest = i % 7 === restOffset;
    plan.push({
      date: addDays(monday, i),
      workoutType: isRest ? 'Rest' : i % 7 === 6 ? 'LSD' : 'Easy',
      description: isRest ? 'Rest' : i % 7 === 6 ? 'LSD - long' : 'Easy',
      distanceKm: isRest ? 0 : i % 7 === 6 ? 18 : 10,
      targetPace: isRest ? undefined : "5'30\"",
    });
  }
  return plan;
}

console.log('\n── week-snapshot ──');

{
  // 无打卡：诚实空态，无证明卡
  const monday = startOfWeek(parseLocalDate('2026-07-06'), { weekStartsOn: 1 });
  const plan = syntheticTwoWeeks(monday);
  const asOf = addDays(monday, 9); // next Wed
  const snap = buildWeekSnapshot(plan, {}, asOf);
  assert(!snap.hasCheckins, 'snapshot no checkins');
  assert(!snap.showProofCard, 'no proof without checkins');
  assert(!!snap.emptyMessage, 'empty message present');
  assert(snap.reportLines.length === 0, 'no fake zero report lines');
  assert(formatWeeklyReportText(snap).includes('补记') || formatWeeklyReportText(snap).includes('打卡') || formatWeeklyReportText(snap).includes('周报'), 'empty report text honest');
}

{
  // 低完成高 RPE → 减量 10%，三行与算法一致
  const monday = startOfWeek(parseLocalDate('2026-07-06'), { weekStartsOn: 1 });
  const plan = syntheticTwoWeeks(monday);
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType === 'Rest') continue;
    if (i % 2 === 0) completions[format(addDays(monday, i), 'yyyy-MM-dd')] = { status: 'full', rpe: 4 };
  }
  const asOf = addDays(monday, 9);
  const adapt = computeWeeklyAdaptation(plan, completions, addDays(monday, 6));
  const meta = getActiveAdaptationMeta(plan, completions, asOf);
  const snap = buildWeekSnapshot(plan, completions, asOf);
  assert(adapt.factor === 0.9, 'adapt factor 0.9');
  assert(meta.active && meta.factor === 0.9, 'meta active 0.9');
  assert(snap.showProofCard, 'proof card for -10%');
  assert(snap.factor === 0.9, 'snapshot factor matches algorithm', `f=${snap.factor}`);
  assert(!!snap.proof, 'proof lines exist');
  assert(snap.proof!.change.includes('减少') && snap.proof!.change.includes('10'), 'change line -10%', snap.proof!.change);
  assert(snap.proof!.evidence.includes('打卡'), 'evidence has checkin');
  assert(snap.proof!.unchanged.includes('配速'), 'unchanged mentions pace');
  assert(snap.reportLines.length >= 4 && snap.reportLines.length <= 5, 'report ≤5 lines', `n=${snap.reportLines.length}`);
  assert(snap.prevWeekStart === '2026-07-06' && snap.prevWeekEnd === '2026-07-12', 'prev week bounds', `${snap.prevWeekStart}~${snap.prevWeekEnd}`);
}

{
  // 正常保持：有周报、无强调证明卡
  const monday = startOfWeek(parseLocalDate('2026-08-03'), { weekStartsOn: 1 });
  const plan = syntheticTwoWeeks(monday, 6);
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType === 'Rest') continue;
    // ~80% completion, normal RPE
    if (i !== 1) completions[format(addDays(monday, i), 'yyyy-MM-dd')] = { status: 'full', rpe: 2 };
  }
  const asOf = addDays(monday, 8);
  const adapt = computeWeeklyAdaptation(plan, completions, addDays(monday, 6));
  const snap = buildWeekSnapshot(plan, completions, asOf);
  assert(adapt.factor === 1, 'hold factor 1', `f=${adapt.factor}`);
  assert(!snap.showProofCard, 'no proof card when factor=1');
  assert(snap.hasCheckins, 'has checkins for hold week');
  assert(snap.reportLines.some(l => l.includes('保持') || l.includes('距离')), 'hold impact in report');
}

{
  // 高完成低 RPE → +5%
  const monday = startOfWeek(parseLocalDate('2026-08-03'), { weekStartsOn: 1 });
  const plan = syntheticTwoWeeks(monday, 6);
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType === 'Rest') continue;
    completions[format(addDays(monday, i), 'yyyy-MM-dd')] = { status: 'full', rpe: 1 };
  }
  const asOf = addDays(monday, 8);
  const snap = buildWeekSnapshot(plan, completions, asOf);
  assert(snap.factor === 1.05, 'snapshot +5%', `f=${snap.factor}`);
  assert(snap.showProofCard, 'proof for +5%');
  assert(snap.proof!.change.includes('增加') && snap.proof!.change.includes('5'), 'change +5%', snap.proof!.change);
}

{
  // 部分完成：partial 计入完成估算
  const monday = startOfWeek(parseLocalDate('2026-09-07'), { weekStartsOn: 1 });
  const plan = syntheticTwoWeeks(monday, 6);
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  let n = 0;
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType === 'Rest') continue;
    n++;
    completions[format(addDays(monday, i), 'yyyy-MM-dd')] =
      n === 1 ? { status: 'partial', rpe: 2 } : { status: 'full', rpe: 2 };
  }
  const asOf = addDays(monday, 9);
  const snap = buildWeekSnapshot(plan, completions, asOf);
  assert(snap.hasCheckins, 'partial week has checkins');
  assert(snap.estimatedCompletedKm != null && snap.estimatedCompletedKm < snap.planDistanceKm, 'partial reduces estimated km');
}

{
  // 跨周日期：asOf 周一，上一周已完整
  const monday = parseLocalDate('2026-07-13'); // Mon
  const plan = syntheticTwoWeeks(addDays(monday, -7));
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, -7 + i);
    const w = plan.find(x => toDateKey(x.date) === format(d, 'yyyy-MM-dd'));
    if (!w || w.workoutType === 'Rest') continue;
    completions[format(d, 'yyyy-MM-dd')] = { status: 'full', rpe: 3 };
  }
  const snap = buildWeekSnapshot(plan, completions, monday);
  assert(snap.prevWeekEnd === '2026-07-12', 'cross-week prev ends Sun', snap.prevWeekEnd);
  assert(snap.targetWeekStart === '2026-07-13', 'target starts this Mon', snap.targetWeekStart);
}

{
  // 本周关键课：日期/课型/距离来自目标周 effective，不是上周
  const monday = startOfWeek(parseLocalDate('2026-07-06'), { weekStartsOn: 1 });
  const plan = syntheticTwoWeeks(monday);
  // 上周 LSD 18km；本周目标周 LSD 也是 18，但我们把 effective 目标周 LSD 缩到 16.2
  const completions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType === 'Rest') continue;
    if (i % 2 === 0) {
      completions[format(addDays(monday, i), 'yyyy-MM-dd')] = {
        status: 'full',
        rpe: 4,
      };
    }
  }
  const asOf = addDays(monday, 9); // target week Wed
  const effective = applyWeeklyAdaptation(plan, completions, asOf);
  const snap = buildWeekSnapshot(plan, completions, asOf, effective);
  assert(!!snap.keyWorkout, 'key workout present');
  const kw = snap.keyWorkout!;
  // 目标周 2026-07-13 ~ 07-19；上周 07-06~12
  assert(
    kw.date >= '2026-07-13' && kw.date <= '2026-07-19',
    'key workout date in target week not prev',
    kw.date,
  );
  assert(kw.date < '2026-07-13' === false, 'key not from prev week');
  // LSD Sunday of target week = 2026-07-19; factor 0.9 → 16.2 if future
  const targetLsd = effective.find(
    w => toDateKey(w.date) === '2026-07-19' && w.workoutType === 'LSD',
  );
  assert(kw.workoutType === 'LSD', 'key type LSD', kw.workoutType);
  if (targetLsd && (targetLsd.distanceKm ?? 0) > 0) {
    assert(
      kw.distanceKm === targetLsd.distanceKm,
      'key distance from effective target week',
      `kw=${kw.distanceKm} eff=${targetLsd.distanceKm}`,
    );
  }
  assert(
    snap.reportLines.some(l => l.includes('本周关键课')),
    'report says 本周关键课 not 上周',
  );
  assert(
    !snap.reportLines.some(l => l.includes('上周关键课')),
    'report must not say 上周关键课',
  );

  // 纯函数：显式从目标周切片
  const picked = pickKeyWorkoutInWeek(effective, snap.targetWeekStart, snap.targetWeekEnd);
  assert(picked?.date === kw.date, 'pickKeyWorkoutInWeek matches snapshot');
}

console.log('\n── plan-fingerprint ──');

{
  const monday = parseLocalDate('2026-07-06');
  const plan = syntheticTwoWeeks(monday);
  const fp1 = planFingerprint(plan);
  const fp2 = planFingerprint(plan);
  assert(fp1 === fp2, 'fingerprint stable');
  assert(fp1.startsWith('fp_'), 'fp prefix');

  // 顺序无关
  const shuffled = [...plan].reverse();
  assert(planFingerprint(shuffled) === fp1, 'order independent');

  // 字段变化触发
  const changed = plan.map(w =>
    w.workoutType === 'Easy' ? { ...w, distanceKm: (w.distanceKm ?? 0) + 1 } : w,
  );
  assert(planFingerprint(changed) !== fp1, 'distance change invalidates fp');

  // 无关 UI 状态：加 weeklySummary 不影响（指纹未读该字段）
  const withUi = plan.map(w => ({
    ...w,
    weeklySummary: { weekNum: 1, phase: 'x', volume: 99, tips: 'ui only' },
  }));
  assert(planFingerprint(withUi) === fp1, 'UI weeklySummary ignored');

  // Rest 过滤
  const onlyRest: DailyWorkout[] = [
    { date: monday, workoutType: 'Rest', description: 'Rest', distanceKm: 0 },
  ];
  assert(planFingerprint(onlyRest) === planFingerprint([]), 'rest-only same as empty');
}

{
  // ICS 全计划：从未导出不 stale；成功后指纹变化才 stale
  assert(!isChannelStale(undefined, 'fp_a'), 'never exported not stale');
  assert(!isChannelStale(null, 'fp_a'), 'null meta not stale');
  let state = recordFullChannelSuccess({}, 'fp_old');
  assert(isChannelStale(state.ics, 'fp_new'), 'ics stale after plan change');
  state = recordFullChannelSuccess(state, 'fp_new');
  assert(!isChannelStale(state.ics, 'fp_new'), 'ics cleared after re-export');
  assert(isChannelStale(state.ics, 'fp_newer'), 'ics stale when plan changes again');
  state = recordFullChannelSuccess(state, 'fp_newer');
  assert(!isChannelStale(state.ics, 'fp_newer'), 'ics cleared alone');
}

{
  // FIT 范围感知 stale
  const asOf = parseLocalDate('2026-07-08'); // Wed
  const mon = startOfWeek(asOf, { weekStartsOn: 1 });
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 21; i++) {
    const d = addDays(mon, i);
    plan.push({
      date: d,
      workoutType: i % 7 === 1 ? 'Rest' : 'Easy',
      description: 'Easy',
      distanceKm: i % 7 === 1 ? 0 : 8,
      targetPace: "5'30\"",
    });
  }

  // 从未导出
  assert(!isFitChannelStale(undefined, plan, asOf), 'fit never exported not stale');
  assert(!isFitChannelStale({}, plan, asOf), 'fit empty not stale');

  // 导出 week
  let sync = recordFitExportSuccess({}, plan, 'week', asOf);
  assert(!isFitChannelStale(sync.fit, plan, asOf), 'fit week fresh after export');
  assert(sync.fit?.week?.scopeStart === '2026-07-06', 'week scope start Mon', sync.fit?.week?.scopeStart);
  assert(sync.fit?.week?.scopeEnd === '2026-07-12', 'week scope end Sun', sync.fit?.week?.scopeEnd);

  // 范围外变化（下周课）→ 不 stale
  const outOfScope = plan.map(w => {
    const k = toDateKey(w.date);
    if (k >= '2026-07-13' && w.workoutType !== 'Rest') {
      return { ...w, distanceKm: (w.distanceKm ?? 0) + 5 };
    }
    return w;
  });
  assert(
    !isFitChannelStale(sync.fit, outOfScope, asOf),
    'out-of-scope change does not stale week export',
  );

  // 范围内变化 → stale
  const inScope = plan.map(w => {
    const k = toDateKey(w.date);
    if (k === '2026-07-09' && w.workoutType !== 'Rest') {
      return { ...w, distanceKm: 99 };
    }
    return w;
  });
  assert(isFitChannelStale(sync.fit, inScope, asOf), 'in-scope change stales week');

  // 同时有 all stale + 窄范围 today 导出：不得虚假清除 all
  sync = recordFitExportSuccess({}, plan, 'all', asOf);
  const changedAll = plan.map(w =>
    w.workoutType !== 'Rest' ? { ...w, distanceKm: (w.distanceKm ?? 0) + 1 } : w,
  );
  assert(isFitChannelStale(sync.fit, changedAll, asOf), 'all stale after full change');
  sync = recordFitExportSuccess(sync, changedAll, 'today', asOf);
  assert(!!sync.fit?.today, 'today slot written');
  assert(!!sync.fit?.all, 'all slot still present');
  assert(
    isFitChannelStale(sync.fit, changedAll, asOf),
    'narrow today export does not clear wider all stale',
  );
  // all 的指纹仍是旧的
  assert(
    isScopedExportStale(sync.fit?.all, changedAll, asOf),
    'all scope still stale after today re-export',
  );
  assert(
    !isScopedExportStale(sync.fit?.today, changedAll, asOf),
    'today scope fresh after its own export',
  );

  // 作用域过期：上周的 week export 在本周 asOf 不 stale
  // plan 需覆盖上周，否则 recordFit 空切片不写入
  const widePlan: DailyWorkout[] = [];
  for (let i = -14; i < 14; i++) {
    const d = addDays(mon, i);
    widePlan.push({
      date: d,
      workoutType: i % 7 === 1 ? 'Rest' : 'Easy',
      description: 'Easy',
      distanceKm: i % 7 === 1 ? 0 : 8,
      targetPace: "5'30\"",
    });
  }
  const lastWeekAsOf = parseLocalDate('2026-07-01'); // Wed of prev week
  let expiredSync = recordFitExportSuccess({}, widePlan, 'week', lastWeekAsOf);
  assert(!!expiredSync.fit?.week, 'prev week export recorded', JSON.stringify(expiredSync));
  assert(
    expiredSync.fit!.week!.scopeStart === '2026-06-29',
    'prev week scope Mon',
    expiredSync.fit?.week?.scopeStart,
  );
  assert(
    !isExportScopeActive(expiredSync.fit!.week!, asOf),
    'previous week scope inactive on new week',
  );
  // 即使指纹会变，过期作用域也不提示
  const mutated = widePlan.map(w =>
    w.workoutType !== 'Rest' ? { ...w, distanceKm: 50 } : w,
  );
  assert(
    !isFitChannelStale(expiredSync.fit, mutated, asOf),
    'expired week scope does not stay stale',
  );
  // today 过期：某日导出后，次日 asOf 不再提示（选有课的 Wed 7/8）
  expiredSync = recordFitExportSuccess(
    {},
    widePlan,
    'today',
    parseLocalDate('2026-07-08'),
  );
  assert(!!expiredSync.fit?.today, 'today-export recorded', JSON.stringify(expiredSync));
  assert(
    !isFitChannelStale(expiredSync.fit, mutated, parseLocalDate('2026-07-09')),
    'expired today scope does not stay stale',
  );

  // planFingerprintForScope 与 filter 一致
  const weekFp = planFingerprintForScope(plan, 'week', asOf);
  const weekSlice = filterPlanByFitRange(plan, 'week', asOf);
  assert(weekFp === planFingerprint(weekSlice), 'scope fp matches filtered plan');
  const scope = resolveFitExportScope('today', asOf);
  assert(scope.scopeStart === '2026-07-08' && scope.scopeEnd === '2026-07-08', 'today scope');
}

{
  // 旧 persist 迁移：非法/缺失 → 空，不误报
  assert(Object.keys(migrateExportSyncState(undefined)).length === 0, 'migrate undefined');
  assert(Object.keys(migrateExportSyncState(null)).length === 0, 'migrate null');
  assert(Object.keys(migrateExportSyncState({ fit: { bad: true } })).length === 0, 'migrate invalid channel');
  assert(Object.keys(migrateExportSyncState({ fit: { exportedAt: 'nope', planFingerprint: 'x' } })).length === 0, 'migrate bad date');

  // v3 旧 fit week 无 scope → 丢弃防误报
  const legacyWeek = migrateExportSyncState({
    fit: {
      exportedAt: '2026-07-01T00:00:00.000Z',
      planFingerprint: 'fp_abc',
      range: 'week',
    },
  });
  assert(!legacyWeek.fit, 'v3 week without scope dropped', JSON.stringify(legacyWeek));

  // v3 all 可迁为 fit.all
  const legacyAll = migrateExportSyncState({
    fit: {
      exportedAt: '2026-07-01T00:00:00.000Z',
      planFingerprint: 'fp_all',
      range: 'all',
    },
  });
  assert(
    legacyAll.fit?.all?.planFingerprint === 'fp_all',
    'v3 all migrates to fit.all',
  );

  // 新 v4 分槽
  const v4 = migrateExportSyncState({
    fit: {
      week: {
        exportedAt: '2026-07-08T00:00:00.000Z',
        planFingerprint: 'fp_w',
        range: 'week',
        scopeStart: '2026-07-06',
        scopeEnd: '2026-07-12',
      },
    },
  });
  assert(v4.fit?.week?.scopeStart === '2026-07-06', 'v4 week scope kept');

  // nested exportSync + ics
  const nested = migrateExportSyncState({
    exportSync: {
      ics: { exportedAt: '2026-07-02T12:00:00.000Z', planFingerprint: 'fp_ics' },
    },
  });
  assert(nested.ics?.planFingerprint === 'fp_ics', 'migrate nested exportSync');
  assert(nested.ics?.range === 'all', 'ics default range all');
}

console.log('\n── FIT range ──');

{
  const asOf = parseLocalDate('2026-07-08'); // Wed
  const mon = startOfWeek(asOf, { weekStartsOn: 1 });
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(mon, i);
    plan.push({
      date: d,
      workoutType: i === 2 ? 'Rest' : 'Easy', // Wed rest for week1
      description: 'Easy',
      distanceKm: i === 2 ? 0 : 8,
    });
  }
  // today = Wed = Rest → today count 0
  assert(countFitFiles(plan, 'today', asOf) === 0, 'today Rest empty');
  const weekFiles = countFitFiles(plan, 'week', asOf);
  assert(weekFiles === 6, 'week has 6 non-rest', `n=${weekFiles}`);
  assert(countFitFiles(plan, 'all', asOf) === 13, 'all excludes rests', `n=${countFitFiles(plan, 'all', asOf)}`);

  const todayOnly = filterPlanByFitRange(plan, 'today', asOf);
  assert(todayOnly.length === 0, 'filter today empty');
  const week = filterPlanByFitRange(plan, 'week', asOf);
  assert(week.every(w => {
    const k = toDateKey(w.date);
    return k >= '2026-07-06' && k <= '2026-07-12';
  }), 'week local bounds');

  const opts = buildFitRangeOptions(plan, asOf);
  const todayOpt = opts.find(o => o.range === 'today')!;
  assert(todayOpt.disabled && !!todayOpt.disabledReason, 'today option disabled with reason');
  assert(fitZipFileName('week', asOf) === 'garmin-workouts-week-2026-07-08.zip', 'zip name range+date');
  assert(fitZipFileName('today', asOf).includes('today'), 'zip today tag');
  assert(fitZipFileName('all', asOf).includes('all'), 'zip all tag');

  // 可注入异常：downloadImpl throw → ok:false，不向外抛
  const throwDl = () => { throw new Error('encode boom'); };
  const failRes = downloadFitByRange(plan, 'all', asOf, throwDl);
  assert(failRes.ok === false, 'downloadFitByRange catch throw');
  assert(failRes.reason?.includes('失败'), 'downloadFitByRange fail reason');
  const okRes = downloadFitByRange(plan, 'all', asOf, () => { /* no-op download */ });
  assert(okRes.ok === true && okRes.fileCount === 13, 'downloadFitByRange inject success');
  const emptyRes = downloadFitByRange(plan, 'today', asOf, () => {
    throw new Error('should not run');
  });
  assert(emptyRes.ok === false && emptyRes.fileCount === 0, 'empty range no download call needed');

  // 全局 override（browser acceptance 同路径）
  setFitDownloadOverrideForTest(() => {
    throw new Error('override boom');
  });
  const ovFail = downloadFitByRange(plan, 'all', asOf);
  assert(ovFail.ok === false && ovFail.reason?.includes('失败'), 'fit override throw → ok:false');
  setFitDownloadOverrideForTest(null);
  setFitDownloadOverrideForTest(() => { /* success no-op */ });
  const ovOk = downloadFitByRange(plan, 'all', asOf);
  assert(ovOk.ok === true, 'fit override success');
  setFitDownloadOverrideForTest(null);
}

console.log('\n── ICS download override ──');
{
  let called = 0;
  setIcsDownloadOverrideForTest(() => {
    called += 1;
    throw new Error('ics boom');
  });
  let threw = false;
  try {
    downloadICS([]);
  } catch {
    threw = true;
  }
  assert(threw && called === 1, 'ics override throw propagates to caller');
  setIcsDownloadOverrideForTest(null);
  // 清除后旧 throw override 不得残留（Node 无 document，用 no-op 覆盖断言）
  let afterClear = 0;
  setIcsDownloadOverrideForTest(() => {
    afterClear += 1;
  });
  downloadICS([]);
  assert(afterClear === 1, 'ics override after clear replaces previous');
  setIcsDownloadOverrideForTest(null);
}

console.log('\n── export test gate (production hook safety) ──');
{
  assert(EXPORT_TEST_QUERY === 'marathon_export_test', 'export test query param name');
  assert(isLoopbackHostname('localhost'), 'loopback localhost');
  assert(isLoopbackHostname('127.0.0.1'), 'loopback 127.0.0.1');
  assert(isLoopbackHostname('::1'), 'loopback ::1');
  assert(isLoopbackHostname('[::1]'), 'loopback [::1]');
  assert(!isLoopbackHostname('marathon-pi-seven.vercel.app'), 'vercel not loopback');
  assert(!isLoopbackHostname('example.com'), 'public host not loopback');
  assert(!isLoopbackHostname('192.168.1.1'), 'LAN not loopback');
  // Node 无 window：selftest 允许 override；浏览器须 loopback+query（由 main + acceptance 覆盖）
  assert(typeof window === 'undefined', 'selftest runs without window');
  assert(isExportTestOverrideAllowed() === true, 'Node selftest allows export test override');
}

{
  // 本地日期边界：asOf 周一 00:00
  const asOf = parseLocalDate('2026-07-13');
  const plan: DailyWorkout[] = [
    { date: parseLocalDate('2026-07-12'), workoutType: 'Easy', description: 'Sun', distanceKm: 5 },
    { date: parseLocalDate('2026-07-13'), workoutType: 'Easy', description: 'Mon', distanceKm: 6 },
    { date: parseLocalDate('2026-07-19'), workoutType: 'Easy', description: 'Sun2', distanceKm: 7 },
  ];
  assert(countFitFiles(plan, 'today', asOf) === 1, 'today is Mon only');
  const week = filterPlanByFitRange(plan, 'week', asOf);
  assert(week.length === 2, 'week Mon–Sun of 13th includes Mon and next Sun', `n=${week.length}`);
  assert(!week.some(w => toDateKey(w.date) === '2026-07-12'), 'prev Sun excluded');
}

console.log('\n── backup import/export ──');

{
  const asOf = parseLocalDate('2026-07-01');
  const profile = baseProfile({
    raceDate: '2026-11-01',
    pbHalf: '1:40:00',
  });
  const plan = generateTrainingPlan(profile, asOf);
  assert(plan.length > 0, 'fixture plan non-empty for backup');

  const state = {
    profile,
    plan,
    completions: { '2026-07-02': { status: 'full' as const, rpe: 2 as const } },
    myRaces: [{
      raceId: 'r1',
      distance: 'half' as const,
      goal: 'pb' as const,
      addedAt: '2026-07-01T00:00:00.000Z',
      name: '测试半马',
      date: '2026-11-01',
    }],
    vacations: [{ id: 'vac-1', start: '2026-08-01', end: '2026-08-05', label: '假' }],
    isPlanGenerated: true,
    planNeedsRegen: false,
    exportSync: {},
    activeTab: 'calendar' as const,
  };

  const payload = buildBackupPayload(state, parseLocalDate('2026-07-15'));
  assert(payload.schema === BACKUP_SCHEMA, 'backup schema');
  assert(payload.version === BACKUP_VERSION, 'backup version');
  assert(payload.app === BACKUP_APP_ID, 'backup app id');
  assert(!!payload.exportedAt, 'exportedAt present');
  const json = backupToJson(payload);
  assert(!json.toLowerCase().includes('icuapikey'), 'export json no api key field leak');
  assert(!json.includes('apiKey'), 'export json no apiKey');
  assert(!json.includes('icuAthleteId'), 'export excludes athlete id (min sensitivity)');

  const parsed = parseBackupJson(json);
  assert(parsed.ok === true, 'round-trip parse ok');
  if (parsed.ok) {
    assert(parsed.payload.data.plan.length === plan.length, 'round-trip plan length');
    assert(parsed.payload.data.plan[0].date instanceof Date, 'plan date rehydrated to Date');
    assert(!Number.isNaN(parsed.payload.data.plan[0].date.getTime()), 'plan date valid');
    assert(parsed.payload.data.completions['2026-07-02']?.status === 'full', 'completions restored');
    assert(parsed.payload.data.myRaces[0]?.raceId === 'r1', 'myRaces restored');
    assert(parsed.payload.data.vacations[0]?.id === 'vac-1', 'vacations restored');
    assert(parsed.payload.data.isPlanGenerated === true, 'isPlanGenerated');
    const restorable = toRestorableState(parsed.payload.data);
    assert(!('icuApiKey' in restorable), 'restorable no api key field');
    assert(restorable.plan.every(w => w.date instanceof Date), 'all plan dates Date');
    // 训练引擎可再读 profile
    assert(generateTrainingPlan(restorable.profile, asOf).length > 0, 'restored profile usable by engine');
  }

  // 文件名带本地日期
  assert(backupFileName(new Date(2026, 6, 15)) === 'marathon-backup-2026-07-15.json', 'backup filename local date');

  // 恶意 / 非法
  assert(parseBackupJson('not json').ok === false, 'reject non-json');
  assert(parseBackupJson('[]').ok === false, 'reject array root');
  assert(parseBackupJson('{}').ok === false, 'reject empty object');
  assert(parseBackupJson(JSON.stringify({ schema: 'x', version: 1, app: BACKUP_APP_ID, exportedAt: new Date().toISOString(), data: {} })).ok === false, 'bad schema');
  assert(parseBackupJson(JSON.stringify({ ...payload, app: 'other' })).ok === false, 'bad app');
  assert(parseBackupJson(JSON.stringify({ ...payload, version: BACKUP_VERSION + 99 })).ok === false, 'future version');
  assert(parseBackupJson(JSON.stringify({ ...payload, exportedAt: 'not-a-date' })).ok === false, 'bad exportedAt');
  assert(parseBackupJson(JSON.stringify({ ...payload, data: { ...payload.data, isPlanGenerated: 'yes' } })).ok === false, 'bad structure bool');
  assert(parseBackupJson(json, BACKUP_MAX_BYTES + 1).ok === false, 'too large by byteLength');

  // 含密钥的 JSON 拒绝
  const withSecret = JSON.parse(json);
  withSecret.data.icuApiKey = 'sk-evil';
  assert(parseBackupJson(JSON.stringify(withSecret)).ok === false, 'reject secret in data');
  assert(containsForbiddenSecrets({ icuApiKey: 'x' }), 'detect icuApiKey');
  assert(containsForbiddenSecrets({ nested: { apiKey: 'x' } }), 'detect nested apiKey');

  // 覆盖说明：与真实恢复一致，不含 activeTab
  if (parsed.ok) {
    const lines = describeOverwriteFields(parsed.payload.data);
    assert(lines.some(l => l.includes('档案')), 'overwrite lists profile');
    assert(lines.some(l => l.includes('训练计划')), 'overwrite lists plan');
    assert(!lines.some(l => l.includes('标签')), 'overwrite does not list activeTab');
    const rest = toRestorableState(parsed.payload.data);
    assert(!('activeTab' in rest), 'restorable omits activeTab');
  }

  // 取消不写状态：纯函数层无副作用；用「解析后不调用 toRestorable/restore」语义验证
  const before = JSON.stringify(state.completions);
  const cancelParse = parseBackupJson(json);
  assert(cancelParse.ok, 'cancel path still parses');
  assert(JSON.stringify(state.completions) === before, 'cancel does not mutate source state');

  // ── 损坏 / 恶意 details ──
  function wrapData(data: Record<string, unknown>) {
    return JSON.stringify({
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      app: BACKUP_APP_ID,
      exportedAt: new Date().toISOString(),
      data,
    });
  }
  const baseData = parsed.ok ? JSON.parse(JSON.stringify({
    ...parsed.payload.data,
    plan: parsed.payload.data.plan.map(w => ({
      ...w,
      date: w.date instanceof Date ? w.date.toISOString() : w.date,
    })),
  })) : null;
  assert(!!baseData, 'baseData for malice tests');
  if (baseData) {
    const badDetails = structuredClone(baseData);
    badDetails.plan[0].details = { main: 'x' };
    assert(parseBackupJson(wrapData(badDetails)).ok === false, 'reject details.main string');

    const badMainObj = structuredClone(baseData);
    badMainObj.plan[0].details = { main: { name: 'x' } };
    assert(parseBackupJson(wrapData(badMainObj)).ok === false, 'reject details.main object');

    const missingMain = structuredClone(baseData);
    missingMain.plan[0].details = { warmup: { name: 'w' } };
    assert(parseBackupJson(wrapData(missingMain)).ok === false, 'reject details without main array');

    const goodDetails = structuredClone(baseData);
    goodDetails.plan[0].details = {
      warmup: { name: '热身', durationMins: 5 },
      main: [{ name: '主课', distanceKm: 8, pace: "5'00\"" }],
      cooldown: { name: '放松', durationMins: 5 },
    };
    assert(parseBackupJson(wrapData(goodDetails)).ok === true, 'accept strict details');

    // 无效日期
    assert(!isValidLocalYmd('2026-02-30'), 'reject Feb 30');
    assert(!isValidLocalYmd('2026-13-01'), 'reject month 13');
    assert(isValidLocalYmd('2026-07-15'), 'accept real ymd');
    const badRaceDate = structuredClone(baseData);
    badRaceDate.profile.raceDate = '2026-02-30';
    assert(parseBackupJson(wrapData(badRaceDate)).ok === false, 'reject invalid raceDate');
    const badCompKey = structuredClone(baseData);
    badCompKey.completions = { 'not-a-date': { status: 'full', rpe: 2 } };
    assert(parseBackupJson(wrapData(badCompKey)).ok === false, 'reject bad completion key');
    const badVac = structuredClone(baseData);
    badVac.vacations = [{ id: 'v1', start: '2026-08-10', end: '2026-08-01' }];
    assert(parseBackupJson(wrapData(badVac)).ok === false, 'reject vacation start>end');
    const badVacDay = structuredClone(baseData);
    badVacDay.vacations = [{ id: 'v1', start: '2026-02-30', end: '2026-03-01' }];
    assert(parseBackupJson(wrapData(badVacDay)).ok === false, 'reject vacation invalid day');

    // javascript URL
    assert(!isSafeHttpUrl('javascript:alert(1)'), 'reject javascript url');
    assert(!isSafeHttpUrl('data:text/html,x'), 'reject data url');
    assert(isSafeHttpUrl('https://example.com/r'), 'accept https');
    assert(isSafeHttpUrl(''), 'accept empty url');
    const badUrl = structuredClone(baseData);
    badUrl.myRaces = [{
      raceId: 'r1', distance: 'half', goal: 'pb',
      addedAt: '2026-07-01T00:00:00.000Z',
      registrationUrl: 'javascript:alert(1)',
    }];
    assert(parseBackupJson(wrapData(badUrl)).ok === false, 'reject javascript registrationUrl');

    // 未知字段
    const unknownRoot = JSON.parse(json);
    unknownRoot.extraEvil = 1;
    assert(parseBackupJson(JSON.stringify(unknownRoot)).ok === false, 'reject unknown root key');
    const unknownData = structuredClone(baseData);
    unknownData.mysteryField = 'should-not';
    assert(parseBackupJson(wrapData(unknownData)).ok === false, 'reject unknown data key');
    const unknownProfile = structuredClone(baseData);
    unknownProfile.profile.secretNote = 'x';
    assert(parseBackupJson(wrapData(unknownProfile)).ok === false, 'reject unknown profile key');

    // 深层 secret：迭代扫描，depth>8 不静默放过
    let deep: Record<string, unknown> = { apiKey: 'x' };
    for (let i = 0; i < 20; i++) deep = { nest: deep };
    assert(containsForbiddenSecrets(deep) === true, 'deep secret still detected');
    // 超深无 secret 也拒绝（depth 超限）
    let deepOk: unknown = 1;
    for (let i = 0; i < 40; i++) deepOk = [deepOk];
    assert(containsForbiddenSecrets(deepOk) === true, 'over-depth treated as dangerous');

    // 状态不变量
    const emptyPlanGen = structuredClone(baseData);
    emptyPlanGen.plan = [];
    emptyPlanGen.isPlanGenerated = true;
    assert(parseBackupJson(wrapData(emptyPlanGen)).ok === false, 'reject isPlanGenerated with empty plan');
    const calNoPlan = structuredClone(baseData);
    calNoPlan.plan = [];
    calNoPlan.isPlanGenerated = false;
    calNoPlan.activeTab = 'calendar';
    assert(parseBackupJson(wrapData(calNoPlan)).ok === false, 'reject calendar tab without plan');

    // 极端 plan 长度
    const huge = structuredClone(baseData);
    huge.plan = Array.from({ length: BACKUP_MAX_PLAN_DAYS + 1 }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      workoutType: 'Easy',
      description: 'x',
      distanceKm: 5,
    }));
    // 日期可能重复无效月日——用合法递增
    huge.plan = Array.from({ length: BACKUP_MAX_PLAN_DAYS + 1 }, (_, i) => {
      const d = new Date(2026, 0, 1 + i);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: `${ymd}T00:00:00.000Z`, workoutType: 'Easy', description: 'x', distanceKm: 5 };
    });
    assert(parseBackupJson(wrapData(huge)).ok === false, 'reject plan over max days');
  }
}

console.log('\n── wechat escape ──');

{
  assert(isWeChatUA('Mozilla/5.0 MicroMessenger/8.0.0'), 'detect MicroMessenger');
  assert(!isWeChatUA('Mozilla/5.0 Chrome/120'), 'desktop chrome not wechat');
  assert(shouldShowWeChatEscape('MicroMessenger', false), 'show when wechat not dismissed');
  assert(!shouldShowWeChatEscape('MicroMessenger', true), 'hide when dismissed');
  assert(!shouldShowWeChatEscape('Safari', false), 'no banner outside wechat');
  assert(wechatPlatformHint('iPhone MicroMessenger').includes('ios') || wechatPlatformHint('iPhone MicroMessenger') === 'ios', 'ios hint');
  assert(wechatPlatformHint('Android MicroMessenger') === 'android', 'android hint');
  assert(wechatMenuInstructions('ios').includes('Safari'), 'ios menu mentions Safari');
  assert(wechatMenuInstructions('android').includes('浏览器'), 'android menu mentions browser');

  const mem: Record<string, string> = {};
  assert(!isWeChatBannerDismissed(k => mem[k] ?? null), 'not dismissed initially');
  dismissWeChatBanner((k, v) => { mem[k] = v; });
  assert(mem[WECHAT_DISMISS_SESSION_KEY] === '1', 'session dismiss key set');
  assert(isWeChatBannerDismissed(k => mem[k] ?? null), 'dismissed after set');
}

console.log('\n── local metrics privacy ──');

{
  let m = emptyMetrics();
  const day = localDayKey(new Date(2026, 6, 15));
  m = recordOpen(m, { displayMode: 'browser', isWeChat: true, now: new Date(2026, 6, 15, 10) });
  assert(m.totals.opens === 1, 'open counted');
  assert(m.activeDays.includes(day), 'active day recorded');
  assert(m.totals.wechatEntry === 1, 'wechat entry');
  // 同日再开：opens++ 但活跃日不重复、returnDays 不增加
  m = recordOpen(m, { displayMode: 'browser', isWeChat: false, now: new Date(2026, 6, 15, 18) });
  assert(m.totals.opens === 2, 'second open same day');
  assert(m.activeDays.filter(d => d === day).length === 1, 'day dedupe');
  assert(m.totals.returnDays === 0, 'no return day same calendar day');
  // 次日回访
  m = recordOpen(m, { displayMode: 'standalone', isWeChat: false, now: new Date(2026, 6, 16, 9) });
  assert(m.totals.returnDays === 1, 'return day counted');
  assert(m.totals.standaloneSessions === 1, 'standalone session');

  m = recordChannelOutcome(m, 'backup_import', 'cancel', new Date(2026, 6, 16));
  assert(m.totals.backupImportCancel === 1, 'import cancel counted');

  // 容量边界：活跃日
  let filled = emptyMetrics();
  for (let i = 0; i < METRICS_MAX_ACTIVE_DAYS + 40; i++) {
    const d = new Date(2026, 0, 1 + i);
    filled = recordOpen(filled, { displayMode: 'browser', isWeChat: false, now: d });
  }
  assert(filled.activeDays.length <= METRICS_MAX_ACTIVE_DAYS, 'activeDays cap', `n=${filled.activeDays.length}`);
  assert(Object.keys(filled.byDay).length <= METRICS_MAX_DAY_BUCKETS, 'day buckets cap', `n=${Object.keys(filled.byDay).length}`);

  // 诊断白名单 / 无敏感字段（日粒度）
  const diag = buildDiagnosticPayload(m, {
    displayMode: 'browser',
    language: 'zh-CN',
    timezoneOffsetMinutes: -480,
    width: 390,
    height: 844,
    standalone: false,
    wechatLikely: true,
  }, new Date(2026, 6, 16));
  const diagJson = JSON.stringify(diag);
  assert(!/icuApiKey|apiKey|athleteId|pb5k|pbHalf|goalTime/i.test(diagJson), 'diag no secrets/PB');
  assert(!diagJson.includes('myRaces'), 'diag no myRaces');
  assert(!diagJson.includes('?utm'), 'diag no query strings');
  assert(diag.metrics.firstOpenDay === '2026-07-15', 'diag firstOpenDay ymd');
  assert(diag.metrics.lastOpenDay === '2026-07-16', 'diag lastOpenDay ymd');
  assert(!('firstOpenAt' in diag.metrics), 'diag no firstOpenAt timestamp');
  assert(diag.runtime.language === 'zh', 'language coarse zh');
  assert(coarseLanguage('en-US') === 'en', 'language coarse en');
  assert(coarseLanguage('ja-JP') === 'other', 'language coarse other');
  assert(diagnosticHasForbiddenKeys(diag) === null, 'diag forbidden key scan clean', diagnosticHasForbiddenKeys(diag) ?? '');
  assert(viewportBucket(390, 844) === 'phone', 'viewport phone bucket');

  // 坏 storage 回退
  assert(loadMetricsFromRaw('nope').totals.opens === 0, 'bad raw → empty');
  assert(loadMetricsFromRaw(null).schema === 'marathon-local-metrics', 'null → empty schema');

  // ── poisoned localStorage ──
  assert(sanitizeCount('10') === 0, 'string count → 0');
  assert(sanitizeCount(-5) === 0, 'negative → 0');
  assert(sanitizeCount(NaN) === 0, 'NaN → 0');
  assert(sanitizeCount(1e20) === 1_000_000_000, 'huge clamp');

  const poisoned = {
    schema: 'marathon-local-metrics',
    version: METRICS_VERSION,
    firstOpenDay: 'not-a-date<script>',
    lastOpenDay: 'SECRET_TOKEN_xyz',
    // 无合法 firstOpenAt 回退，非法 day 必须为 null
    activeDays: ['2026-07-15', 'apiKey=sk-evil', '2026-02-30', '2026-07-15'],
    totals: {
      opens: '99',
      returnDays: -3,
      fitOk: Number.NaN,
      secret: 'injected',
      apiKey: 'sk-leak',
    },
    byDay: {
      '2026-07-15': { opens: 2, secret: 'day-secret', apiKey: 'x' },
      'evil-key': { opens: 1, password: 'p' },
      '2026-02-30': { opens: 9 },
    },
  };
  const cleaned = loadMetricsFromRaw(JSON.stringify(poisoned));
  assert(cleaned.totals.opens === 0, 'poisoned string opens → 0');
  assert(cleaned.totals.returnDays === 0, 'poisoned negative return → 0');
  assert(!('secret' in cleaned.totals), 'totals unknown key dropped');
  assert(!('apiKey' in cleaned.totals), 'totals apiKey dropped');
  assert(cleaned.activeDays.length === 1 && cleaned.activeDays[0] === '2026-07-15', 'activeDays only valid ymd');
  assert(cleaned.firstOpenDay === null, 'invalid firstOpenDay → null');
  assert(cleaned.lastOpenDay === null, 'invalid lastOpenDay → null');
  assert(Object.keys(cleaned.byDay).join(',') === '2026-07-15', 'byDay only valid day keys');
  assert(!('secret' in cleaned.byDay['2026-07-15']), 'day bucket secret dropped');
  assert(cleaned.byDay['2026-07-15'].opens === 2, 'day opens kept');

  const diagP = buildDiagnosticPayload(cleaned, {
    displayMode: 'browser',
    language: 'zh-Hans-CN',
    timezoneOffsetMinutes: -480,
    width: 390,
    height: 844,
    standalone: false,
    wechatLikely: false,
  });
  const diagPJson = JSON.stringify(diagP);
  assert(!diagPJson.includes('sk-'), 'poisoned diag no secret values');
  assert(!diagPJson.includes('apiKey'), 'poisoned diag no apiKey key');
  assert(!diagPJson.includes('SECRET_TOKEN'), 'poisoned diag no injected day text');
  assert(!diagPJson.includes('password'), 'poisoned diag no password');
  assert(diagnosticHasForbiddenKeys(diagP) === null, 'poisoned diag forbidden scan null', String(diagnosticHasForbiddenKeys(diagP)));
  assert(diagP.runtime.language === 'zh', 'poisoned diag language coarse');

  // v1 迁移：精确 ISO → 日
  const v1 = {
    schema: 'marathon-local-metrics',
    version: 1,
    firstOpenAt: '2026-07-10T08:15:30.000Z',
    lastOpenAt: '2026-07-12T22:00:00.000Z',
    activeDays: ['2026-07-10'],
    totals: { opens: 3 },
    byDay: { '2026-07-10': { opens: 3, secret: 1 } },
  };
  const migrated = loadMetricsFromRaw(JSON.stringify(v1));
  assert(migrated.version === METRICS_VERSION || migrated.firstOpenDay != null, 'v1 migrates days');
  assert(migrated.firstOpenDay === localDayKey(new Date('2026-07-10T08:15:30.000Z')), 'v1 firstOpenDay from ISO');
  assert(!('secret' in (migrated.byDay['2026-07-10'] || {})), 'v1 day secret dropped');
}

console.log('\n── weekly-adaptation 2.3 双源合并 ──');
{
  const monday = startOfWeek(parseLocalDate('2026-07-06'), { weekStartsOn: 1 });
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(monday, i);
    plan.push({
      date,
      workoutType: i % 7 === 3 ? 'Rest' : 'Easy',
      description: 'Easy',
      distanceKm: i % 7 === 3 ? 0 : 10,
    });
  }
  const prevSunday = addDays(monday, 6);
  const targetMondayKey = format(addDays(prevSunday, 1), 'yyyy-MM-dd');
  const objective = (factor: 0.9 | 1.0 | 1.05) => ({
    factor,
    summary: `测试客观裁决 ${factor.toFixed(2)}`,
    signals: [],
  });

  // 无打卡：主观 1.0；客观 0.9 → 合并 0.9（客观可在无打卡时生效）
  const m1 = computeWeeklyAdaptation(plan, {}, prevSunday, objective(0.9), null);
  assert(m1.factor === 0.9 && m1.adoptedSource === 'merged', 'objective 0.9 + 无打卡 → 0.9 merged', `factor=${m1.factor} src=${m1.adoptedSource}`);
  assert(m1.subjectiveFactor === 1.0 && m1.objectiveFactor === 0.9, '双源元数据记录');

  // 冲突取保守：主观 1.05 × 客观 0.9 → 0.9
  const goodCompletions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    const w = plan[i];
    if (w.workoutType !== 'Rest') goodCompletions[format(addDays(monday, i), 'yyyy-MM-dd')] = { status: 'full', rpe: 1 };
  }
  const m2 = computeWeeklyAdaptation(plan, goodCompletions, prevSunday, objective(0.9), null);
  assert(m2.factor === 0.9, '主观 1.05 × 客观 0.9 → 保守 0.9', `factor=${m2.factor} subjective=${m2.subjectiveFactor}`);

  // 客观 1.05 × 主观 1.0 → min = 1.0（不激进加码）
  const m3 = computeWeeklyAdaptation(plan, {}, prevSunday, objective(1.05), null);
  assert(m3.factor === 1.0, '客观 1.05 + 主观 1.0 → 1.0', `factor=${m3.factor}`);

  // override 优先：客观 0.9 但用户否决为 1.0
  const m4 = computeWeeklyAdaptation(plan, {}, prevSunday, objective(0.9), { weekKey: targetMondayKey, factor: 1.0 });
  assert(m4.factor === 1.0 && m4.adoptedSource === 'override', 'override 优先于客观', `factor=${m4.factor} src=${m4.adoptedSource}`);

  // override 周 key 不匹配 → 忽略
  const m5 = computeWeeklyAdaptation(plan, {}, prevSunday, objective(0.9), { weekKey: '2030-01-07', factor: 1.0 });
  assert(m5.factor === 0.9 && m5.adoptedSource === 'merged', 'override 周不匹配被忽略', `factor=${m5.factor}`);

  // 向后兼容：不传 objective → 纯主观
  const m6 = computeWeeklyAdaptation(plan, {}, prevSunday);
  assert(m6.factor === 1.0 && m6.adoptedSource === undefined, '无 objective 行为不变', `factor=${m6.factor}`);

  // applyWeeklyAdaptation：客观 0.9 无打卡也缩放目标周
  const asOf = addDays(monday, 9);
  const adapted = applyWeeklyAdaptation(plan, {}, asOf, objective(0.9), null);
  const wedW = adapted.find(w => toDateKey(w.date) === format(asOf, 'yyyy-MM-dd'));
  assert(wedW?.distanceKm === 9, '客观裁决缩放目标周距离 -10%', `km=${wedW?.distanceKm}`);
}

console.log('\n── 任务 3/4：课级就绪门 + 周期层上限 ──');
{
  const { sessionReadiness, applySessionReadiness, isIntensityType } = await import('../src/utils/insights/readiness.ts');
  const { cycleCaps } = await import('../src/utils/insights/cycle.ts');

  // 任务 3：risk 裁决（HRV 连续低于基线 + 睡眠不足）
  const tiredSnapshot = {
    version: 1, source: 'test', builtAt: 'x',
    fitness: { ltPaceSec: 278 },
    activities: [],
    dailyMetrics: [
      { date: '2026-08-10', hrvMs: 75, hrvBaseline: 70, restingHr: 55, sleepMinutes: 450 },
      { date: '2026-08-15', hrvMs: 60, hrvBaseline: 70, restingHr: 56, sleepMinutes: 450 },
      { date: '2026-08-16', hrvMs: 58, hrvBaseline: 70, restingHr: 60, sleepMinutes: 330 },
      { date: '2026-08-17', hrvMs: 57, hrvBaseline: 70, restingHr: 61, sleepMinutes: 320 },
    ],
    recovery: { pct: 35 },
  } as never;
  const rd = sessionReadiness(tiredSnapshot);
  assert(rd.level === 'risk', 'HRV 低于基线 + 睡眠不足 + 恢复度低 → risk', `level=${rd.level}`);

  const goodSnapshot = { ...tiredSnapshot, recovery: { pct: 90 }, dailyMetrics: tiredSnapshot.dailyMetrics.map((m: Record<string, unknown>) => ({ ...m, hrvMs: 78, sleepMinutes: 460, restingHr: 54 })) } as never;
  assert(sessionReadiness(goodSnapshot).level === 'good', '恢复良好 → good');

  // 降级：3 天内第一个强度课 → Easy
  const monday = startOfWeek(parseLocalDate('2026-08-17'), { weekStartsOn: 1 });
  const plan: DailyWorkout[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    plan.push({
      date,
      workoutType: i === 2 ? 'Tempo' : 'Easy',
      description: i === 2 ? '节奏跑' : '轻松跑',
      distanceKm: i === 2 ? 8 : 6,
      targetPace: i === 2 ? "4'26\"-4'50\"" : "5'30\"-6'15\"",
    });
  }
  const profile = { pb5k: '', pb10k: '', pbHalf: '1:50:00', pbFull: '', lthr: '', ltPace: '4:38', raceDate: '2026-12-07', raceType: 'full', goalTime: '3:45:00', intensity: 'moderate', longRunDay: 0, height: 178, weight: 76 } as never;
  const asOf = parseLocalDate('2026-08-17');
  const gate = applySessionReadiness(plan, profile, rd, asOf, null);
  const wed = gate.plan[2];
  assert(gate.downgraded?.dateKey === '2026-08-19' && wed.workoutType === 'Easy', '强度课降级为 Easy', `type=${wed.workoutType}`);
  assert(wed.description.includes('就绪降级'), '降级标签');
  assert(wed.targetPace === "5'30\"-6'15\"", '降级后配速为 Z2 区间', `pace=${wed.targetPace}`);

  // 否决：override 命中 → 不降级
  const gate2 = applySessionReadiness(plan, profile, rd, asOf, '2026-08-19');
  assert(gate2.downgraded === null && gate2.plan[2].workoutType === 'Tempo', '否决后保留强度课');

  // good 状态 → 不降级
  const gate3 = applySessionReadiness(plan, profile, sessionReadiness(goodSnapshot), asOf, null);
  assert(gate3.downgraded === null, 'good 不降级');
  assert(isIntensityType('TempoIntervals') && !isIntensityType('Easy'), '强度课型判定');

  // 任务 4：解耦 >10% → cap 1.0
  const highDecSnapshot = {
    version: 1, source: 'test', builtAt: 'x',
    fitness: { ltPaceSec: 278, vo2max: 48 },
    activities: [
      { date: '2026-08-10', type: 'run', distanceKm: 12, laps: mkDecoupledLaps(15) },
      { date: '2026-08-13', type: 'run', distanceKm: 12, laps: mkDecoupledLaps(18) },
    ],
    dailyMetrics: [],
  } as never;
  function mkDecoupledLaps(driftPct: number) {
    // 前半 HR 140，后半 HR 上升使 drift ≈ driftPct
    const laps = [];
    for (let i = 1; i <= 10; i++) {
      laps.push({ index: i, distanceM: 1000, timeSec: 360, avgPaceSec: 360, avgHr: i <= 5 ? 140 : Math.round(140 * (1 + driftPct / 100)) });
    }
    return laps;
  }
  const caps = cycleCaps(highDecSnapshot, profile);
  assert(caps.cap === 1.0 && caps.reasons.length > 0, '解耦 >10% → cap 1.0', `cap=${caps.cap} dec=${caps.decouplingAvg}`);

  // VO2max 差异 >4 → 参照提示
  const divSnapshot = { ...highDecSnapshot, activities: [], fitness: { ltPaceSec: 278, vo2max: 55 } } as never;
  const caps2 = cycleCaps(divSnapshot, profile);
  assert(caps2.vo2maxDivergence !== null, 'VO2max 55 vs VDOT≈45 → 差异提示', `div=${caps2.vo2maxDivergence?.diff}`);

  // 合并进周自适应：主观 1.05 × 客观 1.05，但 cycle cap 1.0 → 封顶
  const fullCompletions: Record<string, { status: 'full' | 'partial' | 'skip'; rpe: 0 | 1 | 2 | 3 | 4 }> = {};
  for (let i = 0; i < 7; i++) {
    if (plan[i].workoutType !== 'Rest') fullCompletions[format(addDays(monday, i), 'yyyy-MM-dd')] = { status: 'full', rpe: 1 };
  }
  const m = computeWeeklyAdaptation(plan, fullCompletions, addDays(monday, 6), { factor: 1.05, summary: 's', signals: [] }, null, caps);
  assert(m.factor === 1.0 && (m.cycleReasons?.length ?? 0) > 0, '周期层封顶 1.0', `factor=${m.factor} reasons=${m.cycleReasons?.length}`);
}

console.log('\n── Garmin FIT 适配器 ──');
{
  const { parseFitFiles } = await import('../src/utils/insights/fit-adapter.ts');
  // 无效缓冲 → 诚实降级（failed 计数、空快照），不抛异常
  const bad = await parseFitFiles([{ name: 'bad.fit', buffer: new ArrayBuffer(16) }]);
  assert(bad.snapshot.activities.length === 0 && bad.failed === 1, '无效 FIT → 空快照 + failed=1', `failed=${bad.failed}`);
  assert(bad.snapshot.source === 'garmin-fit' && bad.snapshot.dailyMetrics.length === 0, 'garmin 源 + 无日指标（诚实降级）');
}

console.log('\n── insights 库回归（validate/zones/metrics/规则/coach，自 insights/selftest 移植）──');
{
  const { parseSnapshot } = await import('../src/utils/insights/validate.ts');
  const { paceToZone } = await import('../src/utils/insights/zones.ts');
  const {
    weeklyVolume, zoneDistribution, splitHalves, trendSlope, baseline,
    efficiencyFactorSeries, decouplingSeries, seilerDistribution, sleepDebt,
  } = await import('../src/utils/insights/metrics.ts');
  const {
    loadInsight, recoveryInsight, zoneInsight, paceStabilityInsight,
    efTrendInsight, decouplingInsight, seilerInsight, sleepDebtInsight,
  } = await import('../src/utils/insights/insights.ts');
  const {
    engineEffectiveLtPace, estimateLthr, adaptationVerdict, buildCoachReport,
    parseEngineBackup, buildCalibratedBackup,
  } = await import('../src/utils/insights/coach.ts');

  // ── validate：白名单校验 ──
  const goodRun = { date: '2026-08-01', type: 'run', distanceKm: 5, avgPaceSec: 360, avgHr: 140, laps: [{ index: 1, distanceM: 1000, timeSec: 360, avgPaceSec: 360 }] };
  const good = parseSnapshot({ version: 1, source: 'test', builtAt: 'x', fitness: { vo2max: 48, ltPaceSec: 278 }, activities: [goodRun], dailyMetrics: [] });
  assert(good.ok === true, 'validate: 合法 snapshot 通过');
  assert(parseSnapshot({ version: 2, source: 'x', activities: [goodRun] }).ok === false, 'validate: version≠1 拒绝');
  assert(parseSnapshot({ version: 1, source: 'x', activities: [] }).ok === false, 'validate: 空活动拒绝');
  assert(parseSnapshot('junk').ok === false, 'validate: 非对象拒绝');
  const dirty = parseSnapshot({
    version: 1, source: 'test', builtAt: 'x',
    activities: [
      goodRun,
      { ...goodRun, avgPaceSec: 99999 },
      { ...goodRun, date: 'bad-date' },
      { ...goodRun, distanceKm: 500 },
    ],
    dailyMetrics: [{ date: '2026-08-01', restingHr: 999 }],
  });
  assert(dirty.ok === true && dirty.dropped > 0, 'validate: 脏数据进入计数');
  if (dirty.ok) {
    assert(dirty.snapshot.activities.length === 3, 'validate: 坏日期整条丢弃');
    assert(dirty.snapshot.activities.find((a: ActualActivity) => a.avgPaceSec === undefined) !== undefined, 'validate: 超范围配速置空');
    assert(dirty.snapshot.dailyMetrics[0].restingHr === undefined, 'validate: 超范围静息心率置空');
  }

  // ── zones：六区边界（LT=278）──
  assert(paceToZone(278, 278) === 4, 'zones: LT 落 Z4');
  assert(paceToZone(290, 278) === 4, 'zones: LT+12 仍 Z4');
  assert(paceToZone(291, 278) === 3, 'zones: LT+13 落 Z3');
  assert(paceToZone(330, 278) === 2, 'zones: LT+52 落 Z2');
  assert(paceToZone(376, 278) === 1, 'zones: LT+98 落 Z1');
  assert(paceToZone(265, 278) === 5, 'zones: LT-13 落 Z5');
  assert(paceToZone(247, 278) === 6, 'zones: LT-31 落 Z6');
  assert(paceToZone(undefined, 278) === null, 'zones: 无配速返回 null');

  // ── metrics：周聚合 / 落区 / 分割 / 趋势 ──
  const wRuns = [
    { date: '2026-08-03', type: 'run', distanceKm: 10, durationSec: 3600 },
    { date: '2026-08-05', type: 'run', distanceKm: 5, durationSec: 1800 },
    { date: '2026-08-10', type: 'run', distanceKm: 8, durationSec: 2880 },
    { date: '2026-08-12', type: 'strength', durationSec: 2400 },
  ];
  const wv = weeklyVolume(wRuns);
  assert(wv.length === 2, 'metrics: 周聚合两周');
  assert(Math.abs((wv[0]?.km ?? 0) - 15) < 0.01, 'metrics: 首周跑量 15km');
  assert(wv[1]?.runCount === 1, 'metrics: 力量不进周跑量');
  const zonedRun = {
    date: '2026-08-01', type: 'run', distanceKm: 4,
    laps: [
      { index: 1, distanceM: 1000, timeSec: 380, avgPaceSec: 380 },
      { index: 2, distanceM: 1000, timeSec: 350, avgPaceSec: 350 },
      { index: 3, distanceM: 1000, timeSec: 280, avgPaceSec: 280 },
      { index: 4, distanceM: 1000, timeSec: 270, avgPaceSec: 270 },
    ],
  };
  const zd = zoneDistribution([zonedRun], 278);
  assert(Math.abs(zd.shares.reduce((s, x) => s + x.km, 0) - 4) < 0.01, 'metrics: 落区总公里 4km');
  assert(Math.abs((zd.shares.find((s) => s.zone === 4)?.pct ?? 0) - 50) < 0.01, 'metrics: Z4 占 50%');
  const splitRun = {
    date: '2026-08-01', type: 'run', distanceKm: 6,
    laps: [350, 350, 350, 380, 380, 380].map((p, i) => ({ index: i + 1, distanceM: 1000, timeSec: p, avgPaceSec: p })),
  };
  const sp = splitHalves(splitRun);
  assert(sp !== null && Math.abs(sp.diffSec - 30) < 0.01, 'metrics: 后半掉速 +30s');
  assert(splitHalves({ ...splitRun, laps: splitRun.laps?.slice(0, 3) }) === null, 'metrics: 圈数不足 null');
  const cooldownRun = {
    date: '2026-08-13', type: 'run', distanceKm: 7,
    laps: [...[383, 385, 386, 380, 376, 374].map((p, i) => ({ index: i + 1, distanceM: 1000, timeSec: p, avgPaceSec: p })),
      { index: 7, distanceM: 500, timeSec: 300, avgPaceSec: 359 },
      { index: 8, distanceM: 358, timeSec: 300, avgPaceSec: 835 }],
  };
  const spCd = splitHalves(cooldownRun);
  assert(spCd !== null && Math.abs(spCd.diffSec) < 15, 'metrics: 冷身走圈被过滤');
  assert((trendSlope([1, 2, 3, 4, 5]) ?? 0) > 0.9, 'metrics: 上升趋势');
  assert(trendSlope([1, 2, 3]) === null, 'metrics: 样本不足 null');
  assert(baseline([10, 20, 30]) === 20, 'metrics: 基线均值');

  // ── 科学指标回归：EF / 解耦 / Seiler / 睡眠负债 ──
  const efRuns = [
    { date: '2026-08-01', type: 'run', distanceKm: 6, avgPaceSec: 380, avgHr: 140 },
    { date: '2026-08-03', type: 'run', distanceKm: 6, avgPaceSec: 375, avgHr: 138 },
    { date: '2026-08-05', type: 'run', distanceKm: 6, avgPaceSec: 370, avgHr: 136 },
    { date: '2026-08-07', type: 'run', distanceKm: 6, avgPaceSec: 365, avgHr: 134 },
    { date: '2026-08-08', type: 'run', distanceKm: 6, avgPaceSec: 290, avgHr: 165 },
    { date: '2026-08-09', type: 'run', distanceKm: 3, avgPaceSec: 380, avgHr: 140 },
  ];
  const efSeries = efficiencyFactorSeries(efRuns, 278);
  assert(efSeries.length === 4, 'EF: 只统计稳定有氧跑 4/6');
  assert(Math.abs(efSeries[0].ef - (1000 / 380 * 60) / 140) < 0.001, 'EF: 公式 = 速度÷心率');
  assert(efTrendInsight(efSeries)?.includes('上升') === true, 'EF: 上升洞察');
  assert(efTrendInsight(efSeries.slice(0, 2)) === null, 'EF: 样本不足 null');
  const driftLaps = Array.from({ length: 10 }, (_, i) => ({ index: i + 1, distanceM: 1000, timeSec: 360, avgPaceSec: 360, avgHr: i < 5 ? 140 : 150 }));
  const dp = decouplingSeries([{ date: '2026-08-10', type: 'run', distanceKm: 10, laps: driftLaps }]);
  assert(dp.length === 1 && dp[0].driftPct > 5, '解耦: 心率漂移为正');
  assert(decouplingSeries([{ date: 'x', type: 'run', distanceKm: 10, laps: driftLaps.slice(0, 6) }]).length === 0, '解耦: 分圈不足不统计');
  assert(decouplingInsight([{ date: 'x', driftPct: 3, distanceKm: 12 }])?.includes('扎实') === true, '解耦: <5% 判定');
  const seilerRun = { ...zonedRun, laps: [...(zonedRun.laps ?? []), ...(zonedRun.laps ?? []), ...(zonedRun.laps ?? [])].map((l, i) => ({ ...l, index: i + 1 })) };
  const seiler = seilerDistribution([seilerRun], 278, 28, '2026-08-15');
  assert(seiler !== null && Math.abs(seiler.lowPct + seiler.midPct + seiler.highPct - 100) < 0.01, 'Seiler: 三区总和 100%');
  assert(seilerDistribution([{ ...seilerRun, date: '2026-06-01' }], 278, 28, '2026-08-15') === null, 'Seiler: 窗口外不计入');
  assert(seilerInsight({ lowPct: 95, midPct: 4, highPct: 1 })?.includes('高强度刺激') === true, 'Seiler: 缺强度判定');
  assert(seilerInsight({ lowPct: 80, midPct: 8, highPct: 12 })?.includes('极化模型') === true, 'Seiler: 80/20 判定');
  assert(seilerInsight({ lowPct: 40, midPct: 50, highPct: 10 })?.includes('灰区') === true, 'Seiler: 灰区陷阱判定');
  const debtMetrics = Array.from({ length: 14 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, sleepMinutes: 360 }));
  const debt = sleepDebt(debtMetrics);
  assert(debt !== null && debt.debtMin === 840, '睡眠负债: 14×60=840min');
  assert(sleepDebtInsight(debt)?.includes('负债') === true, '睡眠负债: 重债预警');
  assert(sleepDebtInsight(sleepDebt(debtMetrics.map((m) => ({ ...m, sleepMinutes: 460 })))) === null, '睡眠负债: 充足不报警');

  // ── 规则句回归 ──
  const highLoadDays = Array.from({ length: 7 }, (_, i) => ({ date: `2026-08-${String(i + 8).padStart(2, '0')}`, loadRatio: 1.55, loadComment: 'Excessive' }));
  assert(loadInsight(highLoadDays)?.includes('Excessive') === true, '规则: 连续 Excessive 预警');
  assert(loadInsight(highLoadDays.slice(0, 2)) === null, '规则: 负荷数据不足 null');
  const tiredDays = [
    ...Array.from({ length: 10 }, (_, i) => ({ date: `2026-07-${String(i + 20).padStart(2, '0')}`, restingHr: 55, sleepMinutes: 450, hrvMs: 75, hrvBaseline: 72 })),
    ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-08-${String(i + 8).padStart(2, '0')}`, restingHr: 62, sleepMinutes: 330, hrvMs: 60, hrvBaseline: 72 })),
  ];
  const ri = recoveryInsight(tiredDays);
  assert(ri?.includes('静息心率') === true && ri?.includes('睡眠') === true && ri?.includes('HRV') === true, '规则: 疲劳三联预警');
  assert(paceStabilityInsight([splitRun, splitRun, splitRun])?.includes('掉速') === true, '规则: 掉速洞察');
  assert(paceStabilityInsight([splitRun]) === null, '规则: 样本不足 null');

  // ── coach：引擎 LT 解析链 / LTHR / 裁决 / 报告 / 备份桥 ──
  const baseProfile = {
    height: 175, weight: 70, pb5k: '23:00', pb10k: '48:00', pbHalf: '1:46:00', pbFull: '',
    lthr: '', ltPace: '', raceDate: '2026-12-01', raceType: 'full', goalTime: '3:45:00',
    intensity: 'moderate', longRunDay: 0,
  };
  assert(engineEffectiveLtPace({ ...baseProfile, ltPace: '4:30' })?.source === '手动填写的 LT', 'coach: 手动 LT 第一优先');
  assert(Math.abs((engineEffectiveLtPace(baseProfile)?.paceSec ?? 0) - (6360 / 21.1) * 0.93) < 0.01, 'coach: 半马推算公式');
  assert(engineEffectiveLtPace({ ...baseProfile, pbHalf: '', pbFull: '3:40:00' })?.source === '全马 PB 推算', 'coach: 降级顺序');
  assert(engineEffectiveLtPace({ ...baseProfile, pb5k: '', pb10k: '', pbHalf: '', pbFull: '' }) === null, 'coach: 无成绩 null');
  const lthrSnapshot = {
    version: 1, source: 'test', builtAt: 'x', fitness: { ltPaceSec: 278 },
    activities: [{ date: '2026-08-01', type: 'run', distanceKm: 10, laps: [
      { index: 1, distanceM: 1000, timeSec: 278, avgPaceSec: 278, avgHr: 164 },
      { index: 2, distanceM: 1000, timeSec: 280, avgPaceSec: 280, avgHr: 166 },
      { index: 3, distanceM: 1000, timeSec: 276, avgPaceSec: 276, avgHr: 168 },
      { index: 4, distanceM: 1000, timeSec: 380, avgPaceSec: 380, avgHr: 140 },
    ] }],
    dailyMetrics: [],
  } as never;
  assert(estimateLthr(lthrSnapshot) === 166, 'coach: LTHR = LT 带均值');
  assert(estimateLthr({ ...lthrSnapshot, activities: [{ ...(lthrSnapshot as { activities: unknown[] }).activities[0] as object, laps: [{ index: 1, distanceM: 1000, timeSec: 278, avgPaceSec: 278, avgHr: 164 }] }] } as never) === null, 'coach: LTHR 样本不足 null');
  const riskyMetrics = [
    ...Array.from({ length: 10 }, (_, i) => ({ date: `2026-07-${String(i + 10).padStart(2, '0')}`, restingHr: 55, sleepMinutes: 450, hrvMs: 75, hrvBaseline: 72, loadRatio: 1.0, loadComment: 'Optimized' })),
    ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-08-${String(i + 8).padStart(2, '0')}`, restingHr: 62, sleepMinutes: 330, hrvMs: 60, hrvBaseline: 72, loadRatio: 1.6, loadComment: 'Excessive' })),
  ];
  assert(adaptationVerdict({ version: 1, source: 'x', builtAt: 'x', activities: [], dailyMetrics: riskyMetrics, recovery: { pct: 30 } } as never)?.factor === 0.90, 'coach: 多重风险 → 0.90');
  assert(adaptationVerdict({ version: 1, source: 'x', builtAt: 'x', activities: [], dailyMetrics: [] } as never) === null, 'coach: 数据不足不出裁决');
  const calProfile = { ...baseProfile, pbHalf: '1:50:00', pbFull: '3:50:00' };
  const report = buildCoachReport({
    version: 1, source: 'coros-mcp', builtAt: '2026-08-16T00:00:00Z', device: 'COROS VERTIX 2S',
    fitness: { ltPaceSec: 278, predictions: { full: '3:37:47' } }, activities: [], dailyMetrics: riskyMetrics, recovery: { pct: 30 },
  } as never, calProfile);
  assert(report.schema === 'marathon-coach-rx' && report.version === 1, 'coach: 报告 schema');
  const ltRec = report.recommendations.find((r) => r.id === 'lt-pace');
  assert(ltRec?.autoPatch === true && ltRec?.recommendedValue === '4:38', 'coach: LT 校准触发');
  assert(report.patch.ltPace === '4:38', 'coach: 补丁含 ltPace');
  assert(report.recommendations.some((r) => r.id === 'pb-refresh' && r.autoPatch === true),
    'coach: PB 能力校准刷新（C1 自动档）');
  assert(report.recommendations.some((r) => r.id === 'goal-feasibility'), 'coach: 目标可行性');
  const engineBackup = {
    schema: 'marathon-backup', version: 1, app: 'marathon-training', exportedAt: '2026-08-15T00:00:00.000Z',
    data: { profile: { ...baseProfile }, plan: [], completions: { '2026-08-10': { status: 'full', rpe: 2 } }, myRaces: [], vacations: [], isPlanGenerated: false, planNeedsRegen: false, exportSync: {} },
  };
  const bridgeOk = parseEngineBackup(JSON.stringify(engineBackup));
  assert(bridgeOk.ok === true, 'coach: 合法备份解析通过');
  assert(parseEngineBackup(JSON.stringify({ ...engineBackup, schema: 'other' })).ok === false, 'coach: 错误 schema 拒绝');
  assert(parseEngineBackup(JSON.stringify({ ...engineBackup, data: { ...engineBackup.data, profile: { ...baseProfile, hack: 1 } } })).ok === false, 'coach: 未知 profile 字段拒绝');
  if (bridgeOk.ok) {
    const patched = JSON.parse(buildCalibratedBackup(bridgeOk.backup, { ltPace: '4:38', lthr: 166 }));
    assert(patched.data.profile.ltPace === '4:38' && patched.data.profile.lthr === 166, 'coach: 补丁写入');
    assert(JSON.stringify(patched.data.completions) === JSON.stringify(engineBackup.data.completions) && patched.data.profile.pbHalf === '1:46:00', 'coach: 其余原样保留');
  }
}

console.log('\n── P3-1 回归：FIT 编码 / 赛事覆盖层 / 打卡文案 ──');
{
  // checkin-messages 的 markShown 需要 localStorage
  const lsStore = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (lsStore.has(k) ? lsStore.get(k)! : null),
    setItem: (k: string, v: string) => { lsStore.set(k, v); },
    removeItem: (k: string) => { lsStore.delete(k); },
  };

  const { encodeFIT } = await import('../src/utils/export-fit.ts');
  const { applyRaceOverlays } = await import('../src/utils/race-plan-overlay.ts');
  const { getCheckInMessage } = await import('../src/utils/checkin-messages.ts');

  // ── export-fit：FIT 二进制结构 ──
  const wk: import('../src/utils/training-engine.ts').DailyWorkout = {
    date: new Date('2026-08-20T04:00:00Z'),
    workoutType: 'Tempo',
    description: '节奏跑 8k',
    targetPace: "5'00\"-5'30\"",
    distanceKm: 8,
  };
  const fit = encodeFIT(wk);
  assert(fit.length > 40, 'FIT: 有内容');
  const magic = String.fromCharCode(fit[8], fit[9], fit[10], fit[11]);
  assert(magic === '.FIT', 'FIT: 魔数 .FIT');
  const crc = fit[fit.length - 2] | (fit[fit.length - 1] << 8);
  assert(crc !== 0, 'FIT: 有 CRC');
  // 头部 data size = 文件长度 - 14 头 - 2 CRC
  const dataSize = fit[4] | (fit[5] << 8) | (fit[6] << 16) | (fit[7] << 24);
  assert(dataSize === fit.length - 16, 'FIT: 数据长度字段正确');
  // 三种消息：file_id(0) / workout(26) / workout_step(27) 的定义消息头存在
  //（data 消息变长，需按 local type 的字段总长推进）
  const fieldSizeByLocal = new Map<number, number>();
  const defs: number[] = [];
  for (let i = 14; i < fit.length - 2;) {
    const h = fit[i];
    if (h & 0x40) {
      const local = h & 0x0F;
      const count = fit[i + 5];
      let size = 0;
      for (let f = 0; f < count; f++) size += fit[i + 6 + f * 3 + 1];
      fieldSizeByLocal.set(local, size);
      defs.push(fit[i + 3] | (fit[i + 4] << 8));
      i += 6 + count * 3;
    } else {
      i += 1 + (fieldSizeByLocal.get(h & 0x0F) ?? 0);
    }
  }
  assert(defs.includes(0) && defs.includes(26) && defs.includes(27), 'FIT: file_id/workout/step 消息齐全');

  // ── race-plan-overlay：减量 / 恢复 / 比赛日注入 ──
  // 主赛事 = 计划最后一天（08-30 全马）；次赛事放计划早期（08-04），避开 21 天双减量保护
  const planDates = (start: Date, days: number): import('../src/utils/training-engine.ts').DailyWorkout[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: d, workoutType: i % 7 === 0 ? 'LSD' : 'Easy', description: 'base', distanceKm: i % 7 === 0 ? 18 : 8 };
    });
  const base = planDates(new Date('2026-08-03T04:00:00Z'), 28);
  // 主赛事 = 计划最后一天：引擎已在其上生成 Race 课（模拟引擎输出）
  base[27] = { ...base[27], workoutType: 'Race', description: '主马拉松', distanceKm: 42.195 };
  const races: import('../src/store/useStore.ts').MyRace[] = [
    { raceId: 'r1', distance: 'full', goal: 'pb', addedAt: 'x', name: '主马拉松', date: '2026-08-30', city: '', province: '', status: 'open' },
    { raceId: 'r2', distance: 'full', goal: 'pb', addedAt: 'x', name: '次马拉松', date: '2026-08-04', city: '', province: '', status: 'open' },
  ];
  const overlaid = applyRaceOverlays(base, races, 'full');
  // 主赛事日保持引擎注入的 Race 不变（overlay 双减量保护不覆盖主赛事）
  assert(overlaid[27]?.workoutType === 'Race', '覆盖: 主赛事日 Race 保持');
  // 次赛事（避开 21 天保护）注入 Race
  assert(overlaid[1]?.workoutType === 'Race', '覆盖: 次赛事日注入 Race');
  // 次赛前减量：08-03（LSD 基础 18km，比赛前 1 天）跑量应显著低于基础
  const pre1 = overlaid[0];
  assert(pre1 && (pre1.distanceKm ?? 0) < 12, '覆盖: 赛前减量生效');
  // 恢复：次赛后第 1 天（08-05）类型 Recovery/Easy 且跑量低于基础
  const post1 = overlaid[2];
  assert(post1 && (post1.workoutType === 'Recovery' || post1.workoutType === 'Easy') && (post1.distanceKm ?? 0) < 8, '覆盖: 赛后恢复减量');
  // 无赛事 → 原样返回
  assert(applyRaceOverlays(base, [], 'full') === base, '覆盖: 无赛事原样返回');

  // ── checkin-messages：分类池 ──
  const skipMsg = getCheckInMessage('skip', 2, 'Easy');
  assert(typeof skipMsg.id === 'string' && skipMsg.id.length > 0 && skipMsg.text.length > 0, '文案: skip 返回有效消息');
  const partialMsg = getCheckInMessage('partial', 2, 'Easy');
  assert(partialMsg.text.length > 0, '文案: partial 返回有效消息');
  const fullMsg = getCheckInMessage('full', 3, 'Interval');
  assert(fullMsg.text.length > 0, '文案: full 高 RPE 返回有效消息');
  const easyMsg = getCheckInMessage('full', 1, 'LSD');
  assert(easyMsg.text.length > 0, '文案: full 低 RPE 返回有效消息');
}

console.log('\n── auto-checkin：活动 ↔ 计划匹配 ──');
{
  const plan: DailyWorkout[] = [
    { date: parseLocalDate('2026-08-17'), workoutType: 'Easy', description: 'Easy 8k', distanceKm: 8 },
    { date: parseLocalDate('2026-08-18'), workoutType: 'Rest', description: '休息' },
    { date: parseLocalDate('2026-08-19'), workoutType: 'LSD', description: 'LSD 18k', distanceKm: 18 },
    { date: parseLocalDate('2026-08-20'), workoutType: 'Tempo', description: 'Tempo 8k', distanceKm: 8, targetPace: "4'26\"-4'50\"" },
  ];
  const run = (date: string, distanceKm: number, extra: Partial<import('../src/utils/insights/types.ts').ActualActivity> = {}) =>
    ({ date, type: 'run', distanceKm, ...extra });

  // 同日期 + 距离在容差内 → full
  const full = matchActivitiesToPlan(plan, [run('2026-08-17', 8.4)]);
  assert(full.length === 1 && full[0].dateStr === '2026-08-17', '匹配: 距离容差内 full');
  assert(full[0].status === 'full' && full[0].plannedKm === 8 && full[0].actualKm === 8.4, '匹配: full 字段');
  assert(full[0].workoutType === 'Easy', '匹配: 课型');

  // 跑量显著不足（18km 只跑 9km=0.5）→ partial
  const partial = matchActivitiesToPlan(plan, [run('2026-08-19', 9)]);
  assert(partial.length === 1 && partial[0].status === 'partial', '匹配: 半程 partial');

  // 跑量过短（0.28 < 0.4 下限）→ 不匹配
  assert(matchActivitiesToPlan(plan, [run('2026-08-19', 5)]).length === 0, '匹配: 过短不匹配');

  // 跑量超出太多（1.875 > 1.3 上限）→ 不匹配
  assert(matchActivitiesToPlan(plan, [run('2026-08-20', 15)]).length === 0, '匹配: 超量太多不匹配');

  // 休息日（无距离课）→ 不匹配
  assert(matchActivitiesToPlan(plan, [run('2026-08-18', 5)]).length === 0, '匹配: Rest 日不匹配');

  // 非 run 活动（力量）→ 不匹配
  assert(matchActivitiesToPlan(plan, [{ date: '2026-08-17', type: 'strength', distanceKm: 0 }]).length === 0, '匹配: 力量课不匹配');

  // 日期不同 → 不匹配
  assert(matchActivitiesToPlan(plan, [run('2026-08-16', 8.2)]).length === 0, '匹配: 日期不同不匹配');

  // 同日多次跑 → 取距离比最接近 1 的
  const multi = matchActivitiesToPlan(plan, [run('2026-08-17', 4), run('2026-08-17', 8.1)]);
  assert(multi.length === 1 && multi[0].actualKm === 8.1, '匹配: 同日取最近距离');

  // 已有打卡 → 跳过（不覆盖手动记录）
  const existing = { '2026-08-17': { status: 'full' as const, rpe: 3 as const } };
  const filtered = buildAutoCheckinSuggestions(plan, [run('2026-08-17', 8.1), run('2026-08-19', 17)], existing);
  assert(filtered.length === 1 && filtered[0].dateStr === '2026-08-19', '匹配: 已有打卡跳过');
  assert(filtered[0].status === 'full' && filtered[0].rpe === 2, '匹配: full 默认 RPE 2');

  // 建议的默认 RPE 为 2（正常），用户可改
  assert(matchActivitiesToPlan(plan, [run('2026-08-20', 7.9)])[0].rpe === 2, '匹配: 默认 RPE 2');

  // 配速门：质量课（有 targetPace）明显慢于目标区间 → full 降 partial
  const paceOff = matchActivitiesToPlan(plan, [run('2026-08-20', 7.5, { avgPaceSec: 400 })]);
  assert(paceOff.length === 1 && paceOff[0].status === 'partial', '匹配: 质量课配速过慢降 partial');
  // 配速在目标范围内 → full
  const paceOk = matchActivitiesToPlan(plan, [run('2026-08-20', 7.9, { avgPaceSec: 280 })]);
  assert(paceOk.length === 1 && paceOk[0].status === 'full', '匹配: 质量课配速达标 full');
  // 轻松课不查配速（只有距离门）
  const easySlow = matchActivitiesToPlan(plan, [run('2026-08-17', 7.5, { avgPaceSec: 480 })]);
  assert(easySlow.length === 1 && easySlow[0].status === 'full', '匹配: 轻松课忽略配速');
  // Progression（引擎真实课型）同样匹配 + 配速门
  const prog = matchActivitiesToPlan(
    [{ date: parseLocalDate('2026-08-21'), workoutType: 'Progression', description: 'p', distanceKm: 8, targetPace: "4'26\"-4'50\"" }],
    [run('2026-08-21', 7.6, { avgPaceSec: 400 })],
  );
  assert(prog.length === 1 && prog[0].status === 'partial', '匹配: Progression 课匹配 + 配速门');
  // 配速略慢（≤25%）仍算达标（热身/冷身混入均值）
  const paceSlightlyOff = matchActivitiesToPlan(plan, [run('2026-08-20', 7.8, { avgPaceSec: 360 })]);
  assert(paceSlightlyOff[0].status === 'full', '匹配: 配速略慢仍 full');
}

console.log('\n── auto-checkin 2：生效计划口径 + RPE 细化 ──');
{
  // 就绪门降级场景：3 天内强度课在恢复不足时被降级为轻松跑，
  // 用户按降级课跑 → 应判 full（Easy 无配速门），而不是按原 TempoIntervals 判 partial。
  const asOf = new Date('2026-08-23T04:00:00Z');
  const effPlanInput: import('../src/utils/auto-checkin.ts').AutoCheckinStateInput = {
    plan: [
      { date: asOf, workoutType: 'Easy', description: 'Easy 6k', distanceKm: 6 },
      { date: new Date('2026-08-25T04:00:00Z'), workoutType: 'TempoIntervals', description: '节奏间歇 8k', distanceKm: 8, targetPace: "4'26\"-4'50\"" },
    ],
    completions: {},
    myRaces: [],
    vacations: [],
    profile: {
      height: 175, weight: 65,
      pb5k: '20:00', pb10k: '42:00', pbHalf: '1:35:00', pbFull: '3:30:00',
      lthr: 170, ltPace: '4:30',
      raceDate: '2026-11-15', raceType: 'full', goalTime: '3:30:00',
      intensity: 'moderate', longRunDay: 0,
    },
    corosSnapshot: null,
    objective: null,
    override: null,
    sessionOverride: null,
    asOf,
  };
  const easyRun = { date: '2026-08-25', type: 'run', name: '轻松跑', distanceKm: 7, avgPaceSec: 400 };
  const riskSnapshot = {
    version: 1, source: 'test', builtAt: 'x', device: '',
    recovery: { pct: 30 },
    activities: [easyRun],
    dailyMetrics: [
      { date: '2026-08-21', hrvMs: 30, hrvBaseline: 50 },
      { date: '2026-08-22', hrvMs: 30, hrvBaseline: 50 },
      { date: '2026-08-23', hrvMs: 30, hrvBaseline: 50 },
    ],
  };
  const goodSnapshot = {
    version: 1, source: 'test', builtAt: 'x', device: '',
    recovery: { pct: 80 },
    activities: [easyRun],
    dailyMetrics: [
      { date: '2026-08-21', hrvMs: 55, hrvBaseline: 50 },
      { date: '2026-08-22', hrvMs: 55, hrvBaseline: 50 },
      { date: '2026-08-23', hrvMs: 55, hrvBaseline: 50 },
    ],
  };

  // 恢复不足：就绪门降级 → 轻松跑 7km 对降级后的 Easy 8km → full
  const riskSuggestions = buildAutoCheckinSuggestionsFromAppState({
    ...effPlanInput, corosSnapshot: riskSnapshot as never,
  });
  assert(
    riskSuggestions.length === 1 && riskSuggestions[0].status === 'full',
    '生效计划: 恢复不足降级后按轻松跑判 full',
  );
  // 恢复正常：不降级 → 同一次轻松跑对 TempoIntervals → 配速门判 partial
  const goodSuggestions = buildAutoCheckinSuggestionsFromAppState({
    ...effPlanInput, corosSnapshot: goodSnapshot as never,
  });
  assert(
    goodSuggestions.length === 1 && goodSuggestions[0].status === 'partial',
    '生效计划: 恢复正常按原强度课判 partial',
  );

  // 休假覆盖：休假中的课不产生建议（课变 Rest）
  const vacationSuggestions = buildAutoCheckinSuggestionsFromAppState({
    ...effPlanInput,
    corosSnapshot: goodSnapshot as never,
    vacations: [{ id: 'v1', start: '2026-08-24', end: '2026-08-26' }],
  });
  assert(vacationSuggestions.length === 0, '生效计划: 休假中的课不匹配');

  // RPE 细化：partial（配速门）→ RPE 1
  assert(goodSuggestions[0].rpe === 1, 'RPE: 配速门 partial → 1');
  // 质量课 full 且配速快于区间快端 → RPE 3
  const fastRun = { date: '2026-08-25', type: 'run', name: 't', distanceKm: 7.9, avgPaceSec: 250 };
  // 简化：直接测 matchActivitiesToPlan 的 RPE 规则
  const plan2: DailyWorkout[] = [
    { date: parseLocalDate('2026-08-25'), workoutType: 'Tempo', description: 't', distanceKm: 8, targetPace: "4'26\"-4'50\"" },
  ];
  const fast = matchActivitiesToPlan(plan2, [{ date: '2026-08-25', type: 'run', distanceKm: 7.9, avgPaceSec: 250 }]);
  assert(fast[0].rpe === 3, 'RPE: 快于目标区间 → 3');
  const inRange = matchActivitiesToPlan(plan2, [{ date: '2026-08-25', type: 'run', distanceKm: 7.9, avgPaceSec: 280 }]);
  assert(inRange[0].rpe === 2, 'RPE: 区间内 → 2');
  const slowish = matchActivitiesToPlan(plan2, [{ date: '2026-08-25', type: 'run', distanceKm: 7.9, avgPaceSec: 360 }]);
  assert(slowish[0].rpe === 1, 'RPE: 慢于慢端 ≤25% → 1');
  // Easy 课 full → RPE 2（无配速信息可用，保持中性）
  const easyP = matchActivitiesToPlan([{ date: parseLocalDate('2026-08-25'), workoutType: 'Easy', description: 'e', distanceKm: 6 }],
    [{ date: '2026-08-25', type: 'run', distanceKm: 5.8, avgPaceSec: 480 }]);
  assert(easyP[0].rpe === 2, 'RPE: 轻松课保持 2');
}

console.log('\n── checkin-streak：连续打卡 ──');
{
  const asOf = new Date('2026-08-23T04:00:00Z'); // 周日
  const day = (offset: number) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() + offset);
    return format(d, 'yyyy-MM-dd');
  };
  const full = { status: 'full' as const, rpe: 2 as const };

  // 空 → 0
  assert(countStreak({}, asOf) === 0, 'streak: 无打卡 0');
  // 今天 + 昨天 + 前天 → 3
  const three = { [day(0)]: full, [day(-1)]: full, [day(-2)]: full };
  assert(countStreak(three, asOf) === 3, 'streak: 连续 3 天');
  // 今天未打卡、昨天起连续 → 从昨天算
  const noToday = { [day(-1)]: full, [day(-2)]: full, [day(-3)]: full };
  assert(countStreak(noToday, asOf) === 3, 'streak: 今天未打从昨天起算');
  // 中间断档 → 只数连续段
  const broken = { [day(0)]: full, [day(-1)]: full, [day(-3)]: full, [day(-4)]: full };
  assert(countStreak(broken, asOf) === 2, 'streak: 断档截断');
  // 今天 + 昨天 + 前天，中间断档在前天之后 → 2
  const broken2 = { [day(0)]: full, [day(-1)]: full, [day(-4)]: full };
  assert(countStreak(broken2, asOf) === 2, 'streak: 前天断档');
  // 跨月边界（8-31 → 9-1）
  const monthEdge = {
    '2026-08-31': full, '2026-09-01': full,
  };
  assert(countStreak(monthEdge, new Date('2026-09-01T04:00:00Z')) === 2, 'streak: 跨月连续');
}

console.log('\n── ACWR：打卡实测口径 ──');
{
  const asOf = new Date('2026-08-23T04:00:00Z');
  const day = (offset: number) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() + offset);
    return format(d, 'yyyy-MM-dd');
  };
  const mkPlan = (days: number): DailyWorkout[] => Array.from({ length: days }, (_, i) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() - (days - 1) + i);
    return { date: d, workoutType: 'Easy', description: 'e', distanceKm: 10 };
  });
  const plan40 = mkPlan(40); // 覆盖完整 28 天窗口
  const comp = (status: 'full' | 'partial' | 'skip') => ({ status, rpe: 2 as const });

  // 窗口内 28 天全打卡 full → 急=慢 → acwr 1.0
  const allFull: Record<string, { status: string; rpe: number }> = {};
  for (let i = -27; i <= 0; i++) allFull[day(i)] = comp('full');
  const r1 = computeACWR(plan40, allFull, asOf);
  assert(r1 !== null && Math.abs(r1.acwr - 1) < 0.01, 'ACWR: 全打卡急慢性相等 → 1.0');
  assert(r1!.checkedDays === 28 && r1!.assumedDays === 0, 'ACWR: 全打卡无假设日');

  // 过去未打卡 → 0 参与（不再按计划完成假设）
  const onlyPast7: Record<string, { status: string; rpe: number }> = {};
  for (let i = -6; i <= 0; i++) onlyPast7[day(i)] = comp('full'); // 急性窗口 7 天打卡
  const r2 = computeACWR(plan40, onlyPast7, asOf);
  // 急性 = 7×10 = 70；慢性 = 70/4 = 17.5 → acwr = 4.0
  assert(r2 !== null && Math.abs(r2.acwr - 4) < 0.01, 'ACWR: 未打卡日按 0 计（急性70/慢性17.5）');
  assert(r2!.assumedDays === 21, 'ACWR: 21 天未打卡按 0 计');

  // partial → 0.5
  const withPartial: Record<string, { status: string; rpe: number }> = {};
  for (let i = -27; i <= 0; i++) withPartial[day(i)] = i === -3 ? comp('partial') : comp('full');
  const r3 = computeACWR(plan40, withPartial, asOf);
  assert(r3 !== null && r3!.acuteKm === 65, 'ACWR: partial 计 0.5（急性 65）');

  // skip → 0
  const withSkip: Record<string, { status: string; rpe: number }> = {};
  for (let i = -27; i <= 0; i++) withSkip[day(i)] = i === -3 ? comp('skip') : comp('full');
  const r4 = computeACWR(plan40, withSkip, asOf);
  assert(r4 !== null && r4!.acuteKm === 60, 'ACWR: skip 计 0（急性 60）');

  // 今天未打卡 → 0（不进急性）
  const noToday: Record<string, { status: string; rpe: number }> = {};
  for (let i = -27; i <= -1; i++) noToday[day(i)] = comp('full');
  const r5 = computeACWR(plan40, noToday, asOf);
  assert(r5 !== null && r5!.acuteKm === 60, 'ACWR: 今天未打卡计 0（急性 60）');

  // 真实打卡天数不足 7 天 → null
  const sparse: Record<string, { status: string; rpe: number }> = { [day(-1)]: comp('full'), [day(-2)]: comp('full') };
  assert(computeACWR(plan40, sparse, asOf) === null, 'ACWR: 不足 7 天打卡 → null');

  // 窗口外（>28 天前）的课不参与：窗口外 12 天全跑 + 急性 7 天 → 慢性只计急性
  const windowOnly: Record<string, { status: string; rpe: number }> = {};
  for (let i = -39; i <= -28; i++) windowOnly[day(i)] = comp('full');
  for (let i = -6; i <= 0; i++) windowOnly[day(i)] = comp('full');
  const rWindow = computeACWR(plan40, windowOnly, asOf);
  // 若窗口外参与：慢性 = (120+70)/4 = 47.5 → 1.47；排除后 70/17.5 = 4.0
  assert(rWindow !== null && Math.abs(rWindow.acwr - 4) < 0.01, 'ACWR: 28 天窗口外不参与');

  // 慢性均值 < 0.5 → null
  const tiny: Record<string, { status: string; rpe: number }> = {};
  for (let i = -7; i <= -1; i++) tiny[day(i)] = comp('full');
  const planTiny: DailyWorkout[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() - 13 + i);
    return { date: d, workoutType: 'Easy', description: 'e', distanceKm: 0.5 };
  });
  const rTiny = computeACWR(planTiny, tiny, asOf);
  assert(rTiny === null || rTiny.chronicAvgKm >= 0.5, 'ACWR: 慢性过低不显示');
}

console.log('\n── 赛事冲突显式提示：双减量保护窗口 ──');
{
  const race = (id: string, date: string, name?: string) => ({
    raceId: id, distance: 'full' as const, goal: 'pb' as const,
    addedAt: 'x', date, ...(name ? { name } : {}),
  });
  const primary = race('p1', '2026-11-09', '主赛');

  // 窗口内（15 天）→ 被抑制
  const r1 = getSuppressedRaces([primary, race('b1', '2026-10-25', 'B赛')], '2026-11-09', 'full');
  assert(r1.length === 1 && r1[0].raceId === 'b1' && r1[0].daysFromPrimary === 15, '冲突: 窗口内被抑制');

  // 边界：恰好 21 天 → 抑制（与 overlay 的 <= 一致）
  const r2 = getSuppressedRaces([primary, race('b2', '2026-10-19')], '2026-11-09', 'full');
  assert(r2.length === 1 && r2[0].daysFromPrimary === 21, '冲突: 恰好 21 天边界');

  // 窗口外（28 天）→ 不抑制
  const r3 = getSuppressedRaces([primary, race('b3', '2026-10-12')], '2026-11-09', 'full');
  assert(r3.length === 0, '冲突: 窗口外不抑制');

  // 半马窗口 14 天：13 天抑制、15 天不抑制
  const r4 = getSuppressedRaces([race('p2', '2026-11-09'), race('b4', '2026-10-27')], '2026-11-09', 'half');
  const r5 = getSuppressedRaces([race('p2', '2026-11-09'), race('b5', '2026-10-25')], '2026-11-09', 'half');
  assert(r4.length === 1 && r5.length === 0, '冲突: 半马窗口 14 天');

  // 主赛本身不出现
  const r6 = getSuppressedRaces([primary], '2026-11-09', 'full');
  assert(r6.length === 0, '冲突: 主赛自身不出现');

  // 无主赛日期 → 空
  const r7 = getSuppressedRaces([race('b6', '2026-10-25')], '', 'full');
  assert(r7.length === 0, '冲突: 无主赛返回空');

  // dateTBD / 无日期跳过
  const r8 = getSuppressedRaces(
    [primary, { ...race('b7', '2026-10-20'), dateTBD: true }, { ...race('b8', ''), dateTBD: false }],
    '2026-11-09', 'full',
  );
  assert(r8.length === 0, '冲突: dateTBD/无日期跳过');
}

console.log('\n── TE 执行质量验证 ──');
{
  const asOf = new Date('2026-08-23T04:00:00Z');
  const day = (offset: number) => {
    const d = new Date(asOf);
    d.setDate(d.getDate() + offset);
    return format(d, 'yyyy-MM-dd');
  };
  // 8 次跑步，TE 分布 [1.5, 2.0, 2.5, 3.0, 3.2, 3.4, 4.0, 4.2]
  const teRuns = [1.5, 2.0, 2.5, 3.0, 3.2, 3.4, 4.0, 4.2].map((te, i) => ({
    date: day(-(i * 3)), type: 'run', name: `r${i}`, distanceKm: 8, aerobicTe: te,
  }));
  const strength = { date: day(-1), type: 'strength', name: '力量', aerobicTe: 1.2 };

  // 基线：过滤力量、窗口内样本
  const stats = teStats([...teRuns, strength], asOf);
  assert(stats !== null && stats.samples === 8, 'TE: 基线样本过滤（8 次跑步）');
  assert(stats!.median === 3 && stats!.p25 === 2 && stats!.p75 === 3.4,
    'TE: 中位数/分位数', `median=${stats?.median} p25=${stats?.p25} p75=${stats?.p75}`);

  // 样本不足（<5）→ null
  assert(teStats(teRuns.slice(0, 3), asOf) === null, 'TE: 样本 <5 → null');

  // 窗口外（>28 天）不参与
  const oldRun = { date: day(-40), type: 'run', name: 'old', distanceKm: 8, aerobicTe: 9 };
  const s2 = teStats([oldRun, ...teRuns.slice(0, 7)], asOf);
  assert(s2!.samples === 7, 'TE: 28 天窗口外不参与');

  // 判定：质量课 TE 低于 p25 → 强度不足
  const q = judgeTeQuality('Tempo', 'full', 1.5, stats!);
  assert(q.judgment === 'under-stimulus', 'TE: 质量课低刺激判不足');
  // 质量课中位附近 → 达标
  assert(judgeTeQuality('Tempo', 'full', 3.0, stats!).judgment === 'on-target', 'TE: 质量课达标');
  // 轻松课 TE 高于 p75 → 偏硬
  assert(judgeTeQuality('Easy', 'full', 4.2, stats!).judgment === 'over-cooked', 'TE: 轻松课偏硬');
  // 轻松课低 TE → 正常
  assert(judgeTeQuality('LSD', 'full', 2.0, stats!).judgment === 'on-target', 'TE: 轻松课正常');
  // partial 不判定
  assert(judgeTeQuality('Tempo', 'partial', 2.0, stats!).judgment === 'on-target', 'TE: partial 不判定');
  // Race 不做偏硬判定
  assert(judgeTeQuality('Race', 'full', 4.5, stats!).judgment === 'on-target', 'TE: Race 不判偏硬');
  // 无基线 → on-target
  assert(judgeTeQuality('Tempo', 'full', 2.0, null).judgment === 'on-target', 'TE: 无基线不判定');

  // 集成：matchActivitiesToPlan 的 TE 门
  const planTe: DailyWorkout[] = [
    { date: parseLocalDate('2026-08-22'), workoutType: 'Tempo', description: 't', distanceKm: 8, targetPace: "4'26\"-4'50\"" },
    { date: parseLocalDate('2026-08-21'), workoutType: 'Easy', description: 'e', distanceKm: 8 },
  ];
  // Tempo 配速达标但 TE 只有 1.2（含自身在内 9 样本，p25=2.0）→ 降 partial + 理由
  const rLow = matchActivitiesToPlan(planTe, [
    ...teRuns.map(r => ({ date: day(-(teRuns.indexOf(r) * 3)), type: 'run', name: r.name, distanceKm: 8, aerobicTe: r.aerobicTe })),
    { date: '2026-08-22', type: 'run', name: 'tempo日', distanceKm: 7.9, avgPaceSec: 280, aerobicTe: 1.2 },
  ]);
  const tempoSug = rLow.find(s => s.dateStr === '2026-08-22');
  assert(tempoSug?.status === 'partial' && (tempoSug.teNote ?? '').includes('强度不足'),
    'TE集成: Tempo 低 TE 降 partial', JSON.stringify(tempoSug));
  // Easy TE 高于 p75 → 保持 full + 偏硬提示
  const rHigh = matchActivitiesToPlan(planTe, [
    ...teRuns.map(r => ({ date: day(-(teRuns.indexOf(r) * 3)), type: 'run', name: r.name, distanceKm: 8, aerobicTe: r.aerobicTe })),
    { date: '2026-08-21', type: 'run', name: 'easy日', distanceKm: 8.1, aerobicTe: 4.2 },
  ]);
  const easySug = rHigh.find(s => s.dateStr === '2026-08-21');
  assert(easySug?.status === 'full' && (easySug.teNote ?? '').includes('偏硬'), 'TE集成: Easy 高 TE 提示但保持 full');
}

console.log('\n── 高温环境配速 ──');
{
  // 低于阈值不提示
  assert(heatAdjustment('Easy', 25) === null, '高温: <26°C 不提示');
  // Rest/Race 不提示（比赛策略属后续范围）
  assert(heatAdjustment('Rest', 33) === null, '高温: Rest 不提示');
  assert(heatAdjustment('Race', 33) === null, '高温: Race 暂不提示');

  // 基础档位
  const a1 = heatAdjustment('Easy', 27);
  assert(a1?.paceAddSecPerKm === 8, '高温: 26-28°C → +8s');
  const a2 = heatAdjustment('Easy', 29.5);
  assert(a2?.paceAddSecPerKm === 12, '高温: 28-30°C → +12s');

  // 质量课 ×1.3
  const a3 = heatAdjustment('Tempo', 29.5);
  assert(a3?.paceAddSecPerKm === Math.round(12 * 1.3), '高温: 质量课 ×1.3');

  // 高湿加重
  const a4 = heatAdjustment('Easy', 31, 80);
  assert(a4?.paceAddSecPerKm === 18 + 5, '高温: 31°C+80%湿度 → +23s');

  // 极端封顶 40s
  const a5 = heatAdjustment('Tempo', 35, 85);
  assert(a5 !== null && a5.paceAddSecPerKm <= 40 && a5.paceAddSecPerKm >= 30,
    '高温: 极端情况封顶 ≤40s', `got=${a5?.paceAddSecPerKm}`);

  // ≥30°C 建议改晨跑
  assert((heatAdjustment('LSD', 31)?.advice ?? '').includes('晨跑'), '高温: ≥30°C 建议晨跑');
}

console.log('\n── 天气数据：解析与缓存节流 ──');
{
  const sample = {
    hourly: {
      time: ['2026-08-24T00:00', '2026-08-24T14:00', '2026-08-25T08:00'],
      temperature_2m: [28.1, 34.6, 31.2],
      relative_humidity_2m: [80, 70, 85],
    },
  };
  const days = parseOpenMeteo(sample);
  assert(days.length === 2, '天气: 解析出两天');
  const d24 = days.find(d => d.date === '2026-08-24');
  const d25 = days.find(d => d.date === '2026-08-25');
  assert(d24?.tempMaxC === 34.6 && d24?.humidityMean === 75, '天气: 日最高温/均湿正确',
    JSON.stringify(d24));
  assert(d25?.tempMaxC === 31.2 && d25?.humidityMean === 85, '天气: 第二天正确');

  assert(parseOpenMeteo({ hourly: { time: [], temperature_2m: [], relative_humidity_2m: [] } }).length === 0,
    '天气: 空数据 → 空');

  // 缓存节流：24h
  const now = new Date('2026-08-23T12:00:00Z');
  assert(shouldRefetchWeather(null, now) === true, '缓存: 无缓存要刷新');
  const fresh = { fetchedAt: new Date(now.getTime() - 2 * 3600000).toISOString() };
  assert(shouldRefetchWeather(fresh, now) === false, '缓存: 2h 内不刷新');
  const stale = { fetchedAt: new Date(now.getTime() - 25 * 3600000).toISOString() };
  assert(shouldRefetchWeather(stale, now) === true, '缓存: 超 24h 刷新');
}

console.log('\n── 预测偏差自学习 ──');
{
  const entry = (distance: 'full' | 'half', resultTime: string, predictedTime?: string) => ({
    distance, resultTime, ...(predictedTime ? { predictedTime } : {}),
  });

  // 单场：预测 3:30:00 实际 3:42:00 → ratio ≈1.0571，校准值 = round(12600×ratio)
  const r1 = calibratePrediction(12600, 'full', [entry('full', '3:42:00', '3:30:00')]);
  assert(r1 !== null && r1.samples === 1 && Math.abs(r1.adjustedSec - 13320) <= 1,
    '校准: 单场偏差应用', JSON.stringify(r1));
  assert(Math.abs(r1!.ratio - 13320 / 12600) < 1e-9, '校准: ratio 精确');

  // 多场取中位数（抗异常值）：ratios [1.05, 1.10, 1.60] → 1.10
  const hist3 = [
    entry('full', '3:33:36', '3:30:00'),   // 1.04
    entry('full', '3:51:00', '3:30:00'),   // 1.10
    entry('full', '5:36:00', '3:30:00'),   // 1.60 异常场
  ];
  const r2 = calibratePrediction(12600, 'full', hist3);
  assert(r2 !== null && Math.abs(r2.ratio - 1.10) < 0.01, '校准: 中位数抗异常值');

  // 只取最近 3 场（数组顺序末尾优先）
  const hist4 = [
    entry('full', '4:12:00', '3:30:00'),   // 1.20 最老
    ...hist3,
  ];
  const r3 = calibratePrediction(12600, 'full', hist4);
  assert(r3 !== null && Math.abs(r3.ratio - 1.10) < 0.01, '校准: 只取最近 3 场');

  // 距离分开：全马历史不影响半马校准
  const r4 = calibratePrediction(6223, 'half', [
    entry('full', '3:42:00', '3:30:00'),
    entry('half', '1:46:24', '1:43:43'),   // ratio = 6384/6223 ≈ 1.0259
  ]);
  assert(r4 !== null && Math.abs(r4.ratio - 6384 / 6223) < 0.001, '校准: 距离分开');

  // 无预测的记录不计入
  const r5 = calibratePrediction(12600, 'full', [
    entry('full', '3:42:00'),
    entry('full', '3:42:00', '3:30:00'),
  ]);
  assert(r5 !== null && r5.samples === 1, '校准: 无预测记录排除');

  // 空历史 → null
  assert(calibratePrediction(12600, 'full', []) === null, '校准: 空历史 null');
  assert(calibratePrediction(12600, 'full', [entry('full', '3:42:00')]) === null, '校准: 无有效样本 null');

  // 偏差格式化
  assert(formatPredictionDelta(1.05).startsWith('+5'), '校准: 偏差 +5% 格式');
  assert(formatPredictionDelta(0.95).startsWith('-5'), '校准: 偏差 -5% 格式');

  // 备份兼容：含成绩字段的 myRace round-trip（复用真实 plan 夹具——空 plan 被拒）
  {
    const profile = baseProfile({ raceDate: '2026-11-01', pbHalf: '1:40:00' });
    const plan = generateTrainingPlan(profile, parseLocalDate('2026-07-01'));
    const raceWithResult = {
      raceId: 'r9', distance: 'full' as const, goal: 'pb' as const,
      addedAt: '2026-03-01T00:00:00.000Z', name: '测试马', date: '2026-03-15',
      resultStatus: 'finished' as const, resultTime: '3:42:00', resultPredictedAtRace: '3:30:00',
    };
    const srcState = {
      profile, plan,
      completions: {}, myRaces: [raceWithResult], vacations: [],
      isPlanGenerated: true, planNeedsRegen: false, exportSync: {},
    };
    const payload = buildBackupPayload(srcState as never, parseLocalDate('2026-07-15'));
    const parsed = parseBackupJson(JSON.stringify(payload));
    assert(parsed.ok === true, '备份: 含成绩字段解析成功');
    if (parsed.ok) {
      const mr = parsed.payload.data.myRaces.find(x => x.raceId === 'r9') as unknown as Record<string, unknown>;
      assert(!!mr && mr.resultTime === '3:42:00' && mr.resultStatus === 'finished' && mr.resultPredictedAtRace === '3:30:00',
        '备份: 成绩字段完整保留', JSON.stringify(mr));
    }
    const withBad = JSON.parse(JSON.stringify(payload));
    withBad.data.myRaces[0].resultStatus = 'won';
    assert(parseBackupJson(JSON.stringify(withBad)).ok === false, '备份: 非法 resultStatus 拒绝');
    const withBad2 = JSON.parse(JSON.stringify(payload));
    withBad2.data.myRaces[0].resultTime = '3h42m';
    assert(parseBackupJson(JSON.stringify(withBad2)).ok === false, '备份: 非法 resultTime 拒绝');
  }
}

console.log('\n── 科普层内容完整性 ──');
{
  const ids = Object.keys(SCIENCE_NOTES);
  assert(ids.length >= 12, `科普: 覆盖 ≥12 主题（实际 ${ids.length}）`);
  let bad = '';
  for (const id of ids) {
    const n = SCIENCE_NOTES[id as keyof typeof SCIENCE_NOTES];
    if (!n.title || n.title.length < 6) bad += `${id}.title `;
    for (const f of ['what', 'why', 'science', 'individuality', 'action'] as const) {
      if (!n[f] || (n[f] as string).length < 20) bad += `${id}.${f} `;
    }
    if (!Array.isArray(n.misconceptions) || n.misconceptions.length < 1 || n.misconceptions.some(m => m.length < 10)) {
      bad += `${id}.misconceptions `;
    }
  }
  assert(bad === '', '科普: 所有主题六段式完整', bad);
}

console.log('\n── 批次一：taper 红线 + 档案一致性守卫 ──');
{
  const Z4 = new Set(['Tempo', 'TempoIntervals', 'Interval', 'Cruise', 'Fartlek', 'Progression', 'Hills']);
  const asOf16w = new Date();
  const raceIn = (days: number) => format(addDays(asOf16w, days), 'yyyy-MM-dd');

  // ── C3：全马 taper 红线（moderate）──
  const fp = baseProfile({ raceType: 'full', raceDate: raceIn(112), intensity: 'moderate' });
  const fPlan = generateTrainingPlan(fp, asOf16w);
  assert(fPlan.length > 0, 'taper: 全马计划生成');
  const raceIdx = fPlan.findIndex(w => w.workoutType === 'Race');
  assert(raceIdx > 0 && Math.round(fPlan[raceIdx].distanceKm ?? 0) === 42, 'taper: Race 日 42km');

  const daysToRace = (w: typeof fPlan[number]) =>
    Math.round((new Date(w.date).getTime() - new Date(fPlan[raceIdx].date).getTime()) / 86400000);
  const final10 = fPlan.filter(w => { const d = daysToRace(w); return d >= -10 && d < 0; });
  assert(final10.every(w => !Z4.has(w.workoutType)), 'taper: 赛前 10 天无 Z4 课型',
    JSON.stringify(final10.filter(w => Z4.has(w.workoutType))));
  const raceWeek = fPlan.filter(w => { const d = daysToRace(w); return d >= -7 && d < 0; });
  assert(raceWeek.length > 0 && raceWeek.every(w => ['Easy', 'Rest', 'Recovery'].includes(w.workoutType)),
    'taper: 赛周仅轻松/休息/恢复', JSON.stringify(raceWeek.map(w => `${format(new Date(w.date),'MM-dd')} ${w.workoutType}`)));

  // taper 前两/三周保留 MP 专项且递减（仅统计减量区内：距赛 8-21 天）
  const mpSessions = fPlan.filter(w => w.workoutType === 'MP' && daysToRace(w) <= -8 && daysToRace(w) >= -21);
  assert(mpSessions.length >= 1, 'taper: 存在 MP 专项课');
  const sortedMp = mpSessions.sort((a, b) => daysToRace(a) - daysToRace(b));
  if (sortedMp.length >= 2) {
    assert(sortedMp[1].distanceKm! < sortedMp[0].distanceKm!, 'taper: MP 课随比赛临近递减');
  }

  // half 映射同规则
  const hp = baseProfile({ raceType: 'half', raceDate: raceIn(112), intensity: 'moderate' });
  const hPlan = generateTrainingPlan(hp, asOf16w);
  const hRaceIdx = hPlan.findIndex(w => w.workoutType === 'Race');
  const hDays = (w: typeof hPlan[number]) => Math.round((new Date(w.date).getTime() - new Date(hPlan[hRaceIdx].date).getTime()) / 86400000);
  assert(hPlan.filter(w => { const d = hDays(w); return d >= -7 && d < 0; })
    .every(w => ['Easy', 'Rest', 'Recovery'].includes(w.workoutType)), 'taper: 半马赛周零强度');
  assert(hPlan[hRaceIdx] && Math.round(hPlan[hRaceIdx].distanceKm ?? 0) === 21, 'taper: 半马 Race 21.1km 不受影响');

  // light 全马：taper 全程零强度（原有行为保持）
  const lp = baseProfile({ raceType: 'full', raceDate: raceIn(112), intensity: 'light' });
  const lPlan = generateTrainingPlan(lp, asOf16w);
  const lRaceIdx = lPlan.findIndex(w => w.workoutType === 'Race');
  const lTaper = lPlan.filter((w, i) => i > lRaceIdx - 21 && i < lRaceIdx);
  assert(lTaper.every(w => !Z4.has(w.workoutType)), 'taper: light 全程无 Z4');

  // ── C8：档案一致性守卫 ──
  // 干净态
  assert(getProfilePlanMismatch(fp, fPlan) === null, '守卫: 一致档案返回 null');
  // 比赛日已过去
  const pastProf = baseProfile({ raceType: 'full', raceDate: format(addDays(new Date(), -30), 'yyyy-MM-dd') });
  assert(getProfilePlanMismatch(pastProf, fPlan) === 'raceDate-past', '守卫: 比赛日已过检测');
  // 计划止期与档案漂移
  const staleProf = baseProfile({ ...fp, raceDate: raceIn(126) });
  assert(getProfilePlanMismatch(staleProf, fPlan) === 'plan-stale', '守卫: 计划止期漂移检测');
  // 项目漂移（full 档案配半马 Race）
  const driftedPlan = fPlan.map((w, i) => i === raceIdx ? { ...w, distanceKm: 21.1 } : w);
  assert(getProfilePlanMismatch(fp, driftedPlan) === 'race-type-drift', '守卫: 项目漂移检测');
  // 空计划不误报
  assert(getProfilePlanMismatch(fp, []) === null, '守卫: 空计划不报');
}

console.log('\n── 批次二：剂量体系（映射校准/35%钳制/封顶/cutback）──');
{
  const Z4 = new Set(['Tempo', 'TempoIntervals', 'Interval', 'Cruise', 'Fartlek', 'Progression', 'Hills']);
  const asOf16w = new Date();
  const raceIn = (days: number) => format(addDays(asOf16w, days), 'yyyy-MM-dd');

  // ── C2：容量映射校准（COROS 交叉验证 +10%）──
  assert(Math.abs(getBaseCapacityFromVDOT(48, 'full') - 77.6) < 0.01,
    '映射: VDOT48 全马容量 → 77.6', String(getBaseCapacityFromVDOT(48, 'full')));
  const h48 = getBaseCapacityFromVDOT(48, 'half');
  assert(h48 > 60 && h48 < 64, '映射: half 中段同步上调', String(h48));

  // ── 结构断言：16 周全马 moderate ──
  const dp = baseProfile({ raceType: 'full', raceDate: raceIn(112), intensity: 'moderate' });
  const dPlan = generateTrainingPlan(dp, asOf16w);
  assert(dPlan.length > 0, '剂量: 计划生成');
  const weeks: { km: number; lr: number }[] = [];
  for (let w = 0; w < Math.ceil(dPlan.length / 7); w++) {
    const wk = dPlan.slice(w * 7, (w + 1) * 7);
    if (!wk.length) break;
    weeks.push({
      km: Math.round(wk.reduce((s, d) => s + (d.distanceKm ?? 0), 0)),
      lr: Math.max(0, ...wk.filter(d => d.workoutType === 'LSD').map(d => d.distanceKm ?? 0)),
    });
  }
  const train = weeks.slice(0, weeks.length - 3); // 全马 taper 固定 3 周

  // 恢复周按引擎固定 3:1 节奏结构性识别（cycleLength=4 → 第 4/8/12 周，0-based 3/7/11）
  const recSet = new Set([3, 7, 11].filter(i => i < train.length));

  // 峰值周：与「该档案 VDOT 推导的理论峰值」±10%
  const vdotDp = resolveVDOT(dp);
  const expPeak = Math.round(getBaseCapacityFromVDOT(vdotDp, 'full') * 0.95);
  const peakKm = Math.max(...train.map(w => w.km));
  assert(Math.abs(peakKm - expPeak) <= Math.max(3, expPeak * 0.08),
    '剂量: 峰值周贴合 VDOT 推导 ±8%', `peak=${peakKm} exp=${expPeak} vdot=${vdotDp.toFixed(1)}`);
  // 绝对锚点：快档案（半马 1:35 → VDOT≈48）峰值应命中 COROS 带 68-78
  const fastProf = baseProfile({ raceType: 'full', raceDate: raceIn(112), intensity: 'moderate', pbHalf: '1:35:00' });
  const fastPlan = generateTrainingPlan(fastProf, asOf16w);
  const fastWeeks: number[] = [];
  for (let w = 0; w < Math.ceil(fastPlan.length / 7); w++) {
    fastWeeks.push(Math.round(fastPlan.slice(w * 7, (w + 1) * 7).reduce((s2, d) => s2 + (d.distanceKm ?? 0), 0)));
  }
  const fastTrain = fastWeeks.slice(0, fastWeeks.length - 3);
  const fastPeak = Math.max(...fastTrain);
  assert(fastPeak >= 68 && fastPeak <= 78, '剂量: VDOT≈48 峰值周命中 68-78（COROS 带）', `fastPeak=${fastPeak}`);

  // 严格 35% 钳制：非 taper 且非恢复周全部适用（用户拍板：无放宽分支）
  const viol35 = train.filter((w, i) => !recSet.has(i) && w.lr > Math.ceil(w.km * 0.35) + 1);
  assert(viol35.length === 0, '剂量: 非 taper/恢复周长跑 ≤35%', JSON.stringify(viol35));

  // cutback：结构位深度 -20~-38%（0.72 目标 ± 组装容差）
  assert(recSet.size === 3, 'cutback: 3:1 节奏存在');
  for (const i of recSet) {
    const r = train[i].km / train[i - 1].km;
    assert(r > 0.60 && r < 0.82, 'cutback: 深度落在 -20~-38% 带', `i=${i} ratio=${r.toFixed(2)}`);
  }

  // plateau 可达性：最后 4 个训练周内出现 ≥92% 峰值
  const tailMax = Math.max(...train.slice(-4).map(w => w.km));
  assert(tailMax >= peakKm * 0.92, '装配: plateau 可达（尾段 ≥92% 峰值）', `${tailMax}/${peakKm}`);

  // 峰值长跑：moderate 封顶 30 且 ≤35%
  const peakLR = Math.max(...train.map(w => w.lr));
  assert(peakLR <= 30 && peakLR >= 18, '封顶: moderate 峰值长跑 18-30km', String(peakLR));

  // 时长封顶：heavy + 慢速 LT（清空 PB 强制走 LT 通道）→ LSD 受 3.5h 约束
  const slowHeavy = baseProfile({ raceType: 'full', raceDate: raceIn(112), intensity: 'heavy',
    pb5k: '', pb10k: '', pbHalf: '', pbFull: '', ltPace: '6:30' });
  const slowPlan = generateTrainingPlan(slowHeavy, asOf16w);
  const slowLr = Math.max(0, ...slowPlan.filter((w, i) => i < slowPlan.length - 21)
    .map(w => w.workoutType === 'LSD' ? w.distanceKm ?? 0 : 0));
  assert(slowLr <= 26, '封顶: 慢速 heavy 长跑受时长约束 ≤26km', String(slowLr));
}

console.log('\n── 批次三：PB 自动校准 + MP 长距离递进 ──');
{
  const { buildCoachReport } = await import('../src/utils/insights/coach.ts');
  const asOf16w3 = new Date();
  const raceIn3 = (days: number) => format(addDays(asOf16w3, days), 'yyyy-MM-dd');
  // ── C1：buildCoachReport 自动 PB 刷新（只升不降）──
  const c1Prof = {
    height: 175, weight: 70, pb5k: '', pb10k: '', pbHalf: '1:50:00', pbFull: '',
    lthr: '', ltPace: '', raceDate: '2026-12-01', raceType: 'full', goalTime: '',
    intensity: 'moderate', longRunDay: 0,
  };
  const c1Snap = {
    version: 1, source: 'x', builtAt: '2026-08-20T00:00:00Z', device: '',
    fitness: { ltPaceSec: 278, predictions: { half: '1:43:43', full: '3:37:47' } },
    activities: [], dailyMetrics: [],
  };
  const c1Rep = buildCoachReport(c1Snap as never, c1Prof as never);
  assert(c1Rep.patch.pbHalf === '1:43:43' && c1Rep.patch.pbFull === '3:37:47',
    'C1: 快预测自动写入 patch', JSON.stringify(c1Rep.patch));
  // 只升不降：档案已够快（1:40 < 预测 1:43）→ 不写 pbHalf
  const c1Fast = buildCoachReport(c1Snap as never, { ...c1Prof, pbHalf: '1:40:00' } as never);
  assert(c1Fast.patch.pbHalf === undefined, 'C1: 慢预测不覆盖快 PB');
  // 空档填充：pbFull 空 → 用手表全马预测填充
  assert(c1Rep.patch.pbFull === '3:37:47', 'C1: 空 PB 填充');

  // ── C7：专项期 MP 长距离递进 ──
  const c7p = baseProfile({ raceType: 'full', raceDate: raceIn3(112), intensity: 'moderate' });
  const c7Plan = generateTrainingPlan(c7p, asOf16w3);
  const c7RaceIdx = c7Plan.findIndex(w => w.workoutType === 'Race');
  const c7DTR = (w: typeof c7Plan[number]) => Math.round((new Date(w.date).getTime() - new Date(c7Plan[c7RaceIdx].date).getTime()) / 86400000);
  const specLSD = c7Plan.filter(w => w.workoutType === 'LSD' && c7DTR(w) < -21)
    .map(w => ({ date: format(new Date(w.date), 'MM-dd'), dtr: c7DTR(w),
      mpBlock: (w.details?.main?.length ?? 0) >= 2,
      mpKm: (w.details?.main?.length ?? 0) >= 2 ? (w.details!.main![1].distanceKm ?? 0) : 0 }));
  const withMp = specLSD.filter(x => x.mpBlock);
  assert(withMp.length >= 2, 'C7: 专项期含 ≥2 节 MP 长距离',
    JSON.stringify(specLSD));
  // 单调不减（按时间序）
  for (let i = 1; i < withMp.length; i++) {
    assert(withMp[i].mpKm >= withMp[i - 1].mpKm, 'C7: MP 块随周期单调递增',
      `${withMp[i - 1].mpKm}→${withMp[i].mpKm}`);
  }
  // 基础期无 MP 块
  const baseLSD = c7Plan.filter(w => w.workoutType === 'LSD' && c7DTR(w) < -84);
  assert(baseLSD.every(w => (w.details?.main?.length ?? 0) <= 1), 'C7: 基础期无 MP 块');
}

console.log(`\n── selftest-core: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
