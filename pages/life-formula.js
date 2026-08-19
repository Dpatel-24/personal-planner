// pages/life-formula.js — weekly Life Formula entry form. Own top-level
// route (Pages Router, same convention confirmed for pages/goals.js — no
// app/ directory in this codebase). No sidebar: mirrors pages/goals.js's own
// no-sidebar shape (header + content, no aside), this app's established
// pattern for a new top-level section.
//
// VISUAL RESTYLE ONLY (this pass): three colored zones — Coherence
// (numerator), Resistance (denominator), Execution — using the tokens added
// in the prior prompt (lib/tokens.js's coherence/resistance/execution/ink
// keys, same literal values as styles/globals.css's CSS custom properties).
// The input MECHANISM is untouched: still the same 5-button group per
// metric from the foundation build, just re-themed per zone instead of the
// generic purple accent — a click still calls the same setMetric(key, n),
// still 9 fields x 5 options, still one click each. No changes to state
// shape, validation, or the createLifeFormulaEntry/calculateLifeFormula
// call below.
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { createLifeFormulaEntry } from '@/lib/lifeFormulaStats';
import { isoWeekLabel } from '@/lib/dates';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonGhost, textMuted } from '@/lib/components';

// Same 9 metrics as the foundation build, now grouped into the three zones
// the restyle spec calls for. Keys/labels unchanged — only the grouping and
// per-zone color are new.
const ZONES = [
  {
    title: 'Numerator — Coherence',
    bg: color.coherenceBg,
    text: color.coherenceText,
    metrics: [
      ['vision', 'Vision'],
      ['systems', 'Systems'],
      ['resilience', 'Resilience'],
      ['persistence', 'Persistence'],
      ['lessons_integrated', 'Lessons Integrated'],
    ],
  },
  {
    title: 'Denominator — Resistance',
    bg: color.resistanceBg,
    text: color.resistanceText,
    metrics: [
      ['financial_friction', 'Financial Friction'],
      ['emotional_turbulence', 'Emotional Turbulence'],
      ['coordination_friction', 'Coordination Friction'],
    ],
  },
  {
    title: 'Execution',
    bg: color.executionBg,
    text: color.executionText,
    metrics: [['execution', 'Execution']],
  },
];

const DEFAULT_VALUES = Object.fromEntries(ZONES.flatMap((z) => z.metrics.map(([key]) => [key, 3])));

// One metric's button-group, re-themed to its zone's bg/text pair. Same
// mechanism as the foundation build (5 buttons, one click sets the value) —
// only the selected/unselected styling changed: selected inverts to a solid
// zoneText pill (the "value color"), unselected sits on a plain card with a
// zoneText-tinted border, both directly on the zone's tinted card background.
function ZoneMetricCard({ zoneBg, zoneText, metricLabel, value, onChange }) {
  return (
    <div style={{ background: zoneBg, borderRadius: radius.lg, padding: space[3], marginBottom: space[2] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: zoneText, marginBottom: space[2] }}>
        {metricLabel}
      </div>
      <div style={{ display: 'flex', gap: space[1] }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                padding: `${space[2]} 0`,
                borderRadius: radius.md,
                border: selected ? 'none' : `1px solid ${zoneText}`,
                background: selected ? zoneText : color.card,
                color: selected ? color.white : zoneText,
                fontWeight: font.weight.semibold,
                fontFamily: font.family,
                fontSize: font.size.md,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The zone's own labeled strip — small bold uppercase label, zoneText on
// zoneBg — plus its metric cards underneath.
function Zone({ title, bg, text, metrics, values, onChange }) {
  return (
    <div style={{ marginBottom: space[6] }}>
      <div
        style={{
          background: bg,
          color: text,
          padding: `${space[2]} ${space[3]}`,
          borderRadius: radius.md,
          fontSize: font.size.xs,
          fontWeight: font.weight.bold,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: space[3],
        }}
      >
        {title}
      </div>
      {metrics.map(([key, metricLabel]) => (
        <ZoneMetricCard
          key={key}
          zoneBg={bg}
          zoneText={text}
          metricLabel={metricLabel}
          value={values[key]}
          onChange={(n) => onChange(key, n)}
        />
      ))}
    </div>
  );
}

export default function LifeFormulaPage() {
  const router = useRouter();
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setMetric = (key, n) => setValues((prev) => ({ ...prev, [key]: n }));

  // Unchanged from the foundation build — same createLifeFormulaEntry call,
  // same computed-score-and-state-at-insert-time behavior, same redirect.
  const submit = async (e) => {
    e.preventDefault();
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: color.paper }}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.ink }}>
              Life Formula — Weekly Check-In
            </div>
            <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← Planner
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
                  key={zone.title}
                  title={zone.title}
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
                  padding: `${space[2]} ${space[4]}`,
                  borderRadius: radius.md,
                  border: 'none',
                  background: color.ink,
                  color: color.white,
                  fontFamily: font.family,
                  fontSize: font.size.md,
                  fontWeight: font.weight.medium,
                  cursor: 'pointer',
                }}
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Submit'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
