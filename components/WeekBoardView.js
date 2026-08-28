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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { getWeekDates, getInboxInstances, getColumnInstances } from '@/lib/board-queries';
import { setInstanceStatus } from '@/lib/data';
import { useDragSensors, handleSharedDragEnd, useDragOverlayState, dragCollisionDetection } from '@/lib/dragAndDrop';
import { useIsMobile } from '@/lib/useIsMobile';
import { getTagCardStyle } from '@/lib/tag-styles';
import { isLifeFormulaEntryTask } from '@/lib/lifeFormulaLink';
import { color, space, radius, font, elevation } from '@/lib/tokens';
import { card as cardStyle, buttonSecondary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import WeekBoardColumn from './WeekBoardColumn';
import WeekSprintBar from './WeekSprintBar';
import EditModal from './EditModal';
import FocusModeView from './FocusModeView';
import DailyPlanningView from './DailyPlanningView';

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
  const router = useRouter();
  const { version, refresh } = useRefresh();
  const [refDate, setRefDate] = useState(() => new Date());
  const [itemsByColumn, setItemsByColumn] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  // 'board' | 'focus' | 'planning' — Focus Mode/Daily Planning (Steps 3-5)
  // toggle a view state on this SAME screen, not a separate route. Owned
  // here (not lifted to pages/index.js) since the Focus/Daily Planning
  // buttons live in this component's own week bar and only ever replace
  // this component's own rendered content.
  const [mode, setMode] = useState('board');

  // The one recurring "Life Formula weekly entry" task routes straight to
  // its own form (pages/life-formula.js) instead of the generic EditModal —
  // see lib/lifeFormulaLink.js for how it's identified.
  const handleEdit = (instance) => {
    if (isLifeFormulaEntryTask(instance)) {
      router.push('/life-formula');
      return;
    }
    setEditing(instance);
  };

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

  const isMobile = useIsMobile();
  const sensors = useDragSensors(isMobile);
  const { activeInstance, onDragStart, clearActiveInstance } = useDragOverlayState();

  // The 7 day-columns live in their own scroll region (Inbox stays pinned,
  // static, to its left on desktop — a standard laptop width can't fit all 7
  // at once alongside Inbox and the sidebar, so this lets you page through
  // them; on mobile Inbox joins the same scroll strip as the first card
  // instead, since a pinned column plus a sliver of scrollable space doesn't
  // work on a phone-width screen). Plain native horizontal scroll/swipe on
  // this container is the only way to page through days now — the explicit
  // ‹ Week › scroll-nav buttons that used to sit above it were removed as
  // redundant (the scroll itself already does the job) and that slot now
  // holds the WeekSprintBar instead.
  const daysScrollRef = useRef(null);

  // Center today's column in the day-strip the FIRST time it's on screen —
  // explicitly first-load only (not on every "This week" click), per what
  // was asked. hasCenteredOnLoadRef never resets, so this fires at most
  // once per mount regardless of how many times `loading`/`isCurrentWeek`
  // flip afterward (a later refresh()-triggered reload must NOT re-snap the
  // scroll position out from under someone mid-scroll).
  //
  // useLayoutEffect, not useEffect: runs before the browser paints, so there
  // is no visible one-frame flash of the un-centered (scrollLeft: 0) layout
  // before it snaps to center.
  const hasCenteredOnLoadRef = useRef(false);
  useLayoutEffect(() => {
    if (hasCenteredOnLoadRef.current || loading || !isCurrentWeek) return;
    const container = daysScrollRef.current;
    const todayEl = container?.querySelector('[data-today="true"]');
    if (!container || !todayEl) return;

    // getBoundingClientRect(), not offsetLeft — offsetLeft is relative to
    // the nearest POSITIONED ancestor, which may not be this scroll
    // container at all, and would silently give a wrong offset here.
    const containerRect = container.getBoundingClientRect();
    const todayRect = todayEl.getBoundingClientRect();
    const target =
      container.scrollLeft +
      (todayRect.left - containerRect.left) -
      (container.clientWidth - todayRect.width) / 2;

    // No `behavior: 'smooth'` — this is establishing the INITIAL position,
    // not a user-triggered navigation, so it should never be seen animating.
    // Native scrollLeft clamps automatically to [0, scrollWidth -
    // clientWidth], which is exactly what gives Mon/Tue (not enough
    // columns to the left to actually center) and Sun (not enough to the
    // right) their correct, un-special-cased "pinned to the near edge"
    // behavior for free.
    container.scrollLeft = target;
    hasCenteredOnLoadRef.current = true;
  }, [loading, isCurrentWeek]);

  // Board's Inbox key maps to a null scheduled_date; every other key is
  // already a date string. See lib/dragAndDrop.js for the shared logic.
  const keyToScheduledDate = (key) => (key === INBOX_KEY ? null : key);

  const handleDragEnd = (event) => {
    clearActiveInstance();
    return handleSharedDragEnd({
      event,
      itemsByKey: itemsByColumn,
      keyToScheduledDate,
      setItemsByKey: setItemsByColumn,
      refresh,
      setError,
    });
  };

  const navBtn = { ...buttonSecondary, padding: `${space[1]} ${space[3]}` };

  if (mode === 'focus') {
    return <FocusModeView onExit={() => setMode('board')} />;
  }
  if (mode === 'planning') {
    return <DailyPlanningView onClose={() => setMode('board')} />;
  }

  if (loading) return <div style={textMuted}>Loading…</div>;

  const inboxColumn = (
    <WeekBoardColumn
      columnKey={INBOX_KEY}
      title="Inbox"
      items={itemsByColumn[INBOX_KEY] || []}
      isInbox
      onToggleStatus={onToggleStatus}
      onEdit={handleEdit}
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
          {/* Daily Planning, then Focus — both left of Prev, in that order,
              per the ask. Same navBtn style as Prev/This week/Next/Focus,
              no new button style introduced. */}
          <button style={navBtn} onClick={() => setMode('planning')}>
            Daily Planning
          </button>
          <button style={navBtn} onClick={() => setMode('focus')}>
            Focus
          </button>
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

      <DndContext
        sensors={sensors}
        collisionDetection={dragCollisionDetection}
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={clearActiveInstance}
      >
        <div style={{ display: 'flex', gap: space[3], alignItems: 'stretch', minWidth: 0 }}>
          {/* Desktop: Inbox stays static, outside the horizontal scroll
              region. Mobile: no room for a pinned column beside a sliver of
              scroll space, so Inbox instead becomes the first card inside
              the same scroll strip as the 7 days (see below).
              No extra wrapper div here — WeekBoardColumn's own root
              (.week-column) already carries flexShrink:0. An intermediate
              non-flex wrapper would stretch to match the row's height (from
              this row's alignItems:stretch) but NOT pass that height down
              to its own child, leaving the actual column, and therefore its
              droppable region, sized to its own content again — the same
              short-column drop bug the day columns already had fixed. */}
          {!isMobile && inboxColumn}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* WeekSprintBar carries its own marginBottom — no extra
                wrapper spacing needed here. */}
            <WeekSprintBar weekStartStr={toDateStr(week[0])} />
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
                    onEdit={handleEdit}
                    onCreated={refresh}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeInstance ? (
            <div
              style={{
                ...cardStyle,
                ...getTagCardStyle(activeInstance.tag),
                padding: space[3],
                boxShadow: elevation.dropdown,
                cursor: 'grabbing',
                maxWidth: 240,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
                {activeInstance.tag && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: radius.full,
                      background: activeInstance.tag.color || color.accent,
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ fontSize: font.size.md, color: color.text, wordBreak: 'break-word' }}>
                  {activeInstance.title || '(untitled)'}
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing && <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
