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
