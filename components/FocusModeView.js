// FocusModeView — Step 3 of the Focus Mode/Daily Planning build. A
// single-day agenda for LOGICAL today (getLogicalToday(), lib/dates.js —
// Step 2), toggled in place of the week board (WeekBoardView owns the
// mode state; this never mounts as its own route). Purely a read/display
// view over existing data: fetches via lib/data.js's fetchTodayAndRollover
// (the exact merge fetchInstancesForDateWithRollover itself uses, minus
// its auto-stack side effect — see that function's own comment for why),
// and every mutation (toggle status, start/stop timer) calls the SAME
// lib/data.js / lib/timer-queries.js functions every other view already
// uses. No new task or timer logic lives here.
import { useCallback, useEffect, useState } from 'react';
import { fetchTodayAndRollover, setInstanceStatus } from '@/lib/data';
import { getLogicalToday } from '@/lib/dates';
import { startTimer, stopTimer } from '@/lib/timer-queries';
import { color, space, radius, font } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';
import { useTimer } from './TimerContext';
import { useRefresh } from './RefreshContext';
import DayAgendaRail from './DayAgendaRail';

function formatHeaderDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function FocusModeView({ onExit }) {
  const logicalToday = getLogicalToday();
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { activeTimer, refreshTimer } = useTimer();
  const { refresh: globalRefresh } = useRefresh();

  const load = useCallback(() => {
    setError(null);
    return fetchTodayAndRollover(logicalToday)
      .then(setInstances)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalToday]);

  useEffect(() => {
    load();
  }, [load]);

  const onToggleStatus = async (id, status) => {
    try {
      await setInstanceStatus(id, status);
      await load();
      globalRefresh();
      refreshTimer();
    } catch (e) {
      setError(e.message);
    }
  };

  const onStartTimer = async (id) => {
    try {
      await startTimer(id);
      refreshTimer();
    } catch (e) {
      setError(e.message);
    }
  };

  const onStopTimer = async () => {
    try {
      await stopTimer();
      refreshTimer();
      globalRefresh(); // a stopped session changes that card's tracked-time elsewhere too
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.inkV6 }}>
          {formatHeaderDate(logicalToday)}
        </div>
        <button type="button" style={buttonSecondary} onClick={onExit}>
          Exit Focus
        </button>
      </div>

      {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}
      {loading ? (
        <div style={textMuted}>Loading…</div>
      ) : (
        <DayAgendaRail
          instances={instances}
          activeTimer={activeTimer}
          onToggleStatus={onToggleStatus}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
        />
      )}
    </div>
  );
}
