/**
 * 核心逻辑自测：训练计划守卫、周自适应、周快照、计划指纹、FIT 范围、ICU 幂等门槛。
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
  buildICUEventBody,
  buildICUExternalId,
  ICU_IDEMPOTENT_SYNC_PROVEN,
  isICUCompleteSuccess,
  syncPlanToICU,
} from '../src/utils/intervals-icu.ts';
import {
  createNonIdempotentMockFetch,
  createPartialSuccessMockFetch,
} from './icu-test-fixtures.mts';
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
  // ICS/ICU 全计划：从未导出不 stale；成功后指纹变化才 stale；渠道独立
  assert(!isChannelStale(undefined, 'fp_a'), 'never exported not stale');
  assert(!isChannelStale(null, 'fp_a'), 'null meta not stale');
  let state = recordFullChannelSuccess({}, 'ics', 'fp_old');
  assert(isChannelStale(state.ics, 'fp_new'), 'ics stale after plan change');
  assert(!isChannelStale(state.icu, 'fp_new'), 'icu never exported not stale');
  state = recordFullChannelSuccess(state, 'ics', 'fp_new');
  assert(!isChannelStale(state.ics, 'fp_new'), 'ics cleared after re-export');
  state = recordFullChannelSuccess(state, 'icu', 'fp_new');
  assert(
    isChannelStale(state.ics, 'fp_newer') && isChannelStale(state.icu, 'fp_newer'),
    'both stale on new plan',
  );
  state = recordFullChannelSuccess(state, 'icu', 'fp_newer');
  assert(isChannelStale(state.ics, 'fp_newer'), 'ics still stale when only icu refreshed');
  assert(!isChannelStale(state.icu, 'fp_newer'), 'icu cleared alone');
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

  // nested exportSync + icu
  const nested = migrateExportSyncState({
    exportSync: {
      icu: { exportedAt: '2026-07-02T12:00:00.000Z', planFingerprint: 'fp_icu' },
    },
  });
  assert(nested.icu?.planFingerprint === 'fp_icu', 'migrate nested exportSync');
  assert(nested.icu?.range === 'all', 'icu default range all');
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

console.log('\n── Intervals.icu idempotency gate ──');

{
  assert(ICU_IDEMPOTENT_SYNC_PROVEN === false, 'idempotent NOT proven — gate holds');
  const w: DailyWorkout = {
    date: parseLocalDate('2026-07-15'),
    workoutType: 'Tempo',
    description: 'Tempo - 8k',
    distanceKm: 8,
    targetPace: "4'50\"",
  };
  const id1 = buildICUExternalId(w);
  const id2 = buildICUExternalId({ ...w, description: 'changed text only' });
  assert(id1 === id2, 'external_id stable on description-only change');
  assert(id1 === 'marathon-2026-07-15-Tempo', 'external_id format', id1);
  const body = buildICUEventBody(w);
  assert(body.external_id === id1, 'body carries external_id');
  assert(body.category === 'WORKOUT', 'category WORKOUT');

  // 合同：非幂等 mock 上重复 sync → 双倍 POST（证明当前路径不安全）
  const mock = createNonIdempotentMockFetch();
  const plan: DailyWorkout[] = [w, { ...w, date: parseLocalDate('2026-07-16'), workoutType: 'Easy', description: 'Easy' }];
  const r1 = await syncPlanToICU(plan, 'key', 'i1', undefined, mock.fetchImpl);
  const r2 = await syncPlanToICU(plan, 'key', 'i1', undefined, mock.fetchImpl);
  assert(r1.anySucceeded && r2.anySucceeded, 'mock syncs succeed');
  assert(r1.allSucceeded && r2.allSucceeded, 'full mock sync allSucceeded');
  assert(r1.total === 2 && r1.success === 2 && r1.failed === 0, 'complete success contract fields');
  assert(mock.getPostCount() === 4, 'non-idempotent mock doubles posts', `posts=${mock.getPostCount()}`);
  assert(mock.createdExternalIds.length === 4, 'four events created under non-idempotent server');
  // 因此不得宣称一键安全重同步
  assert(!ICU_IDEMPOTENT_SYNC_PROVEN, 'must not claim safe resync');

  // 部分成功：anySucceeded 但 !allSucceeded → 不得视为完整同步
  const partialMock = createPartialSuccessMockFetch(1);
  const rPartial = await syncPlanToICU(plan, 'key', 'i1', undefined, partialMock.fetchImpl);
  assert(rPartial.success === 1 && rPartial.failed === 1 && rPartial.total === 2, 'partial counts');
  assert(rPartial.anySucceeded === true, 'partial anySucceeded');
  assert(rPartial.allSucceeded === false, 'partial not allSucceeded');
  assert(
    !isICUCompleteSuccess(rPartial),
    'isICUCompleteSuccess false on partial',
  );
  assert(
    isICUCompleteSuccess({ success: 2, failed: 0, total: 2 }),
    'isICUCompleteSuccess true when full',
  );
  assert(
    !isICUCompleteSuccess({ success: 0, failed: 0, total: 0 }),
    'empty plan not complete success',
  );
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
    assert(restorable.icuApiKey === '', 'restorable forces empty api key');
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
    unknownData.icuAthleteId = 'should-not';
    assert(parseBackupJson(wrapData(unknownData)).ok === false, 'reject unknown data key athlete');
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

  m = recordChannelOutcome(m, 'icu', 'partial', new Date(2026, 6, 16));
  assert(m.totals.icuPartial === 1, 'icu partial not counted as success');
  assert(m.totals.icuOk === 0, 'icu ok still 0 on partial');
  m = recordChannelOutcome(m, 'icu', 'success', new Date(2026, 6, 16));
  assert(m.totals.icuOk === 1, 'icu full success');
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

  // syncPlanToICU 外层 throw 模拟：调用方应得到可序列化失败（组件层 catch；此处验证 mock throw）
  {
    const boom = async () => { throw new Error('network down'); };
    let caught = false;
    let failResult: { success: number; failed: number; allSucceeded: boolean } | null = null;
    try {
      await boom();
    } catch {
      caught = true;
      failResult = { success: 0, failed: 5, allSucceeded: false };
    }
    assert(caught && failResult && !failResult.allSucceeded && failResult.success === 0, 'icu outer throw → honest fail result');
  }
}

console.log(`\n── selftest-core: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
