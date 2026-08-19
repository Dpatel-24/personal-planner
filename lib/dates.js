// dates.js — view-side date helpers. The recurrence engine works in UTC on
// stored 'date' columns; views deal in the user's LOCAL calendar day (what
// "today" means to a person). Keep these concerns separate.

// Local calendar date as 'YYYY-MM-DD'.
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' -> e.g. "Sun, Jul 12". Parsed as a local date (no TZ shift).
// Returns "Inbox" for null (unscheduled tasks).
export function humanDate(dateStr) {
  if (!dateStr) return 'Inbox';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Shift a 'YYYY-MM-DD' string by n days (local calendar), returning 'YYYY-MM-DD'.
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Current ISO-8601 week label, e.g. '2026-W34' — the format
// life_formula_entries.week_label expects (fixed-width, zero-padded, so it
// also sorts correctly as plain text — see lib/lifeFormulaStats.js). Standard
// ISO week algorithm: shift to that week's Thursday, then the Thursday's
// year and week-of-year are always correct even across a Dec/Jan boundary.
export function isoWeekLabel(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sun=0 -> 7, so Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Reverse of isoWeekLabel() — a week label like '2026-W34' back to a
// representative Date, for grouping weekly entries into calendar months (a
// week can straddle two months, so this needs one consistent anchor day per
// week, not "whichever month the week happens to start/end in"). Uses the
// SAME Thursday-of-the-week anchor isoWeekLabel() computes forward from —
// Jan 4 is always in ISO week 1 by definition, so that pins week 1's Monday,
// then (week-1)*7 + 3 days lands on the target week's Thursday.
export function isoWeekToDate(weekLabel) {
  const [yearStr, weekStr] = weekLabel.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const targetThursday = new Date(week1Monday);
  targetThursday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + 3);
  return targetThursday;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Date -> 'YYYY-MM' grouping key (sortable as plain text, same reasoning as
// week_label's own fixed-width format).
export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' -> 'January' (year dropped — the monthly log groups within one
// year at a time, matching the spreadsheet reference this was modeled on).
export function monthName(key) {
  const [, m] = key.split('-');
  return MONTH_NAMES[Number(m) - 1];
}
