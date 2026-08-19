// pages/life-formula.js — weekly Life Formula entry form. Own top-level
// route (Pages Router, same convention confirmed for pages/goals.js — no
// app/ directory in this codebase). No sidebar: mirrors pages/goals.js's own
// no-sidebar shape (header + content, no aside), this app's established
// pattern for a new top-level section.
//
// Button-group inputs, not a dropdown or slider — 9 fields x 5 options each,
// all visible and one-click to set, so filling this out stays well under a
// minute (a <select> would need an open+scroll+click per field; a slider
// needs precise dragging for a value that's really just 1 of 5 discrete
// options).
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { createLifeFormulaEntry } from '@/lib/lifeFormulaStats';
import { isoWeekLabel } from '@/lib/dates';
import { color, space, border, font } from '@/lib/tokens';
import { heading, buttonPrimary, buttonSecondary, buttonGhost, label as labelStyle, textMuted } from '@/lib/components';

const METRICS = [
  ['vision', 'Vision'],
  ['systems', 'Systems'],
  ['resilience', 'Resilience'],
  ['persistence', 'Persistence'],
  ['lessons_integrated', 'Lessons Integrated'],
  ['financial_friction', 'Financial Friction'],
  ['emotional_turbulence', 'Emotional Turbulence'],
  ['coordination_friction', 'Coordination Friction'],
  ['execution', 'Execution'],
];

const DEFAULT_VALUES = Object.fromEntries(METRICS.map(([key]) => [key, 3]));

function ScoreButtons({ metricLabel, value, onChange }) {
  return (
    <div style={{ marginBottom: space[4] }}>
      <label style={labelStyle}>{metricLabel}</label>
      <div style={{ display: 'flex', gap: space[1] }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              ...(value === n ? buttonPrimary : buttonSecondary),
              flex: 1,
              padding: `${space[2]} 0`,
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LifeFormulaPage() {
  const router = useRouter();
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setMetric = (key, n) => setValues((prev) => ({ ...prev, [key]: n }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createLifeFormulaEntry(isoWeekLabel(), values);
      // No dashboard page exists in this codebase yet (Prompt B5) — this
      // route matches where it's SPECIFIED to land once built, so the
      // redirect works automatically the moment B5 ships at this path.
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
    background: color.bg,
    flexShrink: 0,
  };

  return (
    <>
      <Head>
        <title>Life Formula · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ ...heading, fontSize: font.size.lg }}>Life Formula</div>
            <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← Planner
            </Link>
          </div>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflowY: 'auto' }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ ...textMuted, marginBottom: space[5] }}>
              Week {isoWeekLabel()} — rate each 1 (low) to 5 (high).
            </div>

            <form onSubmit={submit}>
              {METRICS.map(([key, metricLabel]) => (
                <ScoreButtons
                  key={key}
                  metricLabel={metricLabel}
                  value={values[key]}
                  onChange={(n) => setMetric(key, n)}
                />
              ))}

              {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

              <button type="submit" style={{ ...buttonPrimary, width: '100%' }} disabled={busy}>
                {busy ? 'Saving…' : 'Submit'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
