/**
 * Minimal FIT workout file encoder.
 * Generates a single structured workout file compatible with Garmin Connect import.
 *
 * Spec reference: ANT+ FIT Protocol v2.0 + FIT SDK Profile (workout / workout_step messages)
 */

import type { DailyWorkout } from './training-engine';
import { format } from 'date-fns';
import { buildZip } from './zip';

// ─── CRC-16 (ANT+ FIT variant) ────────────────────────────────────────────────

const FIT_CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function fitCRC(data: Uint8Array, seed = 0): number {
  let crc = seed;
  for (const byte of data) {
    let tmp = FIT_CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc ^= tmp ^ FIT_CRC_TABLE[byte & 0xF];
    tmp = FIT_CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc ^= tmp ^ FIT_CRC_TABLE[(byte >> 4) & 0xF];
  }
  return crc;
}

// ─── Byte writer ──────────────────────────────────────────────────────────────

function u8(a: number[], v: number)  { a.push(v & 0xFF); }
function u16(a: number[], v: number) { a.push(v & 0xFF, (v >> 8) & 0xFF); }
function u32(a: number[], v: number) {
  a.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF);
}
function str(a: number[], s: string, len: number) {
  const enc = new TextEncoder().encode(s.slice(0, len - 1));
  for (let i = 0; i < len; i++) a.push(i < enc.length ? enc[i] : 0x00);
}

// ─── FIT constants ────────────────────────────────────────────────────────────

const BASE = { ENUM: 0x00, UINT8: 0x02, UINT16: 0x84, UINT32: 0x86, UINT32Z: 0x8C, STR: 0x07 };
const MESG = { FILE_ID: 0, WORKOUT: 26, STEP: 27 };

// FIT epoch: seconds from 1989-12-31 00:00:00 UTC
const FIT_EPOCH_OFFSET = Math.floor(new Date('1989-12-31T00:00:00Z').getTime() / 1000);
const fitNow = () => Math.floor(Date.now() / 1000) - FIT_EPOCH_OFFSET;

// ─── Definition message writer ────────────────────────────────────────────────

type FieldDef = [fieldNum: number, byteSize: number, baseType: number];

function writeDef(out: number[], localType: number, mesgNum: number, fields: FieldDef[]) {
  u8(out, 0x40 | localType); // definition header
  u8(out, 0x00);              // reserved
  u8(out, 0x00);              // architecture: little-endian
  u16(out, mesgNum);
  u8(out, fields.length);
  for (const [fn, sz, bt] of fields) { u8(out, fn); u8(out, sz); u8(out, bt); }
}

// ─── Pace parsing ─────────────────────────────────────────────────────────────

/**
 * Convert a pace string like "5'30"" to speed in mm/s (= m/s × 1000).
 * FIT target speed scale: 1000 = 1 m/s.
 */
function paceToMmps(pace: string): number {
  const m = pace.match(/(\d+)[^\d](\d+)/);
  if (!m) return 0;
  const totalSec = parseInt(m[1]) * 60 + parseInt(m[2]);
  if (totalSec === 0) return 0;
  return Math.round((1000 / totalSec) * 1000); // mm/s
}

/**
 * Parse a targetPace string (range or single) → { low, high } in mm/s.
 * Slower pace = lower speed, faster pace = higher speed.
 */
function parsePaceRange(targetPace?: string): { low: number; high: number } {
  if (!targetPace) return { low: 0, high: 0xFFFFFFFF };
  // Strip leading > / < indicators
  const clean = targetPace.replace(/^[<>]\s*/, '');
  const parts = clean.split('-');
  if (parts.length >= 2) {
    const a = paceToMmps(parts[0].trim());
    const b = paceToMmps(parts[1].trim());
    if (a && b) return { low: Math.min(a, b), high: Math.max(a, b) };
  }
  const spd = paceToMmps(clean);
  if (!spd) return { low: 0, high: 0xFFFFFFFF };
  const margin = Math.round(spd * 0.04);
  return { low: spd - margin, high: spd + margin };
}

// ─── FIT workout step model ───────────────────────────────────────────────────

interface FITStep {
  name: string;       // max 15 chars + null
  notes: string;      // max 49 chars + null
  intensity: number;  // 0=active 1=rest 2=warmup 3=cooldown
  durType: number;    // 0=time(ms) 1=distance(cm) 5=open
  durValue: number;
  tgtType: number;    // 0=speed 1=hr 2=open
  tgtLow: number;
  tgtHigh: number;
}

// ─── DailyWorkout → FIT steps ─────────────────────────────────────────────────

const TYPE_EN: Record<string, string> = {
  LSD: 'Long Run', Tempo: 'Tempo', TempoIntervals: 'Tempo Int',
  Interval: 'Interval', Fartlek: 'Fartlek', Hills: 'Hill Reps',
  Progression: 'Progression', Cruise: 'Cruise Int', Easy: 'Easy Run',
  Recovery: 'Recovery', MP: 'MP Run', Race: 'Race',
};

function segStep(params: {
  name: string; notes?: string; intensity: number;
  distKm?: number; durMins?: number; pace?: string; restStr?: string;
}): FITStep {
  const { low, high } = parsePaceRange(params.pace);
  const hasPace = low > 0 && high < 0xFFFFFFFF;
  const distCm = params.distKm ? Math.round(params.distKm * 100000) : 0;
  const timMs  = params.durMins ? Math.round(params.durMins * 60000) : 0;
  return {
    name:      params.name.slice(0, 15),
    notes:     (params.notes ?? '').slice(0, 49),
    intensity: params.intensity,
    durType:   distCm > 0 ? 1 : timMs > 0 ? 0 : 5,
    durValue:  distCm > 0 ? distCm : timMs > 0 ? timMs : 0,
    tgtType:   hasPace ? 0 : 2,
    tgtLow:    hasPace ? low  : 0,
    tgtHigh:   hasPace ? high : 0xFFFFFFFF,
  };
}

function restStep(restStr: string): FITStep {
  const m = restStr.match(/(\d+(?:\.\d+)?)\s*(min|s)?/i);
  let secs = 90;
  if (m) {
    const val = parseFloat(m[1]);
    secs = m[2]?.toLowerCase() === 's' ? val : val * 60;
  }
  return {
    name: 'Recovery', notes: `Rest: ${restStr}`,
    intensity: 1, durType: 0, durValue: Math.round(secs * 1000),
    tgtType: 2, tgtLow: 0, tgtHigh: 0xFFFFFFFF,
  };
}

function workoutToSteps(w: DailyWorkout): FITStep[] {
  const steps: FITStep[] = [];

  if (w.details) {
    if (w.details.warmup) {
      const s = w.details.warmup;
      steps.push(segStep({ name: 'Warm Up', notes: s.description, intensity: 2, distKm: s.distanceKm, durMins: s.durationMins, pace: s.pace }));
    }
    for (const seg of w.details.main) {
      const reps = Math.min(seg.reps ?? 1, 30);
      const hasRest = reps > 1 && !!seg.rest;
      for (let r = 0; r < reps; r++) {
        steps.push(segStep({ name: seg.name, notes: seg.description, intensity: 0, distKm: seg.distanceKm, durMins: seg.durationMins, pace: seg.pace }));
        if (hasRest && r < reps - 1) steps.push(restStep(seg.rest!));
      }
    }
    if (w.details.cooldown) {
      const s = w.details.cooldown;
      steps.push(segStep({ name: 'Cool Down', notes: s.description, intensity: 3, distKm: s.distanceKm, durMins: s.durationMins, pace: s.pace }));
    }
  } else {
    // Fallback: single open step for the whole workout
    const { low, high } = parsePaceRange(w.targetPace);
    const hasPace = low > 0;
    steps.push({
      name:      (TYPE_EN[w.workoutType] ?? w.workoutType).slice(0, 15),
      notes:     w.description.slice(0, 49),
      intensity: 0,
      durType:   w.distanceKm ? 1 : 5,
      durValue:  w.distanceKm ? Math.round(w.distanceKm * 100000) : 0,
      tgtType:   hasPace ? 0 : 2,
      tgtLow:    hasPace ? low  : 0,
      tgtHigh:   hasPace ? high : 0xFFFFFFFF,
    });
  }

  return steps;
}

// ─── FIT file encoder ─────────────────────────────────────────────────────────

const WKT_NAME_LEN  = 16;
const STEP_NAME_LEN = 16;
const NOTES_LEN     = 50;

export function encodeFIT(w: DailyWorkout): Uint8Array {
  const steps = workoutToSteps(w);
  const wktName = `${TYPE_EN[w.workoutType] ?? w.workoutType}${w.distanceKm ? ' ' + w.distanceKm + 'k' : ''}`;
  const records: number[] = [];

  // ── Local msg 0: file_id ──────────────────────────────────────────────────
  writeDef(records, 0, MESG.FILE_ID, [
    [0, 1, BASE.ENUM],    // type
    [1, 2, BASE.UINT16],  // manufacturer
    [2, 2, BASE.UINT16],  // product
    [3, 4, BASE.UINT32Z], // serial_number
    [4, 4, BASE.UINT32],  // time_created
  ]);
  u8(records, 0x00);       // data header: local type 0
  u8(records, 5);          // type = workout
  u16(records, 255);       // manufacturer = development
  u16(records, 1);         // product = 1
  u32(records, 0);         // serial_number = 0
  u32(records, fitNow());  // time_created

  // ── Local msg 1: workout ──────────────────────────────────────────────────
  writeDef(records, 1, MESG.WORKOUT, [
    [4,  1,            BASE.ENUM],   // sport
    [6,  2,            BASE.UINT16], // num_valid_steps
    [7,  WKT_NAME_LEN, BASE.STR],   // wkt_name
    [11, 1,            BASE.ENUM],   // sub_sport
  ]);
  u8(records, 0x01);                      // data header: local type 1
  u8(records, 1);                         // sport = running
  u16(records, steps.length);             // num_valid_steps
  str(records, wktName, WKT_NAME_LEN);    // wkt_name
  u8(records, 0);                         // sub_sport = generic

  // ── Local msg 2: workout_step ─────────────────────────────────────────────
  writeDef(records, 2, MESG.STEP, [
    [253, 2,            BASE.UINT16], // message_index
    [0,   STEP_NAME_LEN, BASE.STR],  // wkt_step_name
    [1,   NOTES_LEN,    BASE.STR],   // notes
    [3,   1,            BASE.ENUM],  // intensity
    [4,   1,            BASE.ENUM],  // duration_type
    [5,   4,            BASE.UINT32],// duration_value
    [6,   1,            BASE.ENUM],  // target_type
    [7,   4,            BASE.UINT32],// target_value (invalid)
    [8,   4,            BASE.UINT32],// target_value_low
    [9,   4,            BASE.UINT32],// target_value_high
  ]);

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    u8(records, 0x02);                   // data header: local type 2
    u16(records, i);                      // message_index
    str(records, s.name, STEP_NAME_LEN); // wkt_step_name
    str(records, s.notes, NOTES_LEN);    // notes
    u8(records, s.intensity);
    u8(records, s.durType);
    u32(records, s.durValue);
    u8(records, s.tgtType);
    u32(records, 0xFFFFFFFF);            // target_value = invalid
    u32(records, s.tgtLow);
    u32(records, s.tgtHigh);
  }

  // ── Assemble file ─────────────────────────────────────────────────────────
  const dataBytes = new Uint8Array(records);

  // Header (14 bytes)
  const hdr: number[] = [];
  u8(hdr, 14);                  // header size
  u8(hdr, 0x20);                // protocol version 2.0
  u16(hdr, 2132);               // profile version
  u32(hdr, dataBytes.length);   // data size
  // ".FIT"
  [0x2E, 0x46, 0x49, 0x54].forEach(b => u8(hdr, b));
  const hdrArr = new Uint8Array(hdr);
  const hdrCRC = fitCRC(hdrArr);
  u16(hdr, hdrCRC);

  const hdrBytes = new Uint8Array(hdr);
  let fileCRC = fitCRC(hdrBytes);
  fileCRC = fitCRC(dataBytes, fileCRC);

  const total = new Uint8Array(hdrBytes.length + dataBytes.length + 2);
  total.set(hdrBytes);
  total.set(dataBytes, hdrBytes.length);
  total[hdrBytes.length + dataBytes.length]     = fileCRC & 0xFF;
  total[hdrBytes.length + dataBytes.length + 1] = (fileCRC >> 8) & 0xFF;

  return total;
}

// ─── Download helpers ─────────────────────────────────────────────────────────

/** Download a single .fit file for one workout (kept for internal use). */
export function downloadFIT(workout: DailyWorkout): void {
  const bytes = encodeFIT(workout);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${format(new Date(workout.date), 'yyyy-MM-dd')}-${workout.workoutType}.fit`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download all non-Rest workouts as a ZIP of .fit files. */
export function downloadAllFIT(plan: DailyWorkout[], zipName = 'garmin-workouts.zip'): void {
  const entries = plan
    .filter(w => w.workoutType !== 'Rest')
    .map(w => ({
      name: `${format(new Date(w.date), 'yyyy-MM-dd')}-${w.workoutType}.fit`,
      data: encodeFIT(w),
    }));

  const zip = buildZip(entries);
  const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
