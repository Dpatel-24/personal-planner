// CalendarView — month grid that GROUPS the shared instances by scheduled_date
// (CLAUDE.md: calendar = group by scheduled_date). Prev/next/today nav. Click a
// task chip to toggle done/todo. Reschedule (drag/move) is deferred to 2g.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchInstances, setInstanceStatus } from '@/lib/data';
import { todayStr, addDays } from '@/lib/dates';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';

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

export default function CalendarView() {
  const { version, refresh } = useRefresh();
  const today = todayStr();
  const [{ year, month }, setYm] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [instances, setInstances] = useState([]);
  const [error, setError] = useState(null);

  const days = useMemo(() => buildGrid(year, month), [year, month]);
  const from = days[0];
  const to = days[days.length - 1];

  const load = useCallback(async () => {
    setError(null);
    try {
      setInstances(await fetchInstances({ from, to }));
    } catch (e) {
      setError(e.message);
    }
  }, [from, to, version]);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const inst of instances) {
      if (!m.has(inst.scheduled_date)) m.set(inst.scheduled_date, []);
      m.get(inst.scheduled_date).push(inst);
    }
    return m;
  }, [instances]);

  const toggle = async (inst) => {
    try {
      await setInstanceStatus(inst.id, inst.status === 'done' ? 'todo' : 'done');
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
            const tasks = byDate.get(day) || [];
            const isLastRow = i >= days.length - 7;
            const isLastCol = i % 7 === 6;
            return (
              <div
                key={day}
                style={{
                  minHeight: 104,
                  padding: space[1],
                  background: inMonth ? color.bg : color.bgSubtle,
                  borderBottom: isLastRow ? border.none : border.default,
                  borderRight: isLastCol ? border.none : border.default,
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    minWidth: 20,
                    textAlign: 'center',
                    fontSize: font.size.xs,
                    fontWeight: isToday ? font.weight.semibold : font.weight.normal,
                    color: isToday ? color.white : inMonth ? color.text : color.textSubtle,
                    background: isToday ? color.accent : 'transparent',
                    borderRadius: radius.full,
                    padding: `0 ${space[1]}`,
                    marginBottom: space[1],
                  }}
                >
                  {dayNum}
                </div>
                {tasks.slice(0, 3).map((t) => {
                  const done = t.status === 'done';
                  const skipped = t.status === 'skipped';
                  return (
                    <div
                      key={t.id}
                      onClick={() => toggle(t)}
                      title={t.title || '(untitled)'}
                      style={{
                        fontSize: font.size.xs,
                        color: done || skipped ? color.textMuted : color.text,
                        textDecoration: done ? 'line-through' : 'none',
                        fontStyle: skipped ? 'italic' : 'normal',
                        background: color.bgMuted,
                        borderRadius: radius.sm,
                        padding: `1px ${space[1]}`,
                        marginBottom: 2,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t.title || '(untitled)'}
                    </div>
                  );
                })}
                {tasks.length > 3 && (
                  <div style={{ fontSize: font.size.xs, color: color.textMuted, paddingLeft: space[1] }}>
                    +{tasks.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
