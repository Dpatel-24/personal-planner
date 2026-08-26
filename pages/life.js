// pages/life.js — Life tab: a year-long daily-sentiment dot grid. Fully
// independent feature (own day_logs table, own query module) — no shared
// data or cross-references with Goals/Life Formula/the task planner, per
// the ask. No sidebar, same "top-level route, header + content only"
// pattern as pages/goals.js and pages/life-formula.js.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSentimentsForYear, upsertDayLog, deleteDayLog, toDateStr } from '@/lib/day-logs-queries';
import { space, font } from '@/lib/tokens';
import { buttonGhost, textMuted } from '@/lib/components';
import AppNav from '@/components/AppNav';
import PillTabs from '@/components/PillTabs';

// Palette locked to exactly these 6 values — no other color appears
// anywhere on this page.
const INK = '#1C1C1E';
const POSITIVE = '#1A6B47';
const NEUTRAL = '#B0AFA9';
const NEGATIVE = '#B93232';
const FUTURE = '#F4F4F4';
const UNLOGGED = '#ECECEC';

const YEARS = [2026, 2027];
const COLUMNS = 24;
const GAP = '7px';

// unlogged -> positive -> neutral -> negative -> unlogged, looping. `null`
// stands for unlogged (no row), matching the table's own "absence is the
// source of truth" contract.
const CYCLE = [null, 'positive', 'neutral', 'negative'];
function nextSentiment(current) {
  const i = CYCLE.indexOf(current ?? null);
  return CYCLE[(i + 1) % CYCLE.length];
}

// Every calendar date in `year`, Jan 1 through Dec 31, as 'YYYY-MM-DD' —
// real date iteration (not a hardcoded 365 loop), so this is correct
// regardless of leap years even though 2026/2027 both happen to be 365.
function datesInYear(year) {
  const dates = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    dates.push(toDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// "Day X of 365" — X = days from Jan 1 of `year` through today, inclusive.
// 0 if the year hasn't started yet, the year's own full day count (365 for
// 2026/2027) if it's already over.
function dayOfYearCount(year) {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const totalDays = Math.round((dec31 - jan1) / 86400000) + 1;
  if (todayMidnight < jan1) return 0;
  if (todayMidnight > dec31) return totalDays;
  return Math.round((todayMidnight - jan1) / 86400000) + 1;
}

function sentimentColor(sentiment) {
  if (sentiment === 'positive') return POSITIVE;
  if (sentiment === 'neutral') return NEUTRAL;
  if (sentiment === 'negative') return NEGATIVE;
  return UNLOGGED;
}

export default function LifePage() {
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const defaultYearIndex = YEARS.indexOf(new Date().getFullYear());
  const [yearIndex, setYearIndex] = useState(defaultYearIndex === -1 ? 0 : defaultYearIndex);
  const year = YEARS[yearIndex];

  const [sentiments, setSentiments] = useState({}); // {'YYYY-MM-DD': 'positive'|'neutral'|'negative'}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSentimentsForYear(year)
      .then((byDate) => {
        if (!cancelled) setSentiments(byDate);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const dates = useMemo(() => datesInYear(year), [year]);
  const dayCount = dayOfYearCount(year);

  const onDotClick = async (dateStr) => {
    if (dateStr > todayStr) return; // future dates are inert, no-op
    const current = sentiments[dateStr] ?? null;
    const next = nextSentiment(current);

    // Optimistic — updates the grid immediately, persists after. Reverts on
    // a write failure so the grid never silently drifts from the DB.
    setSentiments((prev) => {
      const copy = { ...prev };
      if (next === null) delete copy[dateStr];
      else copy[dateStr] = next;
      return copy;
    });

    try {
      if (next === null) await deleteDayLog(dateStr);
      else await upsertDayLog(dateStr, next);
    } catch (e) {
      setError(e.message);
      setSentiments((prev) => {
        const copy = { ...prev };
        if (current === null) delete copy[dateStr];
        else copy[dateStr] = current;
        return copy;
      });
    }
  };

  return (
    <>
      <Head>
        <title>Life · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <AppNav current="life" />

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflow: 'auto' }}>
          {error && <div style={{ color: NEGATIVE, marginBottom: space[3], maxWidth: 640, margin: '0 auto' }}>{error}</div>}
          {loading && <div style={{ ...textMuted, maxWidth: 640, margin: '0 auto' }}>Loading…</div>}

          {/* Toggle, header, and grid all share this one maxWidth:640
              container, centered on the page — the day counter sits at the
              header row's own right edge, which now lines up with the
              grid's right edge directly below it (top-right of the circle
              grid), instead of the header spanning the full page width. */}
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ marginBottom: space[4] }}>
              <PillTabs options={YEARS.map(String)} activeIndex={yearIndex} onChange={setYearIndex} />
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[4] }}>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: INK, fontFamily: font.family }}>
                {year}
              </div>
              <div style={{ fontSize: font.size.sm, color: NEUTRAL, fontFamily: font.family }}>
                Day {dayCount} of 365
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                gap: GAP,
              }}
            >
            {dates.map((dateStr) => {
              const isFuture = dateStr > todayStr;
              const isToday = dateStr === todayStr;
              const sentiment = sentiments[dateStr] ?? null;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => onDotClick(dateStr)}
                  disabled={isFuture}
                  aria-label={dateStr}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: '50%',
                    border: 'none',
                    padding: 0,
                    background: isFuture ? FUTURE : sentimentColor(sentiment),
                    outline: isToday ? `2px solid ${INK}` : 'none',
                    outlineOffset: isToday ? '2px' : undefined,
                    cursor: isFuture ? 'default' : 'pointer',
                  }}
                />
              );
            })}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
