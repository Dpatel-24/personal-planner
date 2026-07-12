// rrulePresets.js — build/describe RRULE strings from friendly presets so the
// UI never has to hand-type RFC-5545. Presets only (daily/weekly/biweekly/
// monthly); the recurrence engine still does all the actual date expansion.
import { RRule } from 'rrule';

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export const FREQUENCIES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Biweekly' },
  { key: 'monthly', label: 'Monthly' },
];

// RRULE weekday code ('MO', 'TU', …) for a 'YYYY-MM-DD' date.
export function weekdayCode(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_CODES[new Date(y, m - 1, d).getDay()];
}

// Day-of-month (1–31) for a 'YYYY-MM-DD' date.
export function monthDay(dateStr) {
  return Number(dateStr.split('-')[2]);
}

// Build an RRULE string. weekly/biweekly default to the start date's weekday
// unless `weekdays` (array of codes) is given; monthly uses the start day-of-month.
export function buildRRule(freq, { startDate, weekdays } = {}) {
  switch (freq) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly': {
      const days = (weekdays?.length ? weekdays : [weekdayCode(startDate)]).join(',');
      return `FREQ=WEEKLY;BYDAY=${days}`;
    }
    case 'biweekly': {
      const days = (weekdays?.length ? weekdays : [weekdayCode(startDate)]).join(',');
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${days}`;
    }
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${monthDay(startDate)}`;
    default:
      throw new Error(`Unknown frequency: ${freq}`);
  }
}

// Human-readable description, e.g. "every week on Monday". Falls back to the raw
// string if rrule can't parse it.
export function describeRRule(ruleStr) {
  try {
    return new RRule(RRule.parseString(ruleStr)).toText();
  } catch {
    return ruleStr;
  }
}
