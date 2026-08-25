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
import { useEffect, useState } from 'react';
import { getAllLifeFormulaEntries, computeDashboardStats, computeMonthlySummary } from '@/lib/lifeFormulaStats';
import { color, space, radius, font } from '@/lib/tokens';
import AppNav from '@/components/AppNav';
import TagManagerModal from '@/components/TagManagerModal';

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

// Plain SVG line chart — no charting library in this app. Now plots TWO
// series together (the dashboard's "momentum" centerpiece, per the ask to
// focus on the trend over the bar graphs): the 4-week moving average (solid
// ink line) and the 13-week/~3-month moving average (dashed muted line).
// `series4`'s own week_labels are the master x-axis — series13 is always a
// subset of it in the normal contiguous-weekly-entry case (it needs a
// longer run of entries before its first point exists), so its points are
// placed by looking up each label's x position in series4 rather than
// assuming the two arrays line up index-for-index.
function MovingAverageChart({ series4, series13 }) {
  const width = 900;
  const height = 260;
  const padTop = 24;
  const padBottom = 32;
  const padX = 32;

  const n = series4.length;
  const xAt = (i) => (n === 1 ? width / 2 : padX + (i / (n - 1)) * (width - padX * 2));
  const xIndexByLabel = new Map(series4.map((p, i) => [p.week_label, i]));

  const allValues = [...series4.map((p) => p.avg), ...series13.map((p) => p.avg)];
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1; // flat series (all equal) — avoid a /0
  const plotH = height - padTop - padBottom;
  const yFor = (v) => padTop + plotH - ((v - minV) / range) * plotH;

  const points4 = series4.map((p, i) => ({ ...p, x: xAt(i), y: yFor(p.avg) }));
  const path4 = points4.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');

  const points13 = series13
    .filter((p) => xIndexByLabel.has(p.week_label))
    .map((p) => ({ ...p, x: xAt(xIndexByLabel.get(p.week_label)), y: yFor(p.avg) }));
  const path13 = points13.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');

  // Up to 52 weeks of x-axis labels would collide — show at most ~12,
  // evenly spaced, same idea as a normal chart-library tick reducer.
  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const lastPoint4 = points4[points4.length - 1];
  const lastPoint13 = points13[points13.length - 1];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', fontFamily: font.family }}>
      {path13 && <path d={path13} fill="none" stroke={color.muted} strokeWidth={2} strokeDasharray="5 4" />}
      {path4 && <path d={path4} fill="none" stroke={color.ink} strokeWidth={2} />}
      {points4.map((pt, i) =>
        i % labelEvery === 0 ? (
          <text key={pt.week_label} x={pt.x} y={height - 10} textAnchor="middle" fontSize={9} fill={color.mutedFaint}>
            {pt.week_label}
          </text>
        ) : null
      )}
      {lastPoint4 && <circle cx={lastPoint4.x} cy={lastPoint4.y} r={4} fill={color.ink} />}
      {lastPoint13 && <circle cx={lastPoint13.x} cy={lastPoint13.y} r={4} fill={color.muted} />}
    </svg>
  );
}

// Small solid/dashed legend for the two lines above — kept as its own
// component since MovingAverageChart is pure SVG (no room for HTML labels
// inside it) and the legend needs normal text rendering.
function MovingAverageLegend() {
  const item = { display: 'flex', alignItems: 'center', gap: space[1] };
  const swatch = (dashed) => (
    <svg width="16" height="8" style={{ flexShrink: 0 }}>
      <line x1="0" y1="4" x2="16" y2="4" stroke={dashed ? color.muted : color.ink} strokeWidth={2} strokeDasharray={dashed ? '5 4' : undefined} />
    </svg>
  );
  return (
    <div style={{ display: 'flex', gap: space[4], fontSize: font.size.xs, color: color.muted, marginBottom: space[2] }}>
      <div style={item}>{swatch(false)} 4-week moving average</div>
      <div style={item}>{swatch(true)} 13-week (~3 month) moving average</div>
    </div>
  );
}

function StatCard({ label, value, color: valueColor }) {
  return (
    <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, padding: space[4], flex: '1 1 160px', minWidth: 160 }}>
      <div style={{ fontSize: font.size.xs, color: color.muted, marginBottom: space[1] }}>{label}</div>
      <div style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, color: valueColor || color.ink }}>
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(undefined); // undefined = loading, null = no data, object = loaded
  const [monthly, setMonthly] = useState(undefined);
  const [error, setError] = useState(null);
  const [managingTags, setManagingTags] = useState(false);

  useEffect(() => {
    // One fetch feeds both the weekly stats and the monthly rollup — no
    // second round trip, same "one fetch, several derived views" shape
    // computeDashboardStats() itself already established.
    getAllLifeFormulaEntries()
      .then((entries) => {
        setStats(computeDashboardStats(entries));
        setMonthly(computeMonthlySummary(entries));
      })
      .catch((e) => setError(e.message));
  }, []);

  const maxTrendScore = stats ? Math.max(...stats.trend.map((e) => Number(e.score)), 0.0001) : 0;

  return (
    <>
      <Head>
        <title>Dashboard · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: color.paperV6 }}>
        <AppNav current="dashboard" onManageTags={() => setManagingTags(true)} />

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflowY: 'auto', background: color.paperV6 }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.ink, marginBottom: space[4] }}>
            Life Formula — Dashboard
          </div>

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
                <StatCard label="Current L(t)" value={Number(stats.currentScore).toFixed(2)} />
                <StatCard label="Annual Avg" value={stats.annualAverage.toFixed(2)} />
                <StatCard label="Peak Score" value={Number(stats.peakScore).toFixed(2)} />
                <StatCard label="Current State" value={stats.currentState} color={STATE_COLOR[stats.currentState]} />
                <StatCard label="Weeks Logged" value={stats.weeksLogged} />
              </div>

              {/* Momentum — the dashboard's centerpiece per the ask to focus
                  on the trend over the bar graphs/raw numbers: moved up
                  here (right under At a Glance) and enlarged, rather than a
                  small chart sitting below Weekly Trend/Monthly Log. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
                <div style={sectionLabelStyle}>Momentum</div>
                <span style={{ fontSize: font.size.xs, color: color.muted }}>
                  (last {stats.movingAverageTrend.length} weeks — moving averages)
                </span>
              </div>
              <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, padding: space[4], marginBottom: space[3] }}>
                {stats.movingAverageTrend.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: space[6], marginBottom: space[3] }}>
                      <div>
                        <div style={{ fontSize: font.size.xs, color: color.muted }}>4-week current</div>
                        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.ink }}>
                          {stats.fourWeekAvg !== null ? stats.fourWeekAvg.toFixed(2) : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: font.size.xs, color: color.muted }}>13-week (~3mo) current</div>
                        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.muted }}>
                          {stats.thirteenWeekAvg !== null ? stats.thirteenWeekAvg.toFixed(2) : 'needs 13+ weeks'}
                        </div>
                      </div>
                    </div>
                    <MovingAverageLegend />
                    <MovingAverageChart series4={stats.movingAverageTrend} series13={stats.movingAverageTrend13} />
                  </>
                ) : (
                  <div style={{ fontSize: font.size.sm, color: color.muted }}>
                    Needs at least 4 logged weeks before a moving-average trend can be plotted.
                  </div>
                )}
              </div>

              <div style={sectionLabelStyle}>State Distribution — Weekly</div>
              <div style={{ display: 'flex', gap: space[3], marginBottom: space[6] }}>
                {['Momentum', 'Stability', 'Friction'].map((state) => {
                  const count = stats.stateDistribution[state];
                  const pct = stats.weeksLogged > 0 ? Math.round((count / stats.weeksLogged) * 100) : 0;
                  return (
                    <div
                      key={state}
                      style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, padding: space[4], flex: '1 1 140px' }}
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
              <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, padding: space[4], maxWidth: 560, marginBottom: space[3] }}>
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
                      {Number(entry.score).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {monthly && (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
                    <div style={sectionLabelStyle}>Monthly Log</div>
                    <span style={{ fontSize: font.size.xs, color: color.muted }}>
                      (rolled up from weekly entries — no separate monthly logging)
                    </span>
                  </div>
                  <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, overflow: 'hidden', maxWidth: 640, marginBottom: space[4] }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                        gap: space[2],
                        padding: `${space[2]} ${space[4]}`,
                        background: color.ink,
                        color: color.white,
                        fontSize: font.size.xs,
                        fontWeight: font.weight.bold,
                      }}
                    >
                      <div>Month</div>
                      <div>Weeks Logged</div>
                      <div>Avg L(t)</div>
                      <div>3-Mo MA</div>
                      <div>State</div>
                    </div>
                    {monthly.months.map((m) => (
                      <div
                        key={m.monthKey}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                          gap: space[2],
                          padding: `${space[2]} ${space[4]}`,
                          fontSize: font.size.sm,
                          color: color.ink,
                          borderTop: `1px solid ${color.paper}`,
                        }}
                      >
                        <div>{m.monthName}</div>
                        <div>{m.weeksLogged}</div>
                        <div style={{ fontWeight: font.weight.semibold }}>{m.avgScore.toFixed(2)}</div>
                        <div style={{ color: color.muted }}>{m.threeMonthAvg !== null ? m.threeMonthAvg.toFixed(2) : '—'}</div>
                        <div style={{ color: STATE_COLOR[m.state], fontWeight: font.weight.semibold }}>{m.state}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, overflow: 'hidden', maxWidth: 320 }}>
                    <div
                      style={{
                        padding: `${space[2]} ${space[4]}`,
                        background: color.ink,
                        color: color.white,
                        fontSize: font.size.xs,
                        fontWeight: font.weight.bold,
                      }}
                    >
                      Year Summary
                    </div>
                    {[
                      ['Annual Average L(t)', monthly.annualAverage.toFixed(2)],
                      ['Peak Month', monthly.peakMonth],
                      ['Lowest Month', monthly.lowestMonth],
                      ['Months in Momentum', monthly.monthsInState.Momentum],
                      ['Months in Stability', monthly.monthsInState.Stability],
                      ['Months in Friction', monthly.monthsInState.Friction],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: space[3],
                          padding: `${space[2]} ${space[4]}`,
                          fontSize: font.size.sm,
                          borderTop: `1px solid ${color.paper}`,
                        }}
                      >
                        <span style={{ color: color.muted }}>{label}</span>
                        <span style={{ color: color.ink, fontWeight: font.weight.semibold }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {managingTags && <TagManagerModal onClose={() => setManagingTags(false)} />}
    </>
  );
}
