// DayAgendaRail — a read/display vertical timeline for one day's tasks.
// Step 3 of the Focus Mode/Daily Planning build, deliberately built as a
// standalone, reusable component (not inlined into FocusModeView): Step 5's
// Daily Planning screen reuses this EXACT component in read-only preview
// mode with a different data source (tomorrow's tasks) instead of a second,
// copy-pasted rail. This component never fetches or mutates anything
// itself — it's handed `instances` (already-resolved task_instances rows,
// same shape every other view uses) and, when interactive, a small set of
// callbacks. All actual persistence (toggle status, start/stop timer)
// happens in the CALLER via the app's existing lib/data.js / lib/timer-
// queries.js functions — this file never duplicates that logic.
import { useEffect, useState } from 'react';
import { color, space, radius, font } from '@/lib/tokens';
import { formatDuration } from '@/lib/timer-queries';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Live-ticking elapsed time for the one active-timer entry — same
// "re-render every second while this is the active one" pattern already
// used by WeekBoardCard.js/CalendarChip.js's own isTiming display, just
// pulled into its own tiny component since only ONE rail entry (at most)
// ever needs to tick.
function LiveElapsed({ startedAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(seconds)}</span>;
}

export default function DayAgendaRail({
  instances,
  activeTimer = null,
  readOnly = false,
  onToggleStatus,
  onStartTimer,
  onStopTimer,
}) {
  if (!instances || instances.length === 0) {
    return (
      <div style={{ fontSize: font.size.sm, color: color.mutedText, padding: `${space[4]} 0` }}>
        Nothing scheduled.
      </div>
    );
  }

  // Untimed group first (top), then timed entries in time order — per the
  // ask, not interleaved.
  const untimed = instances.filter((i) => !i.scheduled_start);
  const timed = [...instances.filter((i) => i.scheduled_start)].sort(
    (a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start)
  );
  const ordered = [...untimed, ...timed];

  return (
    <div>
      {ordered.map((item, i) => {
        const isDone = item.status === 'done';
        const isActive = !readOnly && activeTimer && activeTimer.instance_id === item.id && !isDone;
        const timeLabel = item.scheduled_start ? formatTime(item.scheduled_start) : 'Anytime';
        const dotColor = isDone ? color.stateMomentum : isActive ? color.navy : color.mutedFaint;

        return (
          <div key={item.id} style={{ display: 'flex', gap: space[3] }}>
            <div
              style={{
                width: 64,
                flexShrink: 0,
                textAlign: 'right',
                fontSize: font.size.xs,
                color: color.mutedText,
                paddingTop: 3,
              }}
            >
              {timeLabel}
            </div>

            <div style={{ width: 14, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: radius.full,
                  background: isDone || isActive ? dotColor : color.paperV6,
                  border: isDone || isActive ? 'none' : `2px solid ${color.mutedFaint}`,
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
              {i < ordered.length - 1 && (
                <div style={{ flex: 1, width: 1, background: color.borderSubtle, minHeight: space[6] }} />
              )}
            </div>

            {isActive ? (
              <div
                style={{
                  flex: 1,
                  marginBottom: space[3],
                  padding: space[3],
                  background: color.navySoft,
                  border: `1px solid ${color.navy}`,
                  borderRadius: radius.md,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space[2],
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: font.size.xs, color: color.navy, fontWeight: font.weight.bold, marginBottom: 2 }}>
                    IN PROGRESS
                  </div>
                  <div
                    style={{
                      fontSize: font.size.md,
                      fontWeight: font.weight.semibold,
                      color: color.inkV6,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.title || '(untitled)'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexShrink: 0 }}>
                  <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
                    <LiveElapsed startedAt={activeTimer.started_at} />
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onStopTimer?.()}
                      style={{
                        background: color.navy,
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: radius.sm,
                        padding: `${space[1]} ${space[2]}`,
                        fontSize: font.size.xs,
                        fontWeight: font.weight.medium,
                        cursor: 'pointer',
                      }}
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, marginBottom: space[3], display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                {!readOnly && (
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => onToggleStatus?.(item.id, isDone ? 'todo' : 'done')}
                    style={{ flexShrink: 0 }}
                    aria-label={isDone ? 'Mark not done' : 'Mark done'}
                  />
                )}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: font.size.sm,
                    color: isDone ? color.mutedText : color.inkV6,
                    textDecoration: isDone ? 'line-through' : 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.title || '(untitled)'}
                </div>
                {item.tag && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: radius.full,
                        background: item.tag.color || color.navy,
                      }}
                    />
                    <span style={{ fontSize: font.size.xs, color: color.mutedText }}>{item.tag.name}</span>
                  </div>
                )}
                {!readOnly && !isDone && !isActive && onStartTimer && (
                  <button
                    type="button"
                    onClick={() => onStartTimer(item.id)}
                    title="Start timer"
                    aria-label={`Start timer for ${item.title}`}
                    style={{
                      flexShrink: 0,
                      background: 'none',
                      border: `1px solid ${color.mutedFaint}`,
                      borderRadius: radius.full,
                      width: 20,
                      height: 20,
                      color: color.mutedText,
                      fontSize: 10,
                      cursor: 'pointer',
                      lineHeight: 1,
                    }}
                  >
                    ▶
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
