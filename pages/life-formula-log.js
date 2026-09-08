// pages/life-formula-log.js — the Life Formula Log: every logged week in a
// simple list, most-recent first, editable. Answers a real gap the
// dashboard doesn't cover: dashboard.js's own "Weekly Trend"/"Monthly Log"
// sections are READ-ONLY summaries (bars/table), and pages/life-formula.js
// only ever creates THIS week's entry — there was previously no way to see
// or correct a past week's 9 raw answers at all.
//
// Own top-level route, no sidebar (same convention as pages/life-formula.js/
// pages/goals.js). Deliberately NOT in AppNav's own nav list — this is a
// detail view of Life Formula, reached from the dashboard's "View Log" link
// (pages/dashboard.js), the same way life-formula.js itself isn't in AppNav
// either (reached via the recurring entry task's own click-through).
//
// List format, per the ask: each week is one collapsed row (week, score,
// state pill) by default — expanding a row reveals the exact same 1-5
// zone cards the entry form uses (components/LifeFormulaZones.js), reused
// unchanged rather than a second edit UI. A field click there writes
// IMMEDIATELY via lib/lifeFormulaStats.js's updateLifeFormulaEntry — no
// separate Save button, same "click = persisted" convention the rest of
// this app's inline-edit controls already use (Daily Planning's checkboxes,
// the Schedule Rail's duration stepper, etc.) — appropriate here since
// every field it's editing already has a valid prior value (this corrects
// an existing week, never creates one), so every click always has a
// complete, valid 9-input object to recompute score/state from.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllLifeFormulaEntries, updateLifeFormulaEntry } from '@/lib/lifeFormulaStats';
import { LIFE_FORMULA_ZONES, STATE_COLOR } from '@/lib/lifeFormula';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonGhost, textMuted } from '@/lib/components';
import { Zone } from '@/components/LifeFormulaZones';

function StatePill({ state }) {
  return (
    <span
      style={{
        fontSize: font.size.xs,
        fontWeight: font.weight.bold,
        color: STATE_COLOR[state] || color.muted,
        padding: `2px ${space[2]}`,
        borderRadius: radius.full,
        background: color.paper,
        flexShrink: 0,
      }}
    >
      {state}
    </span>
  );
}

export default function LifeFormulaLogPage() {
  const [entries, setEntries] = useState(undefined); // undefined = loading, [] = loaded-empty
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setError(null);
    try {
      // getAllLifeFormulaEntries returns oldest-first (the shape every
      // dashboard stat needs) — reversed here only for this page's own
      // most-recent-first list display, not a second query.
      const rows = await getAllLifeFormulaEntries();
      setEntries([...rows].reverse());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // One field of one week corrected — writes the FULL 9-input object (the
  // entry's own current values with just this one key replaced), since
  // updateLifeFormulaEntry/calculateLifeFormula need all 9 to recompute
  // score. Updates local state from the row the write actually returned
  // (has the freshly-computed score/state), no extra re-fetch.
  const setMetric = async (entry, key, n) => {
    setSavingId(entry.id);
    setError(null);
    try {
      const inputs = Object.fromEntries(
        LIFE_FORMULA_ZONES.flatMap((z) => z.metrics.map(([k]) => [k, k === key ? n : entry[k]]))
      );
      const updated = await updateLifeFormulaEntry(entry.id, inputs);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space[2],
    padding: `${space[3]} ${space[6]}`,
    borderBottom: border.default,
    background: color.card,
    flexShrink: 0,
  };

  return (
    <>
      <Head>
        <title>Life Formula Log · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: color.paper }}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.ink, fontFamily: font.family }}>
              Life Formula — Log
            </div>
            <Link href="/dashboard" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← Dashboard
            </Link>
          </div>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflowY: 'auto', background: color.paper }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ ...textMuted, marginBottom: space[5] }}>
              Every logged week, most recent first. Click a week to correct its answers.
            </div>

            {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

            {entries === undefined && !error && <div style={textMuted}>Loading…</div>}

            {entries && entries.length === 0 && (
              <div style={textMuted}>No entries logged yet.</div>
            )}

            {entries && entries.length > 0 && (
              <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {entries.map((entry, i) => {
                  const expanded = expandedId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      style={i < entries.length - 1 ? { borderBottom: `1px solid ${color.lifeFormulaBorder}` } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: space[3],
                          padding: `${space[3]} ${space[4]}`,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: font.family,
                        }}
                      >
                        <span style={{ fontSize: font.size.xs, color: color.muted, width: 14, flexShrink: 0 }}>
                          {expanded ? '▾' : '▸'}
                        </span>
                        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.ink, width: 90, flexShrink: 0 }}>
                          {entry.week_label}
                        </span>
                        <StatePill state={entry.state} />
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: font.size.md, color: color.muted, fontVariantNumeric: 'tabular-nums' }}>
                          L(t) = {Number(entry.score).toFixed(4)}
                        </span>
                      </button>

                      {expanded && (
                        <div style={{ padding: `0 ${space[4]} ${space[4]}` }}>
                          {savingId === entry.id && (
                            <div style={{ fontSize: font.size.xs, color: color.muted, marginBottom: space[2] }}>Saving…</div>
                          )}
                          {LIFE_FORMULA_ZONES.map((zone) => (
                            <Zone
                              key={zone.eyebrow}
                              eyebrow={zone.eyebrow}
                              bg={zone.bg}
                              text={zone.text}
                              metrics={zone.metrics}
                              values={entry}
                              onChange={(key, n) => setMetric(entry, key, n)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
