/**
 * Mirrors src/data/races.ts — keep in sync with the main app.
 */

export type RaceDistance = 'full' | 'half';
export type RaceTerrain  = 'flat' | 'hilly' | 'mountain';
export type RaceLabel    = 'iaaf-gold' | 'iaaf-silver' | 'iaaf-bronze' | null;
export type RaceStatus   = 'open' | 'closed' | 'upcoming' | 'cancelled' | 'postponed';

export interface RaceEvent {
  id:               string;
  name:             string;
  date:             string;          // 'YYYY-MM-DD'
  city:             string;
  province:         string;
  distances:        RaceDistance[];
  terrain:          RaceTerrain;
  label:            RaceLabel;
  status:           RaceStatus;
  altitude?:        number;
  registrationUrl?: string;
  note?:            string;
  sources?:         string[];       // normalized source keys that confirmed this race
  _source?:         string;         // source key, stripped on final export
  _sourceId?:       string;         // original numeric ID from the source site
  _dateTBD?:        boolean;        // true when official date not yet announced ("待定")
}

export interface ScrapeResult {
  source:  string;
  count:   number;
  races:   RaceEvent[];
  errors:  string[];
}
