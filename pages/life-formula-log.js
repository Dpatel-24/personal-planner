// pages/life-formula-log.js — the Life Formula Log: every week from
// WEEK_FLOOR through the current week, most-recent-first, whether or not
// it was ever logged. Answers a real gap the dashboard doesn't cover:
// dashboard.js's own "Weekly Trend"/"Monthly Log" sections are READ-ONLY
// summaries of whatever entries already exist, and pages/life-formula.js
// only ever creates THIS week's entry — there was previously no way to see,
// correct, OR fill in a missed week at all.
//
// Own top-level route, no sidebar (same convention as pages/life-formula.js/
// pages/goals.js). Deliberately NOT in AppNav's own nav list — this is a
// detail view of Life Formula, reached from the dashboard's "View Log" link
// (pages/dashboard.js), the same way life-formula.js itself isn't in AppNav
// either (reached via the recurring entry task's own click-through).
//
// List format, per the ask: one row per week. A LOGGED week shows its state
// pill + score and expands into the same 1-5 zone cards the entry form uses
// (components/LifeFormulaZones.js, reused unchanged) with every field
// already answered — clicking a different button writes IMMEDIATELY (same
// "click = persisted" convention as Daily Planning's checkboxes / the
// Schedule Rail's duration stepper), safe here because correcting an
// existing week always already has a complete, valid 9-input set to
// recompute score from. An UNLOGGED week (2026-W35 was the reported case)
// shows "Not logged" instead, and expands into the SAME zone cards but
// starting blank — answers are held as a local draft (same shape as the
// entry form's own DEFAULT_VALUES) until all 9 are answered, then a Save
// button commits it as a brand-new entry via createLifeFormulaEntry. It
// can't write per-field like a logged week does: calculateLifeFormula needs
// all 9 inputs to produce a real score, so a partial draft has nothing
// valid to persist yet.
//
// Week range: lib/dates.js's weekLabelsFrom(WEEK_FLOOR) — every ISO week
// from the explicit floor below through THIS INSTANT's own week, walking
// real dates (not incrementing a week number), so a 53-week year is never a
// special case and the list's upper end always includes whatever week is
// actually current, with no re-deploy or edit needed as time passes.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllLifeFormulaEntries, createLifeFormulaEntry, updateLifeFormulaEntry } from '@/lib/lifeFormulaStats';
import { LIFE_FORMULA_ZONES, LIFE_FORMULA_KEYS, STATE_COLOR } from '@/lib/lifeFormula';
import { weekLabelsFrom } from '@/lib/dates';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonGhost, buttonPrimary, textMuted } from '@/lib/components';
import { Zone } from '@/components/LifeFormulaZones';

// Explicit floor per the ask: nothing before this week ever shows in the
// Log, regardless of how far back real data or "now" goes. A literal
// constant, not derived from the earliest logged entry — the ask was for a
// fixed cutoff, not "whatever's oldest right now" (which would silently
// creep earlier if an even-older week ever got backfilled).
const WEEK_FLOOR = '2026-W29';

const DEFAULT_DRAFT = Object.fromEntries(LIFE_FORMULA_KEYS.map((key) => [key, null]));

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
  // Map week_label -> real entry row, or undefined while loading. Every
  // week in the rendered list may or may not have one — that's exactly the
  // "logged vs. not" distinction the whole page hinges on.
  const [entriesByWeek, setEntriesByWeek] = useState(undefined);
  const [error, setError] = useState(null);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [savingWeek, setSavingWeek] = useState(null);
  // In-progress answers for a week that isn't logged yet — only ever holds
  // entries for weeks actually being filled in right now, cleared once
  // that week is saved (it becomes a real row in entriesByWeek instead).
  const [drafts, setDrafts] = useState({});

  const load = async () => {
    setError(null);
    try {
      const rows = await getAllLifeFormulaEntries();
      setEntriesByWeek(new Map(rows.map((r) => [r.week_label, r])));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Logged week, one field corrected — same immediate-write shape the
  // previous version of this page already had: write the full 9-input
  // object (current values with just this key replaced), update local
  // state from the row the write actually returned.
  const setLoggedMetric = async (entry, key, n) => {
    setSavingWeek(entry.week_label);
    setError(null);
    try {
      const inputs = Object.fromEntries(LIFE_FORMULA_KEYS.map((k) => [k, k === key ? n : entry[k]]));
      const updated = await updateLifeFormulaEntry(entry.id, inputs);
      setEntriesByWeek((prev) => new Map(prev).set(entry.week_label, updated));
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingWeek(null);
    }
  };

  // Unlogged week, one field answered — LOCAL only, no write yet (see this
  // file's own header comment for why a partial draft can't be persisted).
  const setDraftMetric = (week, key, n) => {
    setDrafts((prev) => ({ ...prev, [week]: { ...(prev[week] || DEFAULT_DRAFT), [key]: n } }));
  };

  // Unlogged week, all 9 finally answered — the one point this week
  // actually becomes a real entry. Merges the created row straight into
  // entriesByWeek (no re-fetch) and drops its draft, so the row switches
  // from "Not logged"/blank to a normal logged row with its real score in
  // the same render.
  const saveDraft = async (week) => {
    setSavingWeek(week);
    setError(null);
    try {
      const created = await createLifeFormulaEntry(week, drafts[week]);
      setEntriesByWeek((prev) => new Map(prev).set(week, created));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[week];
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingWeek(null);
    }
  };

  const weeks = entriesByWeek ? weekLabelsFrom(WEEK_FLOOR).slice().reverse() : [];

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
              Every week from {WEEK_FLOOR} on, most recent first — logged or not. Click a week to log or correct it.
            </div>

            {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

            {entriesByWeek === undefined && !error && <div style={textMuted}>Loading…</div>}

            {entriesByWeek && (
              <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {weeks.map((week, i) => {
                  const entry = entriesByWeek.get(week);
                  const logged = !!entry;
                  const expanded = expandedWeek === week;
                  const draft = drafts[week] || DEFAULT_DRAFT;
                  const draftComplete = LIFE_FORMULA_KEYS.every((k) => draft[k] !== null);

                  return (
                    <div
                      key={week}
                      style={i < weeks.length - 1 ? { borderBottom: `1px solid ${color.lifeFormulaBorder}` } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedWeek(expanded ? null : week)}
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
                        <span
                          style={{
                            fontSize: font.size.md,
                            fontWeight: font.weight.semibold,
                            color: logged ? color.ink : color.muted,
                            width: 90,
                            flexShrink: 0,
                          }}
                        >
                          {week}
                        </span>
                        {logged ? (
                          <StatePill state={entry.state} />
                        ) : (
                          <span style={{ fontSize: font.size.xs, color: color.mutedFaint, fontStyle: 'italic' }}>Not logged</span>
                        )}
                        <span style={{ flex: 1 }} />
                        {logged && (
                          <span style={{ fontSize: font.size.md, color: color.muted, fontVariantNumeric: 'tabular-nums' }}>
                            L(t) = {Number(entry.score).toFixed(4)}
                          </span>
                        )}
                      </button>

                      {expanded && (
                        <div style={{ padding: `0 ${space[4]} ${space[4]}` }}>
                          {savingWeek === week && (
                            <div style={{ fontSize: font.size.xs, color: color.muted, marginBottom: space[2] }}>Saving…</div>
                          )}
                          {LIFE_FORMULA_ZONES.map((zone) => (
                            <Zone
                              key={zone.eyebrow}
                              eyebrow={zone.eyebrow}
                              bg={zone.bg}
                              text={zone.text}
                              metrics={zone.metrics}
                              values={logged ? entry : draft}
                              onChange={(key, n) => (logged ? setLoggedMetric(entry, key, n) : setDraftMetric(week, key, n))}
                            />
                          ))}
                          {!logged && (
                            <button
                              type="button"
                              disabled={!draftComplete || savingWeek === week}
                              onClick={() => saveDraft(week)}
                              style={{
                                ...buttonPrimary,
                                width: '100%',
                                cursor: draftComplete ? 'pointer' : 'not-allowed',
                                opacity: draftComplete ? 1 : 0.6,
                              }}
                            >
                              {draftComplete ? `Save — L(t) will be computed` : 'Complete all fields to save'}
                            </button>
                          )}
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
