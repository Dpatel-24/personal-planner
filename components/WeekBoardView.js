// WeekBoardView — v2 board: Inbox (no scheduled_date) plus Mon-Sun from
// lib/board-queries.js's getWeekDates(). Today's column merges same-day
// instances with the rollover set (earlier, still-'todo' instances) via
// getColumnInstances(date, isToday); rolled-over cards carry a computed
// is_overdue flag, not a DB column.
//
// Drag-and-drop (@dnd-kit): scoped to one-off tasks (template_id null) and
// already-overridden recurring instances (is_override true) — those persist
// directly on drop via lib/data.js's moveInstance (position within a column;
// scheduled_date + position across columns, null scheduled_date for Inbox).
// Recurring, non-override cards still render as draggable (per spec) but on
// drop we only console.log and leave state/DB untouched — the this/this+
// future/all modal routing for those is a follow-up (v2 decision log).
//
// Clicking a card (no pointer movement) still opens the same EditModal the
// sidebar uses (the v1 edit flow) — see the PointerSensor's activation
// distance below and WeekBoardCard's click/drag split.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { getWeekDates, getInboxInstances, getColumnInstances } from '@/lib/board-queries';
import { setInstanceStatus, moveInstance } from '@/lib/data';
import { color, space, font } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import WeekBoardColumn from './WeekBoardColumn';
import EditModal from './EditModal';

const INBOX_KEY = 'inbox';

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

// Reindex a column's items to sequential 0..n-1 positions.
function reindex(list) {
  return list.map((item, idx) => ({ ...item, position: idx }));
}

export default function WeekBoardView() {
  const { version, refresh } = useRefresh();
  const [refDate, setRefDate] = useState(() => new Date());
  const [itemsByColumn, setItemsByColumn] = useState({});
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
      const next = { [INBOX_KEY]: inboxData };
      week.forEach((d, i) => {
        next[toDateStr(d)] = colData[i];
      });
      setItemsByColumn(next);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeInstance = active.data.current?.instance;
    const sourceColumnKey = active.data.current?.columnKey;
    const destColumnKey = over.data.current?.columnKey ?? String(over.id);
    if (!activeInstance || !sourceColumnKey) return;

    // Recurring, non-override: looks draggable, but drops need the
    // this/this+future/all modal — not wired yet. No state or DB change.
    const isRecurringNonOverride = !!activeInstance.template_id && !activeInstance.is_override;
    if (isRecurringNonOverride) {
      console.log('recurring drag: needs modal, wiring next step');
      return;
    }

    const sourceList = [...(itemsByColumn[sourceColumnKey] || [])];
    const sourceIndex = sourceList.findIndex((i) => i.id === active.id);
    if (sourceIndex === -1) return;

    let writes;
    let nextState;

    if (sourceColumnKey === destColumnKey) {
      if (active.id === over.id) return; // dropped on itself, no-op
      const overIndex = sourceList.findIndex((i) => i.id === over.id);
      const targetIndex = overIndex === -1 ? sourceList.length - 1 : overIndex;
      const reordered = reindex(arrayMove(sourceList, sourceIndex, targetIndex));
      writes = reordered.map((item) => ({ id: item.id, patch: { position: item.position } }));
      nextState = { ...itemsByColumn, [sourceColumnKey]: reordered };
    } else {
      const moved = sourceList[sourceIndex];
      const remainingSource = reindex(sourceList.filter((i) => i.id !== active.id));

      const destList = [...(itemsByColumn[destColumnKey] || [])];
      const overIndex = destList.findIndex((i) => i.id === over.id);
      const insertAt = overIndex === -1 ? destList.length : overIndex;
      const movedScheduledDate = destColumnKey === INBOX_KEY ? null : destColumnKey;
      const movedItem = { ...moved, scheduled_date: movedScheduledDate, is_overdue: false };
      const newDest = [...destList];
      newDest.splice(insertAt, 0, movedItem);
      const reindexedDest = reindex(newDest);

      writes = [
        ...remainingSource.map((item) => ({ id: item.id, patch: { position: item.position } })),
        ...reindexedDest.map((item) => ({
          id: item.id,
          patch:
            item.id === movedItem.id
              ? { position: item.position, scheduledDate: movedScheduledDate }
              : { position: item.position },
        })),
      ];
      nextState = {
        ...itemsByColumn,
        [sourceColumnKey]: remainingSource,
        [destColumnKey]: reindexedDest,
      };
    }

    // Optimistic UI update, then persist. Only after every write has actually
    // completed do we call refresh() — which re-fetches from the DB and
    // replaces this optimistic state with the true persisted state (or, on
    // error, discards it and resyncs to what's really in the DB).
    setItemsByColumn(nextState);
    try {
      await Promise.all(writes.map((w) => moveInstance(w.id, w.patch)));
      refresh();
    } catch (e) {
      setError(e.message);
      refresh();
    }
  };

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

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: space[3], overflowX: 'auto', paddingBottom: space[2] }}>
          <WeekBoardColumn
            columnKey={INBOX_KEY}
            title="Inbox"
            items={itemsByColumn[INBOX_KEY] || []}
            isInbox
            onToggleStatus={onToggleStatus}
            onEdit={setEditing}
          />
          {week.map((d) => {
            const dateStr = toDateStr(d);
            return (
              <WeekBoardColumn
                key={dateStr}
                columnKey={dateStr}
                title={dayHeaderLabel(d)}
                items={itemsByColumn[dateStr] || []}
                isToday={dateStr === todayStr}
                onToggleStatus={onToggleStatus}
                onEdit={setEditing}
              />
            );
          })}
        </div>
      </DndContext>

      {editing && <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
