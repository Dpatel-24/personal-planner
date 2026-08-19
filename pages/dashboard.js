// pages/dashboard.js — Life Formula dashboard. Own route (Pages Router,
// same convention as pages/goals.js and pages/life-formula.js), no sidebar
// (mirrors those same pages' header-only shape). Named "dashboard"
// deliberately: pages/life-formula.js's submit handler already does
// router.push('/dashboard') — that redirect target didn't exist until this
// page, flagged when life-formula.js was built. This closes that gap.
//
// No charting library in this app (checked package.json first, per the
// ask) — the trend view below is plain divs sized by inline style, same
// "primitives composed in the component, no external UI library" approach
// every other view in this app already uses (e.g. GoalNode's progress bar).
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllLifeFormulaEntries, computeDashboardStats } from '@/lib/lifeFormulaStats';
import { color, space, radius, border, font } from '@/lib/tokens';
import { card as cardStyle, heading, buttonGhost, textMuted } from '@/lib/components';

const STATE_COLOR = {
  Friction: color.danger,
  Stability: color.warning,
  Momentum: color.success,
};

function StatTile({ label, value, sub }) {
  return (
    <div style={{ ...cardStyle, flex: '1 1 160px', minWidth: 160 }}>
      <div style={{ fontSize: font.size.xs, color: color.textMuted, marginBottom: space[1] }}>{label}</div>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.text }}>{value}</div>
      {sub && <div style={{ fontSize: font.size.xs, color: color.textMuted, marginTop: space[1] }}>{sub}</div>}
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
    background: color.bg,
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ ...heading, fontSize: font.size.lg }}>Life Formula Dashboard</div>
            <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← Planner
            </Link>
          </div>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflowY: 'auto' }}>
          {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

          {stats === undefined && !error && <div style={textMuted}>Loading…</div>}

          {stats === null && (
            <div style={{ ...cardStyle, maxWidth: 480 }}>
              <div style={{ fontSize: font.size.md, color: color.text, marginBottom: space[1] }}>No data yet.</div>
              <div style={textMuted}>
                Complete a weekly Life Formula entry (find it on your board or calendar as a recurring
                Sunday task) to start seeing your dashboard.
              </div>
            </div>
          )}

          {stats && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[3], marginBottom: space[6] }}>
                <StatTile label="Current L(t)" value={stats.currentScore} sub={`Week ${stats.currentWeek}`} />
                <StatTile
                  label="Current State"
                  value={
                    <span style={{ color: STATE_COLOR[stats.currentState] || color.text }}>{stats.currentState}</span>
                  }
                />
                <StatTile label="Annual Average" value={stats.annualAverage.toFixed(4)} />
                <StatTile label="Peak Score" value={stats.peakScore} />
                <StatTile label="Weeks Logged" value={stats.weeksLogged} />
                <StatTile
                  label="4-Week Moving Avg"
                  value={stats.fourWeekAvg !== null ? stats.fourWeekAvg.toFixed(4) : '—'}
                  sub={stats.fourWeekAvg === null ? 'Needs 4+ weeks' : undefined}
                />
              </div>

              <div style={{ ...heading, fontSize: font.size.md, marginBottom: space[2] }}>
                Trend (last {stats.trend.length} weeks)
              </div>
              <div style={{ ...cardStyle, maxWidth: 560 }}>
                {stats.trend.map((entry) => (
                  <div
                    key={entry.id}
                    style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]} 0` }}
                  >
                    <span style={{ width: 72, fontSize: font.size.xs, color: color.textMuted, flexShrink: 0 }}>
                      {entry.week_label}
                    </span>
                    <div style={{ flex: 1, height: 10, borderRadius: radius.full, background: color.bgMuted, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${(Number(entry.score) / maxTrendScore) * 100}%`,
                          height: '100%',
                          background: STATE_COLOR[entry.state] || color.accent,
                          borderRadius: radius.full,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: 56,
                        textAlign: 'right',
                        fontSize: font.size.xs,
                        color: color.textMuted,
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {entry.score}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
