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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCorners } from '@dnd-kit/core';
import { getWeekDates, getInboxInstances, getColumnInstances } from '@/lib/board-queries';
import { setInstanceStatus } from '@/lib/data';
import { useDragSensors, handleSharedDragEnd } from '@/lib/dragAndDrop';
import { useIsMobile } from '@/lib/useIsMobile';
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

  const sensors = useDragSensors();
  const isMobile = useIsMobile();

  // The 7 day-columns live in their own scroll region (Inbox stays pinned,
  // static, to its left on desktop — a standard laptop width can't fit all 7
  // at once alongside Inbox and the sidebar, so this lets you page through
  // them; on mobile Inbox joins the same scroll strip as the first card
  // instead, since a pinned column plus a sliver of scrollable space doesn't
  // work on a phone-width screen). Scroll amount is the container's own
  // width, not a fixed pixel constant, so it's correct at any column width.
  const daysScrollRef = useRef(null);
  const scrollDays = (direction) => {
    const el = daysScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  // Board's Inbox key maps to a null scheduled_date; every other key is
  // already a date string. See lib/dragAndDrop.js for the shared logic.
  const keyToScheduledDate = (key) => (key === INBOX_KEY ? null : key);

  const handleDragEnd = (event) =>
    handleSharedDragEnd({
      event,
      itemsByKey: itemsByColumn,
      keyToScheduledDate,
      setItemsByKey: setItemsByColumn,
      refresh,
      setError,
    });

  const navBtn = { ...buttonSecondary, padding: `${space[1]} ${space[3]}` };
  const dayScrollBtn = {
    ...buttonSecondary,
    padding: `${space[1]} ${space[2]}`,
    fontWeight: font.weight.semibold,
    lineHeight: font.lineHeight.tight,
  };

  if (loading) return <div style={textMuted}>Loading…</div>;

  const inboxColumn = (
    <WeekBoardColumn
      columnKey={INBOX_KEY}
      title="Inbox"
      items={itemsByColumn[INBOX_KEY] || []}
      isInbox
      onToggleStatus={onToggleStatus}
      onEdit={setEditing}
      onCreated={refresh}
    />
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space[2],
          marginBottom: space[4],
        }}
      >
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
        <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', minWidth: 0 }}>
          {/* Desktop: Inbox stays static, outside the horizontal scroll
              region. Mobile: no room for a pinned column beside a sliver of
              scroll space, so Inbox instead becomes the first card inside
              the same scroll strip as the 7 days (see below). */}
          {!isMobile && <div style={{ flexShrink: 0 }}>{inboxColumn}</div>}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
              <button style={dayScrollBtn} onClick={() => scrollDays(-1)} aria-label="Scroll days left">
                ‹
              </button>
              <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: color.textMuted }}>
                Week
              </span>
              <button style={dayScrollBtn} onClick={() => scrollDays(1)} aria-label="Scroll days right">
                ›
              </button>
            </div>
            <div
              ref={daysScrollRef}
              className="scrollbar-hidden"
              style={{ display: 'flex', gap: space[3], overflowX: 'auto', paddingBottom: space[2] }}
            >
              {isMobile && inboxColumn}
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
                    onCreated={refresh}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </DndContext>

      {editing && <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
