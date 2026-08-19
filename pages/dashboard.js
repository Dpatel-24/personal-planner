// pages/dashboard.js — Life Formula dashboard. Own route (Pages Router,
// same convention as pages/goals.js and pages/life-formula.js), no sidebar.
//
// VISUAL RESTYLE ONLY (this pass): ink/paper/card/muted + state-color
// tokens from the prior prompts, three named sections (At a Glance / State
// Distribution / Weekly Trend). Data-fetching untouched — still one
// getAllLifeFormulaEntries() call, still computeDashboardStats() for every
// number. The only lib change was ADDING stateDistribution as a new field
// on that function's return value (nothing existing there was altered) to
// support the newly-required State Distribution section.
//
// The spec's "AT A GLANCE" row names exactly 5 cards (L(t), Annual Avg,
// Peak, Current State, Weeks Logged) — the foundation build's 4-week moving
// average isn't one of them. Rather than silently dropping a working,
// still-computed number, it's kept as a small line under the Weekly Trend
// heading instead of a 6th "at a glance" card, so the exact 5-card layout
// is honored without losing the stat entirely.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllLifeFormulaEntries, computeDashboardStats } from '@/lib/lifeFormulaStats';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';

const STATE_COLOR = {
  Momentum: color.stateMomentum,
  Stability: color.stateStability,
  Friction: color.stateFriction,
};

const sectionLabelStyle = {
  fontSize: font.size.xs,
  fontWeight: font.weight.bold,
  color: color.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: space[2],
};

function StatCard({ label, value, color: valueColor }) {
  return (
    <div style={{ background: color.card, borderRadius: radius.lg, padding: space[4], flex: '1 1 160px', minWidth: 160 }}>
      <div style={{ fontSize: font.size.xs, color: color.muted, marginBottom: space[1] }}>{label}</div>
      <div style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, color: valueColor || color.ink }}>
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(undefined); // undefined = loading, null = no data, object = loaded
  const [error, setError] = useState(null);

  useEffect(() => {
    getAllLifeFormulaEntries()
      .then((entries) => setStats(computeDashboardStats(entries)))
      .catch((e) => setError(e.message));
  }, []);

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

  const maxTrendScore = stats ? Math.max(...stats.trend.map((e) => Number(e.score)), 0.0001) : 0;

  return (
    <>
      <Head>
        <title>Dashboard · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: color.paper }}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.ink }}>
              Life Formula — Dashboard
            </div>
            <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← Planner
            </Link>
          </div>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflowY: 'auto', background: color.paper }}>
          {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

          {stats === undefined && !error && <div style={{ color: color.muted }}>Loading…</div>}

          {stats === null && (
            <div style={{ textAlign: 'center', padding: `${space[12]} ${space[4]}` }}>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.muted, marginBottom: space[1] }}>
                No data yet.
              </div>
              <div style={{ fontSize: font.size.sm, color: color.muted }}>
                Complete a weekly Life Formula entry (find it on your board or calendar as a recurring
                Sunday task) to start seeing your dashboard.
              </div>
            </div>
          )}

          {stats && (
            <>
              <div style={sectionLabelStyle}>At a Glance</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], marginBottom: space[6] }}>
                <StatCard label="Current L(t)" value={stats.currentScore} />
                <StatCard label="Annual Avg" value={stats.annualAverage.toFixed(4)} />
                <StatCard label="Peak Score" value={stats.peakScore} />
                <StatCard label="Current State" value={stats.currentState} color={STATE_COLOR[stats.currentState]} />
                <StatCard label="Weeks Logged" value={stats.weeksLogged} />
              </div>

              <div style={sectionLabelStyle}>State Distribution — Weekly</div>
              <div style={{ display: 'flex', gap: space[3], marginBottom: space[6] }}>
                {['Momentum', 'Stability', 'Friction'].map((state) => {
                  const count = stats.stateDistribution[state];
                  const pct = stats.weeksLogged > 0 ? Math.round((count / stats.weeksLogged) * 100) : 0;
                  return (
                    <div
                      key={state}
                      style={{ background: color.card, borderRadius: radius.lg, padding: space[4], flex: '1 1 140px' }}
                    >
                      <div style={{ fontSize: font.size.xs, color: STATE_COLOR[state], fontWeight: font.weight.bold, marginBottom: space[1] }}>
                        {state}
                      </div>
                      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.ink }}>
                        {count} <span style={{ fontSize: font.size.sm, fontWeight: font.weight.normal, color: color.muted }}>({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
                <div style={sectionLabelStyle}>Weekly Trend</div>
                <span style={{ fontSize: font.size.xs, color: color.muted }}>(last {stats.trend.length} weeks)</span>
              </div>
              <div style={{ background: color.card, borderRadius: radius.lg, padding: space[4], maxWidth: 560, marginBottom: space[3] }}>
                {stats.trend.map((entry) => (
                  <div
                    key={entry.id}
                    style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]} 0` }}
                  >
                    <span style={{ width: 72, fontSize: font.size.xs, color: color.muted, flexShrink: 0 }}>
                      {entry.week_label}
                    </span>
                    <div style={{ flex: 1, height: 10, borderRadius: radius.full, background: color.paper, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${(Number(entry.score) / maxTrendScore) * 100}%`,
                          height: '100%',
                          background: STATE_COLOR[entry.state] || color.ink,
                          borderRadius: radius.full,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: 56,
                        textAlign: 'right',
                        fontSize: font.size.xs,
                        color: color.muted,
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {entry.score}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: font.size.xs, color: color.mutedFaint }}>
                4-week moving average: {stats.fourWeekAvg !== null ? stats.fourWeekAvg.toFixed(4) : 'needs 4+ weeks'}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
