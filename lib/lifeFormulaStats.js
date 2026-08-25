// lifeFormulaStats.js — aggregate metrics over life_formula_entries.
// Separate from lib/lifeFormula.js on purpose: that file computes ONE
// entry's own {score, state} at insert time; this file computes trends
// ACROSS entries, a different concern (single-row formula vs. multi-row
// aggregate), same way lib/goals-queries.js's per-goal derivation is
// separate from anything that will eventually aggregate across goals.
//
// Structure: movingAverage is a PURE function holding all the actual math,
// unit-testable without a DB — the same pure-logic/DB-orchestration split
// lib/recurrence.js already uses (expandOccurrences/reconcile vs.
// generateInstances).
import { supabase } from './supabaseClient';
import { calculateLifeFormula, classifyState } from './lifeFormula';
import { isoWeekToDate, monthKey, monthName } from './dates';

// Pure: given entries already ordered MOST-RECENT-FIRST by week, returns the
// `period`-week moving average of the most recent `period` entries' score
// field. Returns null (never 0, never a partial-set average) if fewer than
// `period` entries exist — per the ask, a partial window would silently
// understate an incomplete trend as if it were a real N-week reading.
// `period` defaults to 4 (the original single caller, dashboard's "4-week
// moving average" stat); the dashboard's 13-week (~3 month) series below
// reuses this same function instead of a second copy.
export function movingAverage(entriesMostRecentFirst, period = 4) {
  if (entriesMostRecentFirst.length < period) return null;
  const window = entriesMostRecentFirst.slice(0, period);
  const sum = window.reduce((total, entry) => total + Number(entry.score), 0);
  return sum / period;
}

// Pure: the SERIES version of movingAverage() above — a `period`-week moving
// average computed at EVERY week where one is defined (index period-1
// onward in an oldest-first list), not just the single most-recent value.
// This is what a moving-average line graph actually plots; the single-value
// function above is unchanged and still used wherever only the current
// reading matters (e.g. the "4-week moving average: X" stat). `period`
// defaults to 4, same as movingAverage().
export function movingAverageSeries(entriesOldestFirst, period = 4) {
  const series = [];
  for (let i = period - 1; i < entriesOldestFirst.length; i++) {
    const window = entriesOldestFirst.slice(i - period + 1, i + 1);
    const avg = window.reduce((sum, e) => sum + Number(e.score), 0) / period;
    series.push({ week_label: entriesOldestFirst[i].week_label, avg });
  }
  return series;
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
  const mostRecentFirst = [...entriesOldestFirst].reverse();
  const fourWeekAvg = movingAverage(mostRecentFirst);
  // 13 weeks ~= one calendar quarter — the dashboard's "3-month moving
  // average" is a weekly rolling window over ~13 entries, a different
  // concept from computeMonthlySummary()'s threeMonthAvg (a rolling
  // average of already-monthly-rolled-up averages, 3 MONTHS wide, not 13
  // WEEKS wide) — named thirteenWeekAvg specifically so the two aren't
  // confused with each other.
  const thirteenWeekAvg = movingAverage(mostRecentFirst, 13);

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
    thirteenWeekAvg,
    stateDistribution,
    trend: entriesOldestFirst.slice(-8), // last up to 8 weeks, chronological — Weekly Trend bars, unchanged
    // Widened to 52 weeks (a full year) per the ask for a full 52-week
    // x-axis on the moving-average/"momentum" chart specifically — this is
    // a SEPARATE window from `trend` above (that one stays at 8, it's the
    // Weekly Trend bar list, not part of this ask), empty array (not null)
    // when there aren't 4+ weeks yet, so the page can render "needs more
    // data" cleanly.
    movingAverageTrend: movingAverageSeries(entriesOldestFirst).slice(-52),
    // 13-week series over the same 52-week window — needs 13 real entries
    // before its first point exists, same "don't average a partial window"
    // rule as the 4-week series.
    movingAverageTrend13: movingAverageSeries(entriesOldestFirst, 13).slice(-52),
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
