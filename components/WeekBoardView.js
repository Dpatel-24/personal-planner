// WeekBoardView — v2 board: replaces the v1 status-column board. 8 columns —
// Inbox (no scheduled_date) plus Mon-Sun from lib/board-queries.js's
// getWeekDates(). Today's column merges same-day instances with the rollover
// set (earlier, still-'todo' instances) via getColumnInstances(date, isToday);
// rolled-over cards carry a computed is_overdue flag, not a DB column.
// Layout/rendering only — no drag yet (that's the next pass). Clicking a card
// opens the same EditModal the sidebar uses (the v1 edit flow).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getWeekDates, getInboxInstances, getColumnInstances } from '@/lib/board-queries';
import { setInstanceStatus } from '@/lib/data';
import { color, space, font } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import WeekBoardColumn from './WeekBoardColumn';
import EditModal from './EditModal';

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "Mon Jul 13"
function dayHeaderLabel(date) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${weekday} ${monthDay}`;
}

function weekRangeLabel(week) {
  const start = week[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const end = week[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}

export default function WeekBoardView() {
  const { version, refresh } = useRefresh();
  const [refDate, setRefDate] = useState(() => new Date());
  const [inbox, setInbox] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const week = useMemo(() => getWeekDates(refDate), [refDate]);
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const isCurrentWeek = toDateStr(week[0]) === toDateStr(getWeekDates(new Date())[0]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [inboxData, ...colData] = await Promise.all([
        getInboxInstances(),
        ...week.map((d) => getColumnInstances(d, toDateStr(d) === todayStr)),
      ]);
      setInbox(inboxData);
      setColumns(
        week.map((d, i) => ({
          date: d,
          dateStr: toDateStr(d),
          isToday: toDateStr(d) === todayStr,
          items: colData[i],
        }))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // version triggers a refetch on any mutation from any view/sidebar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, todayStr, version]);

  useEffect(() => {
    load();
  }, [load]);

  const onToggleStatus = async (id, status) => {
    try {
      await setInstanceStatus(id, status);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const shiftWeek = (deltaWeeks) => {
    setRefDate((d) => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + deltaWeeks * 7);
      return nd;
    });
  };
  const goThisWeek = () => setRefDate(new Date());

  const navBtn = { ...buttonSecondary, padding: `${space[1]} ${space[3]}` };

  if (loading) return <div style={textMuted}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.text }}>
          Week of {weekRangeLabel(week)}
        </div>
        <div style={{ display: 'flex', gap: space[1], marginLeft: 'auto' }}>
          <button style={navBtn} onClick={() => shiftWeek(-1)}>
            Prev
          </button>
          <button style={navBtn} onClick={goThisWeek} disabled={isCurrentWeek}>
            This week
          </button>
          <button style={navBtn} onClick={() => shiftWeek(1)}>
            Next
          </button>
        </div>
      </div>

      {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

      <div style={{ display: 'flex', gap: space[3], overflowX: 'auto', paddingBottom: space[2] }}>
        <WeekBoardColumn
          title="Inbox"
          items={inbox}
          isInbox
          onToggleStatus={onToggleStatus}
          onEdit={setEditing}
        />
        {columns.map((col) => (
          <WeekBoardColumn
            key={col.dateStr}
            title={dayHeaderLabel(col.date)}
            items={col.items}
            isToday={col.isToday}
            onToggleStatus={onToggleStatus}
            onEdit={setEditing}
          />
        ))}
      </div>

      {editing && <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
