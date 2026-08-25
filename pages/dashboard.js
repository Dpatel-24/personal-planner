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

// Plain SVG line chart — no charting library in this app. Fixed FULL axis
// (`labels` — e.g. all 52 ISO weeks of a year, or all 12 months), not just
// the slots with real data. This is the fix for the exact bug flagged
// against the user's own spreadsheet reference: Excel plotted a missing
// week/month as a 0 and drew a misleading bell curve down to the baseline
// and back up. Here, `seriesA`/`seriesB` are {label: value} maps built only
// from REAL entries — a label with no entry is genuinely absent from that
// series, never substituted with 0 — so a gap just breaks the line into
// separate segments (buildPath starts a fresh 'M'), leaving blank space
// instead of a fake dip to zero.
// Picks a "nice" axis step (1/2/2.5/5 × a power of 10) for ~6 gridlines,
// same rounding chart libraries use — so the y-axis reads 0.00/0.20/0.40/...
// like the reference screenshot, not an arbitrary fraction of the real max.
function niceStep(maxV) {
  const rough = maxV / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const norm = rough / mag;
  let step;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

function TrendChart({ labels, seriesA, seriesB, labelA, labelB }) {
  const width = 1400;
  const height = 260;
  const padTop = 16;
  const padBottom = 32;
  const padLeft = 48;
  const padRight = 16;
  const n = labels.length;
  const xAt = (i) => (n === 1 ? (padLeft + width - padRight) / 2 : padLeft + (i / (n - 1)) * (width - padLeft - padRight));

  const allValues = [...Object.values(seriesA), ...Object.values(seriesB)];
  const hasData = allValues.length > 0;
  // Baseline always 0, axis top rounded up to the next "nice" gridline above
  // the real max (matches the reference's own 0.00-anchored y-axis with
  // round tick steps, e.g. 0.20 increments, rather than an arbitrary scale).
  const step = niceStep(hasData ? Math.max(...allValues, 0.1) : 1);
  const maxV = hasData ? Math.ceil(Math.max(...allValues, 0.1) / step) * step : step * 6;
  const plotH = height - padTop - padBottom;
  const yFor = (v) => padTop + plotH - (v / maxV) * plotH;
  const yTicks = [];
  for (let t = 0; t <= maxV + step / 2; t += step) yTicks.push(t);

  const buildPath = (series) => {
    let d = '';
    let open = false;
    labels.forEach((label, i) => {
      const v = series[label];
      if (v === undefined) {
        open = false;
        return;
      }
      const x = xAt(i).toFixed(1);
      const y = yFor(v).toFixed(1);
      d += open ? ` L ${x} ${y}` : `${d ? ' ' : ''}M ${x} ${y}`;
      open = true;
    });
    return d;
  };

  const pathA = buildPath(seriesA);
  const pathB = buildPath(seriesB);
  // A fixed 52 (or 12) labels would collide if all shown — reduce to ~14,
  // evenly spaced, same idea as a normal chart-library tick reducer.
  const labelEvery = Math.max(1, Math.ceil(n / 14));

  return (
    <>
      <div style={{ display: 'flex', gap: space[4], fontSize: font.size.xs, color: color.muted, marginBottom: space[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
          <svg width="16" height="8" style={{ flexShrink: 0 }}>
            <line x1="0" y1="4" x2="16" y2="4" stroke={color.ink} strokeWidth={2} />
          </svg>
          {labelA}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
          <svg width="16" height="8" style={{ flexShrink: 0 }}>
            <line x1="0" y1="4" x2="16" y2="4" stroke={color.muted} strokeWidth={2} strokeDasharray="5 4" />
          </svg>
          {labelB}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', fontFamily: font.family }}>
        {yTicks.map((t) => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke={color.lifeFormulaBorder} strokeWidth={1} />
              <text x={padLeft - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={9} fill={color.mutedFaint}>
                {t.toFixed(2)}
              </text>
            </g>
          );
        })}
        {pathB && <path d={pathB} fill="none" stroke={color.muted} strokeWidth={2} strokeDasharray="5 4" />}
        {pathA && <path d={pathA} fill="none" stroke={color.ink} strokeWidth={2} />}
        {labels.map((label, i) =>
          i % labelEvery === 0 ? (
            <text key={label} x={xAt(i)} y={height - 10} textAnchor="middle" fontSize={9} fill={color.mutedFaint}>
              {label}
            </text>
          ) : null
        )}
      </svg>
    </>
  );
}

// 'YYYY-Www' for every week of `year`, W01..W52 — the fixed weekly axis
// TrendChart plots against, so the chart always spans a full year like the
// reference regardless of how many weeks actually have entries.
function fullYearWeekLabels(year) {
  return Array.from({ length: 52 }, (_, i) => `${year}-W${String(i + 1).padStart(2, '0')}`);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

  // Fixed full-year axes for the two TrendChart usages below — derived from
  // the most recent real entry's own year (weekly) / month (monthly), same
  // "one year at a time" convention lib/dates.js's monthName() already
  // documents this app as modeled on. {label: value} maps, built ONLY from
  // real entries — a label absent from the map is genuinely unlogged, never
  // filled with 0 (see TrendChart's own comment for why that distinction
  // matters).
  const weekYear = stats ? Number(stats.currentWeek.split('-W')[0]) : null;
  const weekLabels = weekYear ? fullYearWeekLabels(weekYear) : [];
  const weekSeries4 = stats ? Object.fromEntries(stats.movingAverageTrend.map((p) => [p.week_label, p.avg])) : {};
  const weekSeries13 = stats ? Object.fromEntries(stats.movingAverageTrend13.map((p) => [p.week_label, p.avg])) : {};
  const monthSeriesAvg = monthly ? Object.fromEntries(monthly.months.map((m) => [m.monthName, m.avgScore])) : {};
  const monthSeries3Mo = monthly
    ? Object.fromEntries(monthly.months.filter((m) => m.threeMonthAvg !== null).map((m) => [m.monthName, m.threeMonthAvg]))
    : {};
  const monthYear = monthly && monthly.months.length > 0 ? monthly.months[monthly.months.length - 1].monthKey.split('-')[0] : null;

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
                  small chart sitting below Weekly Trend/Monthly Log. Full
                  52-week x-axis (weekYear), matching the spreadsheet
                  reference's own span — weeks with no entry are simply
                  absent from the line, never a fake 0. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
                <div style={sectionLabelStyle}>Momentum</div>
                <span style={{ fontSize: font.size.xs, color: color.muted }}>({weekYear} — full year)</span>
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
                    <TrendChart
                      labels={weekLabels}
                      seriesA={weekSeries4}
                      seriesB={weekSeries13}
                      labelA="4-week moving average"
                      labelB="13-week (~3 month) moving average"
                    />
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

                  {/* Chart added alongside the existing table (table stays,
                      per the ask — this supplements it, per your reference's
                      second chart). Same full-year, gap-aware TrendChart as
                      Momentum above; months with no logged weeks are simply
                      absent from the line, not a fake 0. */}
                  <div style={{ background: color.card, border: `1px solid ${color.lifeFormulaBorder}`, borderRadius: radius.lg, padding: space[4], marginBottom: space[3] }}>
                    <TrendChart
                      labels={MONTH_NAMES}
                      seriesA={monthSeriesAvg}
                      seriesB={monthSeries3Mo}
                      labelA={`Monthly L(t)${monthYear ? ` (${monthYear})` : ''}`}
                      labelB="3-month moving average"
                    />
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
