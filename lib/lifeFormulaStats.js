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
import { calculateLifeFormula, classifyState } from './lifeFormula';
import { isoWeekToDate, monthKey, monthName } from './dates';

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

// Pure: the SERIES version of movingAverage() above — a 4-week moving
// average computed at EVERY week where one is defined (index 3 onward in
// an oldest-first list), not just the single most-recent value. This is
// what a moving-average line graph actually plots; the single-value
// functions above are unchanged and still used wherever only the current
// reading matters (e.g. the "4-week moving average: X" stat).
export function movingAverageSeries(entriesOldestFirst) {
  const series = [];
  for (let i = 3; i < entriesOldestFirst.length; i++) {
    const window = entriesOldestFirst.slice(i - 3, i + 1);
    const avg = window.reduce((sum, e) => sum + Number(e.score), 0) / 4;
    series.push({ week_label: entriesOldestFirst[i].week_label, avg });
  }
  return series;
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

// Writes one entry: runs the 9 raw inputs through lib/lifeFormula.js's
// calculateLifeFormula() and stores score/state alongside them — computed
// and stored at insert time, never recalculated on read, per the
// life_formula_entries table's own design.
export async function createLifeFormulaEntry(weekLabel, inputs, client = supabase) {
  const { score, state } = calculateLifeFormula(inputs);
  const { data, error } = await client
    .from('life_formula_entries')
    .insert({ week_label: weekLabel, ...inputs, score, state })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Impure: every entry, ordered OLDEST-FIRST by week — the dashboard's one
// fetch, feeding every stat below plus the trend view, rather than a
// separate round trip per number.
export async function getAllLifeFormulaEntries(client = supabase) {
  const { data, error } = await client
    .from('life_formula_entries')
    .select('*')
    .order('week_label', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Pure: every dashboard number derived from the same oldest-first list.
// Returns null for zero entries — the page renders an explicit "no data
// yet" state for that, per the ask, never NaN/0 dressed up as a reading
// (Math.max() of an empty array is -Infinity; an empty-array average is
// 0/0 = NaN — both are exactly the silent-garbage failure mode to avoid).
export function computeDashboardStats(entriesOldestFirst) {
  if (entriesOldestFirst.length === 0) return null;

  const scores = entriesOldestFirst.map((e) => Number(e.score));
  const current = entriesOldestFirst[entriesOldestFirst.length - 1];
  const annualAverage = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const peakScore = Math.max(...scores);
  // movingAverage() expects most-recent-first — reuses the exact same pure
  // function this file already exports, over the entries already in hand,
  // rather than a second DB query for the same data in the other order.
  const fourWeekAvg = movingAverage([...entriesOldestFirst].reverse());

  // Purely additive — counts each state across every logged week (not just
  // the trend's last-8 slice), for the dashboard's "state distribution"
  // section. Doesn't touch any field above; every existing number here is
  // computed exactly as before.
  const stateDistribution = { Momentum: 0, Stability: 0, Friction: 0 };
  for (const e of entriesOldestFirst) {
    if (e.state in stateDistribution) stateDistribution[e.state] += 1;
  }

  return {
    currentScore: Number(current.score),
    currentState: current.state,
    currentWeek: current.week_label,
    annualAverage,
    peakScore,
    weeksLogged: entriesOldestFirst.length,
    fourWeekAvg,
    stateDistribution,
    trend: entriesOldestFirst.slice(-8), // last up to 8 weeks, chronological
    // Same trailing window as `trend` above, so the two line up on the same
    // set of weeks when shown together — empty array (not null) when there
    // aren't 4+ weeks yet, so the page can render "needs more data" cleanly.
    movingAverageTrend: movingAverageSeries(entriesOldestFirst).slice(-8),
  };
}

// Pure: rolls weekly entries up into a monthly log — no separate monthly
// data entry exists (deliberately: one source of truth, weekly logging
// only), so a month's L(t) is the average of that month's already-logged
// weekly scores, and its state is classifyState() applied to THAT average
// (reusing lib/lifeFormula.js's exact thresholds, not a second copy).
// "Which month" a week belongs to is resolved via isoWeekToDate() — a week
// can straddle two calendar months, so every week needs one consistent
// anchor day, not "whichever month it happens to start or end in".
// Returns null for zero entries, same empty-state contract as
// computeDashboardStats().
export function computeMonthlySummary(entriesOldestFirst) {
  if (entriesOldestFirst.length === 0) return null;

  const byMonth = new Map();
  for (const e of entriesOldestFirst) {
    const key = monthKey(isoWeekToDate(e.week_label));
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(e);
  }

  const months = Array.from(byMonth.keys())
    .sort()
    .map((key) => {
      const weekEntries = byMonth.get(key);
      const avgScore = weekEntries.reduce((sum, e) => sum + Number(e.score), 0) / weekEntries.length;
      return {
        monthKey: key,
        monthName: monthName(key),
        weeksLogged: weekEntries.length,
        avgScore,
        state: classifyState(avgScore),
      };
    });

  // 3-month moving average — same trailing-window shape as
  // movingAverageSeries() above, one level up (months instead of weeks).
  // null for the first two months, same "don't average a partial window"
  // rule as the weekly version.
  const monthsWithMA = months.map((m, i) => {
    if (i < 2) return { ...m, threeMonthAvg: null };
    const window = months.slice(i - 2, i + 1);
    const avg = window.reduce((sum, w) => sum + w.avgScore, 0) / 3;
    return { ...m, threeMonthAvg: avg };
  });

  const annualAverage = months.reduce((sum, m) => sum + m.avgScore, 0) / months.length;
  const peak = months.reduce((best, m) => (m.avgScore > best.avgScore ? m : best), months[0]);
  const lowest = months.reduce((worst, m) => (m.avgScore < worst.avgScore ? m : worst), months[0]);

  const monthsInState = { Momentum: 0, Stability: 0, Friction: 0 };
  for (const m of months) monthsInState[m.state] += 1;

  return {
    months: monthsWithMA,
    annualAverage,
    peakMonth: peak.monthName,
    lowestMonth: lowest.monthName,
    monthsInState,
  };
}
