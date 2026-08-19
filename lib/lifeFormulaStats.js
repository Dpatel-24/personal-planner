// lifeFormulaStats.js — aggregate metrics over life_formula_entries.
// Separate from lib/lifeFormula.js on purpose: that file computes ONE
// entry's own {score, state} at insert time; this file computes trends
// ACROSS entries, a different concern (single-row formula vs. multi-row
// aggregate), same way lib/goals-queries.js's per-goal derivation is
// separate from anything that will eventually aggregate across goals.
//
// Structure: movingAverage is a PURE function holding all the actual math,
// unit-testable without a DB; getFourWeekMovingAverage just wires it to
// Supabase — the same pure-logic/DB-orchestration split lib/recurrence.js
// already uses (expandOccurrences/reconcile vs. generateInstances).
import { supabase } from './supabaseClient';

// Pure: given entries already ordered MOST-RECENT-FIRST by week, returns the
// 4-week moving average of the most recent 4 entries' score field. Returns
// null (never 0, never a partial-set average) if fewer than 4 entries exist
// — per the ask, a 3-entry average would silently understate an incomplete
// trend as if it were a real 4-week reading.
export function movingAverage(entriesMostRecentFirst) {
  if (entriesMostRecentFirst.length < 4) return null;
  const last4 = entriesMostRecentFirst.slice(0, 4);
  const sum = last4.reduce((total, entry) => total + Number(entry.score), 0);
  return sum / 4;
}

// Impure: fetches the most recent N entries ordered by week_label descending
// (ISO week strings like '2026-W34' sort correctly as plain text since
// they're fixed-width, zero-padded year+week) and hands them to the pure
// function above. N defaults to 4 — the minimum this needs — callers can
// pass more only if they want the same fetch to serve another purpose too.
// "Fewer than 4 entries exist total" is handled for free here: if the table
// has fewer than N rows, .limit(n) just returns however many exist, and
// movingAverage() returns null for anything under 4 without a separate
// COUNT query.
export async function getFourWeekMovingAverage(n = 4, client = supabase) {
  const { data, error } = await client
    .from('life_formula_entries')
    .select('week_label, score')
    .order('week_label', { ascending: false })
    .limit(n);
  if (error) throw error;
  return movingAverage(data ?? []);
}
