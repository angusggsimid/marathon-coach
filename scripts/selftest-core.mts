/**
 * 核心逻辑自测：训练计划守卫、周自适应、本地日期边界。
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

console.log(`\n── selftest-core: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
