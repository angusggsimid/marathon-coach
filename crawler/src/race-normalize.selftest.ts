/**
 * Race normalize selftest.
 * 运行：cd crawler && npx tsx src/race-normalize.selftest.ts
 */
import {
  canonicalRaceName,
  dedupKey,
  dedupRaces,
  evaluateDateQuality,
  correctRaceStatus,
  publishNormalize,
  distancesCompatible,
  localDateKey,
} from './race-normalize.js';
import type { RaceEvent } from './types.js';

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

function race(partial: Partial<RaceEvent> & Pick<RaceEvent, 'id' | 'name' | 'date'>): RaceEvent {
  return {
    city: '贵阳',
    province: '贵州',
    distances: ['half'],
    terrain: 'hilly',
    label: null,
    status: 'upcoming',
    _source: 'zuicool',
    ...partial,
  };
}

console.log('\n── race-normalize ──');

{
  assert(
    canonicalRaceName('2026 贵州·镇宁黄果树半程马拉松') === '贵州镇宁黄果树半程马拉松',
    'huangguoshu alias',
  );
  assert(
    dedupKey(race({ id: 'a', name: '2026 太湖—号公路跑', date: '2026-05-01' })) ===
      dedupKey(race({ id: 'b', name: '太湖1号公路跑', date: '2026-05-15' })),
    'dash/digit + month key',
  );
}

{
  const bad = race({
    id: 'mb-bad',
    name: '2026某某马拉松',
    date: '2008-01-01',
  });
  const dq = evaluateDateQuality(bad, new Date('2026-07-01'));
  assert(!dq.ok && dq.issues.includes('name-year-conflict'), 'name/year conflict rejected');
}

{
  const oldYear = race({ id: 'y', name: '历史赛事', date: '1980-05-01' });
  const dq = evaluateDateQuality(oldYear, new Date('2026-07-01'));
  assert(!dq.ok && dq.issues.includes('impossible-year'), 'impossible year rejected');
}

{
  // Local date key vs UTC trap: simulate evening in +8 (still same local day)
  const asOf = new Date(2026, 6, 13, 23, 30, 0); // local Jul 13 23:30
  assert(localDateKey(asOf) === '2026-07-13', 'localDateKey evening local');
  const pastOpen = race({
    id: 'p',
    name: '已过期但仍 open',
    date: '2026-07-01',
    status: 'open',
  });
  const fixed = correctRaceStatus(pastOpen, asOf);
  assert(fixed.status === 'closed', 'past open → closed by local day');
}

{
  const a = race({
    id: '1',
    name: '2026上海国际马拉松',
    date: '2026-11-01',
    city: '上海',
    province: '上海',
    distances: ['full'],
    _source: 'zuicool',
    sources: ['zuicool'],
  });
  const b = race({
    id: '2',
    name: '上海国际马拉松（官方）',
    date: '2026-11-01',
    city: '上海',
    province: '上海',
    distances: ['full', 'half'],
    status: 'open',
    _source: 'nowrun',
    sources: ['nowrun'],
  });
  const { races, duplicateReport } = dedupRaces([a, b]);
  assert(races.length === 1, 'same key deduped', `len=${races.length}`);
  assert(races[0].status === 'open', 'prefer open status');
  assert(
    (races[0].sources ?? []).includes('nowrun') && (races[0].sources ?? []).includes('zuicool'),
    'sources merged',
  );
  assert(duplicateReport.some(e => e.type === 'key-dedup'), 'report key-dedup');
}

{
  // Near merge: same city+date, high name overlap, compatible distances
  const a = race({
    id: 'n1',
    name: '厦门马拉松赛',
    date: '2026-01-04',
    city: '厦门',
    province: '福建',
    distances: ['full'],
    _source: 'zuicool',
  });
  const b = race({
    id: 'n2',
    name: '厦门马拉松',
    date: '2026-01-04',
    city: '厦门',
    province: '福建',
    distances: ['full'],
    _source: 'nowrun',
  });
  // Different canonical keys if months same but names differ enough after strip —
  // char overlap should still near-merge
  const { races, duplicateReport } = dedupRaces([a, b]);
  assert(races.length === 1, 'near-merge city+date', `len=${races.length} report=${duplicateReport.length}`);
}

{
  assert(distancesCompatible(['full'], ['full', 'half']) === true, 'subset distances compatible');
  assert(distancesCompatible(['full'], ['half']) === false, 'full vs half not compatible');
}

{
  const asOf = new Date(2026, 6, 13);
  const good = race({
    id: 'g',
    name: '2026杭州马拉松',
    date: '2026-11-08',
    status: 'upcoming',
    _source: 'zuicool',
  });
  const bad = race({
    id: 'b',
    name: '2026假数据',
    date: '2008-03-01',
    status: 'open',
  });
  const past = race({
    id: 'past',
    name: '2026已过',
    date: '2026-06-01',
    status: 'open',
  });
  const { races, dateRejected } = publishNormalize([good, bad, past], asOf);
  assert(dateRejected.length === 1 && dateRejected[0].race.id === 'b', 'date reject in publishNormalize');
  assert(races.some(r => r.id === 'g'), 'good kept');
  const pastOut = races.find(r => r.id === 'past');
  assert(pastOut?.status === 'closed', 'past open corrected in pipeline');
}

// 源站复用同一 ID 给不同赛事 → 发布结果 id 必须唯一
{
  const asOf = new Date(2026, 6, 13);
  const a = race({
    id: 'zc-31836',
    name: '2025玉溪抚仙湖半程马拉松',
    date: '2025-12-14',
    city: '玉溪',
    status: 'closed',
    _source: 'zuicool-events',
  });
  const b = race({
    id: 'zc-31836',
    name: '青创杯·2026龙口马拉松暨山东省马拉松联赛（龙口站）',
    date: '2026-10-18',
    city: '烟台',
    status: 'open',
    _source: 'zuicool',
  });
  const { races, duplicateReport } = publishNormalize([a, b], asOf);
  assert(races.length === 2, 'both distinct events kept');
  const ids = races.map(r => r.id);
  assert(new Set(ids).size === 2, 'ids unique after collision fix');
  assert(ids.includes('zc-31836'), 'first id preserved');
  assert(ids.some(id => id.startsWith('zc-31836-')), 'second id reassigned with date suffix');
  assert(
    duplicateReport.some(e => e.type === 'id-collision'),
    'id-collision reported',
  );
}

console.log(`\n── race-normalize selftest: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
