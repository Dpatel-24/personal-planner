// TimerBar — the one persistent, cross-view piece of this feature (CLAUDE.md:
// "visible outside any single view"). Lives in the app shell (pages/index.js),
// not inside WeekBoardView/CalendarView, so it survives switching between
// Board/Calendar tabs. Renders nothing when no timer is active; otherwise the
// running task's title, a live elapsed-time counter (ticks locally off
// started_at, no polling needed for the tick itself), and a Stop button.
import { useEffect, useState } from 'react';
import { useTimer } from './TimerContext';
import { useRefresh } from './RefreshContext';
import { stopTimer, formatDuration } from '@/lib/timer-queries';
import { color, space, border, font } from '@/lib/tokens';
import { buttonSecondary } from '@/lib/components';

export default function TimerBar() {
  const { activeTimer, refreshTimer } = useTimer();
  const { refresh } = useRefresh();
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeTimer) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  if (!activeTimer) return null;

  const stop = async () => {
    setBusy(true);
    try {
      await stopTimer();
      refreshTimer();
      // Also nudge the board/calendar's own fetch (RefreshContext) — a
      // stopped session finalizes a time_entries row, which changes that
      // card's summed tracked_seconds; card data won't pick that up on its
      // own since it isn't subscribed to TimerContext's version.
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        padding: `${space[2]} ${space[6]}`,
        background: color.accentSubtle,
        borderBottom: border.default,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: font.size.sm, color: color.text }}>
        Timing <strong>{activeTimer.instanceTitle}</strong>
      </span>
      <span
        style={{
          fontSize: font.size.sm,
          color: color.textMuted,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatDuration((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000)}
      </span>
      <button
        type="button"
        style={{ ...buttonSecondary, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, marginLeft: 'auto' }}
        onClick={stop}
        disabled={busy}
      >
        Stop
      </button>
    </div>
  );
}
