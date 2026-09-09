// pages/life-formula.js — weekly Life Formula entry form. Own top-level
// route (Pages Router, same convention confirmed for pages/goals.js — no
// app/ directory in this codebase). No sidebar: mirrors pages/goals.js's own
// no-sidebar shape (header + content, no aside), this app's established
// pattern for a new top-level section.
//
// ENTRY-FORM RESTYLE (2026-08, locked spec): three zone cards (Coherence/
// Resistance/Execution), each an uppercase letter-spaced eyebrow PILL above
// a white bordered card, one row per field (label left, 1-5 button-group
// right). Submit live-computes L(t) via the existing calculateLifeFormula —
// not reimplemented here — and is disabled with "complete all fields" until
// all 9 metrics have a value. This pass is the entry form ONLY: the
// dashboard (pages/dashboard.js) and its own components are untouched, and
// this file still writes through the exact same createLifeFormulaEntry call
// and /dashboard redirect the dashboard already reads from — no new write
// path, no schema change, no calculation change.
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { createLifeFormulaEntry } from '@/lib/lifeFormulaStats';
import { calculateLifeFormula, LIFE_FORMULA_ZONES, LIFE_FORMULA_KEYS } from '@/lib/lifeFormula';
import { isoWeekLabel } from '@/lib/dates';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonGhost, textMuted } from '@/lib/components';
import { Zone } from '@/components/LifeFormulaZones';

// Zone/metric grouping now lives in lib/lifeFormula.js (LIFE_FORMULA_ZONES)
// so the Log's edit view (pages/life-formula-log.js) renders the exact same
// grouping for an existing entry instead of a second, driftable copy — see
// that file's own comment. Values start unanswered (null), not pre-filled —
// the spec's "disable submit until all 9 fields are answered" only means
// something if a field can actually be in an unanswered state.
const ZONES = LIFE_FORMULA_ZONES;
const ALL_KEYS = LIFE_FORMULA_KEYS;
const DEFAULT_VALUES = Object.fromEntries(ALL_KEYS.map((key) => [key, null]));

export default function LifeFormulaPage() {
  const router = useRouter();
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setMetric = (key, n) => setValues((prev) => ({ ...prev, [key]: n }));

  const allAnswered = ALL_KEYS.every((key) => values[key] !== null);
  // calculateLifeFormula itself is untouched — imported and called as-is,
  // only ever with a fully-answered values object (guarded by allAnswered)
  // so its own divide-by-zero guard never has a reason to fire here.
  const liveScore = allAnswered ? calculateLifeFormula(values).score : null;
  const submitLabel = busy
    ? 'Saving…'
    : allAnswered
      ? `Submit — L(t) = ${liveScore}`
      : 'Submit — complete all fields';

  // Unchanged from before this restyle — same createLifeFormulaEntry call,
  // same computed-score-and-state-at-insert-time behavior, same redirect.
  const submit = async (e) => {
    e.preventDefault();
    if (!allAnswered) return;
    setBusy(true);
    setError(null);
    try {
      await createLifeFormulaEntry(isoWeekLabel(), values);
      router.push('/dashboard');
    } catch (e) {
      setError(e.message);
      setBusy(false);
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
        <title>Life Formula · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: color.paper }}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.ink, fontFamily: font.family }}>
              Life Formula — Weekly Check-In
            </div>
            <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← OS
            </Link>
          </div>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflowY: 'auto', background: color.paper }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ ...textMuted, marginBottom: space[5] }}>
              Week {isoWeekLabel()} — rate each 1 (low) to 5 (high).
            </div>

            <form onSubmit={submit}>
              {ZONES.map((zone) => (
                <Zone
                  key={zone.eyebrow}
                  eyebrow={zone.eyebrow}
                  bg={zone.bg}
                  text={zone.text}
                  metrics={zone.metrics}
                  values={values}
                  onChange={setMetric}
                />
              ))}

              {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: radius.md,
                  border: 'none',
                  background: color.ink,
                  color: color.paper,
                  fontFamily: font.family,
                  fontSize: font.size.md,
                  fontWeight: font.weight.bold,
                  cursor: allAnswered && !busy ? 'pointer' : 'not-allowed',
                  opacity: allAnswered ? 1 : 0.6,
                }}
                disabled={busy || !allAnswered}
              >
                {submitLabel}
              </button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
