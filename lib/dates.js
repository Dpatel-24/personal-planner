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
export function humanDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
