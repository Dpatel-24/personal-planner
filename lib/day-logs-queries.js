// day-logs-queries.js — data access for the `day_logs` table (Life tab).
// Deliberately fully independent: no joins, no foreign keys, no references
// to task_templates/task_instances/goals/life_formula_entries anywhere in
// this file or the table itself — per the ask, this feature shares nothing
// with the rest of the app. Same plain-functions-over-the-browser-client
// convention as every other lib/*.js module (lib/data.js, lib/tag-queries.js,
// lib/goals-queries.js).
import { supabase } from './supabaseClient';

// 'YYYY-MM-DD' for a Date, local calendar (not UTC) — same reasoning as
// lib/dates.js's own todayStr()/addDays(), kept as a local copy here rather
// than importing from there specifically to keep this module's "no shared
// data, no cross-references" independence real at the file-dependency level
// too, not just the database level.
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Every logged day within `year` — a plain range query on log_date, mapped
// to a {['YYYY-MM-DD']: sentiment} lookup so the grid can check each of its
// 365 dates in O(1). A date with no key is genuinely unlogged (never a
// stored 'unlogged' sentiment value) — same "absence is the source of
// truth" contract the table's own check constraint enforces.
export async function getSentimentsForYear(year, client = supabase) {
  const { data, error } = await client
    .from('day_logs')
    .select('log_date, sentiment')
    .gte('log_date', `${year}-01-01`)
    .lte('log_date', `${year}-12-31`);
  if (error) throw error;
  const byDate = {};
  for (const row of data ?? []) {
    byDate[row.log_date] = row.sentiment;
  }
  return byDate;
}

// Upsert-on-log_date — log_date's own unique constraint is what makes this
// safe to call for a date that may or may not already have a row, single
// round trip either way.
export async function upsertDayLog(dateStr, sentiment, client = supabase) {
  const { error } = await client
    .from('day_logs')
    .upsert({ log_date: dateStr, sentiment, updated_at: new Date().toISOString() }, { onConflict: 'log_date' });
  if (error) throw error;
}

// Cycling back to "unlogged" deletes the row entirely — per the ask, absence
// of a row is the only valid representation of unlogged, never a stored
// 'unlogged' sentiment (the check constraint wouldn't even allow that
// value).
export async function deleteDayLog(dateStr, client = supabase) {
  const { error } = await client.from('day_logs').delete().eq('log_date', dateStr);
  if (error) throw error;
}

export { toDateStr };
