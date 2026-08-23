// sprint-queries.js — data access for `week_sprints`: one free-text "focus"
// per calendar week (keyed by that week's Monday), shown as a small bar
// above the Board's week header. Independent of task_instances/templates —
// purely a label the user sets manually each week, never derived or
// auto-generated. One row per week, saved permanently (not overwritten with
// no history) — scrolling Prev on the board shows whatever focus was set for
// that earlier week, if any.
import { supabase } from './supabaseClient';

// weekStartStr: 'YYYY-MM-DD' for the week's Monday (lib/board-queries.js's
// getWeekDates()[0], formatted the same way every other date-keyed query in
// this app already is — plain Y/M/D string, never toISOString()).
export async function getWeekSprint(weekStartStr, client = supabase) {
  const { data, error } = await client
    .from('week_sprints')
    .select('*')
    .eq('week_start', weekStartStr)
    .maybeSingle();
  if (error) throw error;
  return data; // null if this week has never had a focus set — a real "no data" case, not an error
}

// All sprint rows whose week_start falls in [fromDateStr, toDateStr]
// (inclusive both ends) — the Calendar month grid's own "show sprint
// history" view (CalendarView.js) uses this to fetch every week-row's
// focus in one query instead of one round trip per visible week. Returns a
// plain { [week_start]: focus } map (empty-string focuses included — only
// a week with NO row at all is simply absent from the map), since the
// Calendar view only ever needs to look a week's own Monday up by key, not
// the full row shape getWeekSprint() returns.
export async function getWeekSprintsInRange(fromDateStr, toDateStr, client = supabase) {
  const { data, error } = await client
    .from('week_sprints')
    .select('week_start, focus')
    .gte('week_start', fromDateStr)
    .lte('week_start', toDateStr);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.week_start, row.focus]));
}

// Upsert by week_start (unique) — one row per week, this call is the only
// way any row in this table is ever created OR updated. Empty string is a
// valid, meaningful value (explicitly cleared), not treated as "delete the
// row" — keeps the read path simple (always either null-row or a real row
// with a focus string, never a tri-state of missing/empty/set to reason about).
export async function setWeekSprint(weekStartStr, focus, client = supabase) {
  const { data, error } = await client
    .from('week_sprints')
    .upsert({ week_start: weekStartStr, focus, updated_at: new Date().toISOString() }, { onConflict: 'week_start' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
