// CalendarView — month grid that GROUPS the shared instances by scheduled_date
// (CLAUDE.md: calendar = group by scheduled_date). Prev/next/today nav. Click
// a chip to toggle done/todo. Drag a chip to a new day to reschedule it, or
// reorder within a day — a SECOND DndContext over the exact same
// lib/dragAndDrop.js logic WeekBoardView uses (see that module; the decision
// logic is not duplicated here, only the key->items state shape and the grid
// rendering are calendar-specific).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCorners } from '@dnd-kit/core';
import { fetchInstances, setInstanceStatus } from '@/lib/data';
import { todayStr, addDays } from '@/lib/dates';
import { useDragSensors, handleSharedDragEnd } from '@/lib/dragAndDrop';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import CalendarDayCell from './CalendarDayCell';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

// All day-strings for the month grid (full leading/trailing weeks).
function buildGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStart = addDays(`${year}-${pad(month + 1)}-01`, -firstWeekday);
  return Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));
}

// Calendar keys are always plain date strings — no Inbox equivalent, so this
// is the identity function (the board's version maps its Inbox key to null).
function keyToScheduledDate(key) {
  return key;
}

export default function CalendarView() {
  const { version, refresh } = useRefresh();
  const today = todayStr();
  const [{ year, month }, setYm] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [itemsByDate, setItemsByDate] = useState({});
  const [error, setError] = useState(null);

  const days = useMemo(() => buildGrid(year, month), [year, month]);
  const from = days[0];
  const to = days[days.length - 1];

  const load = useCallback(async () => {
    setError(null);
    try {
      const instances = await fetchInstances({ from, to });
      const next = {};
      for (const inst of instances) {
        if (!next[inst.scheduled_date]) next[inst.scheduled_date] = [];
        next[inst.scheduled_date].push(inst);
      }
      setItemsByDate(next);
    } catch (e) {
      setError(e.message);
    }
    // version triggers a refetch on any mutation from any view/sidebar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, version]);

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

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToday = () => {
    const now = new Date();
    setYm({ year: now.getFullYear(), month: now.getMonth() });
  };

  const sensors = useDragSensors();
  const handleDragEnd = (event) =>
    handleSharedDragEnd({
      event,
      itemsByKey: itemsByDate,
      keyToScheduledDate,
      setItemsByKey: setItemsByDate,
      refresh,
      setError,
    });

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const navBtn = { ...buttonSecondary, padding: `${space[1]} ${space[3]}` };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.text }}>
          {monthLabel}
        </div>
        <div style={{ display: 'flex', gap: space[1], marginLeft: 'auto' }}>
          <button style={navBtn} onClick={() => shiftMonth(-1)}>
            Prev
          </button>
          <button style={navBtn} onClick={goToday}>
            Today
          </button>
          <button style={navBtn} onClick={() => shiftMonth(1)}>
            Next
          </button>
        </div>
      </div>

      {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div style={{ border: border.default, borderRadius: radius.lg, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                style={{
                  padding: space[2],
                  fontSize: font.size.xs,
                  fontWeight: font.weight.medium,
                  color: color.textMuted,
                  background: color.bgSubtle,
                  borderBottom: border.default,
                  borderRight: i < 6 ? border.default : border.none,
                  textAlign: 'center',
                }}
              >
                {w}
              </div>
            ))}

            {days.map((day, i) => {
              const inMonth = Number(day.split('-')[1]) === month + 1;
              const isToday = day === today;
              const dayNum = Number(day.split('-')[2]);
              const isLastRow = i >= days.length - 7;
              const isLastCol = i % 7 === 6;
              return (
                <CalendarDayCell
                  key={day}
                  dateStr={day}
                  dayNum={dayNum}
                  inMonth={inMonth}
                  isToday={isToday}
                  items={itemsByDate[day] || []}
                  isLastRow={isLastRow}
                  isLastCol={isLastCol}
                  onToggleStatus={onToggleStatus}
                />
              );
            })}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
