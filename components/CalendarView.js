// CalendarView — month grid that GROUPS the shared instances by scheduled_date
// (CLAUDE.md: calendar = group by scheduled_date). Prev/next/today nav.
// Click-to-edit matches the board: a chip's checkbox toggles done/todo, and
// clicking the rest of the chip opens the same EditModal (v1 edit flow).
// Drag a chip to a new day to reschedule it, or reorder within a day — a
// SECOND DndContext over the exact same lib/dragAndDrop.js logic
// WeekBoardView uses (see that module; the decision logic is not duplicated
// here, only the key->items state shape and the grid rendering are
// calendar-specific).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { fetchInstances, setInstanceStatus } from '@/lib/data';
import { getTags } from '@/lib/tag-queries';
import { getWeekSprintsInRange } from '@/lib/sprint-queries';
import { todayStr, addDays } from '@/lib/dates';
import { useDragSensors, handleSharedDragEnd, useDragOverlayState, dragCollisionDetection } from '@/lib/dragAndDrop';
import { useIsMobile } from '@/lib/useIsMobile';
import { getTagCardStyle } from '@/lib/tag-styles';
import { isLifeFormulaEntryTask } from '@/lib/lifeFormulaLink';
import { color, space, radius, border, font, elevation } from '@/lib/tokens';
import { buttonSecondary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import CalendarDayCell from './CalendarDayCell';
import EditModal from './EditModal';
import TagFilterDropdown from './TagFilterDropdown';

// Monday-first, matching Board's own Mon-Sun week (lib/board-queries.js's
// getWeekDates()) — the two views used to disagree (this grid was
// Sunday-first), which miscategorized which week a Board-set sprint focus
// belonged to whenever it landed on this grid's row. Both views now agree
// on what "a week" is.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');

// All day-strings for the month grid (full leading/trailing weeks).
function buildGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // Sun=0..Sat=6 (native JS)
  // Days since the PRECEDING Monday — same conversion lib/board-queries.js's
  // getWeekDates() uses ((ref.getDay() + 6) % 7), so both views place the
  // 1st of the month, and every day after it, in identically-anchored weeks.
  const daysSinceMonday = (firstWeekday + 6) % 7;
  const totalCells = Math.ceil((daysSinceMonday + daysInMonth) / 7) * 7;
  const gridStart = addDays(`${year}-${pad(month + 1)}-01`, -daysSinceMonday);
  return Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));
}

// Calendar keys are always plain date strings — no Inbox equivalent, so this
// is the identity function (the board's version maps its Inbox key to null).
function keyToScheduledDate(key) {
  return key;
}

export default function CalendarView() {
  const router = useRouter();
  const { version, refresh } = useRefresh();
  const today = todayStr();
  const [{ year, month }, setYm] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [itemsByDate, setItemsByDate] = useState({});
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  // Same special-case routing as WeekBoardView — see lib/lifeFormulaLink.js.
  const handleEdit = (instance) => {
    if (isLifeFormulaEntryTask(instance)) {
      router.push('/life-formula');
      return;
    }
    setEditing(instance);
  };
  // Tag filter: a SET of selected tag IDS (empty = no filtering). This
  // filters what's RENDERED per day, not itemsByDate itself — drag-and-drop
  // always operates on the full, unfiltered state so hidden items never get
  // lost or corrupted while the filter is on. availableTags is the global
  // list of tag rows (across the whole DB, not just this month) for the
  // dropdown.
  const [selectedTags, setSelectedTags] = useState(() => new Set());
  const [availableTags, setAvailableTags] = useState([]);

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

  // Sprint history — one row per week_sprints row whose week_start falls
  // anywhere in this grid. `from`/`to` are the grid's own first/last cell
  // (a Sunday and a Saturday respectively, per buildGrid's Sun=0 week
  // convention) — every week-row's own Monday necessarily falls inside that
  // range, so no separate Monday-only bounds computation is needed here.
  // Keyed on version too, same as `load` above, so setting a sprint on the
  // Board shows up here without a manual reload.
  const [sprintsByWeek, setSprintsByWeek] = useState({});
  useEffect(() => {
    getWeekSprintsInRange(from, to)
      .then(setSprintsByWeek)
      .catch((e) => setError(e.message));
  }, [from, to, version]);

  // Refetch the global tag list whenever data changes (version), so a
  // newly-created tag shows up in the dropdown without a full page reload.
  useEffect(() => {
    getTags()
      .then(setAvailableTags)
      .catch((e) => setError(e.message));
  }, [version]);

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

  const isMobile = useIsMobile();
  const sensors = useDragSensors(isMobile);
  const { activeInstance, onDragStart, clearActiveInstance } = useDragOverlayState();
  const handleDragEnd = (event) => {
    clearActiveInstance();
    return handleSharedDragEnd({
      event,
      itemsByKey: itemsByDate,
      keyToScheduledDate,
      setItemsByKey: setItemsByDate,
      refresh,
      setError,
    });
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const navBtn = { ...buttonSecondary, padding: `${space[1]} ${space[3]}` };

  // Month/year dropdown: generate last 12 months and next 24 months
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthOptions = [];
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    const start = y === currentYear - 1 ? currentMonth : 0;
    const end = y === currentYear + 2 ? currentMonth : 11;
    for (let m = start; m <= end; m++) {
      const d = new Date(y, m, 1);
      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      monthOptions.push({ year: y, month: m, label });
    }
  }

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
        <select
          value={`${year}-${month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-');
            setYm({ year: parseInt(y), month: parseInt(m) });
          }}
          style={{
            fontSize: font.size.md,
            fontWeight: font.weight.semibold,
            color: color.text,
            background: color.bg,
            border: `1px solid ${color.textMuted}`,
            borderRadius: `${radius.md}`,
            padding: `${space[1]} ${space[2]}`,
            cursor: 'pointer',
          }}
        >
          {monthOptions.map((opt) => (
            <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
              {opt.label}
            </option>
          ))}
        </select>
        <TagFilterDropdown tags={availableTags} selected={selectedTags} onChange={setSelectedTags} />
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

      <DndContext
        sensors={sensors}
        collisionDetection={dragCollisionDetection}
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={clearActiveInstance}
      >
        <div style={{ border: border.default, borderRadius: radius.lg, overflow: 'hidden' }}>
          {/* minmax(0, 1fr), not plain 1fr — a bare 1fr track won't shrink
              below its content's min-content width, so on a narrow (phone)
              screen the grid silently overflows and clips the last column
              (Saturday) instead of actually compressing all 7 evenly. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
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

            {/* Each week-row is now THREE stacked pieces, in this order:
                (1) 7 date-number badges, (2) one optional full-width sprint
                chip, (3) 7 task cells (CalendarDayCell). Splitting date and
                tasks apart (previously welded into one CalendarDayCell) is
                what makes room to slot the sprint chip between them —
                "underneath the date, above the tasks," not trailing after
                the week like a banner. Chunking `days` (a flat array) into
                week-sized slices here, rather than computing everything
                inline in one pass, is what makes it possible to render each
                week's 3 pieces as 3 separate loops without re-deriving which
                week a given day belongs to each time. */}
            {Array.from({ length: days.length / 7 }, (_, weekIdx) => days.slice(weekIdx * 7, weekIdx * 7 + 7)).map(
              (week, weekIdx) => {
                const isLastRow = weekIdx === days.length / 7 - 1;
                // Grid is Monday-first (see buildGrid above) — week[0] IS
                // that row's own Monday already, no offset math needed.
                const weekMonday = week[0];
                const weekFocus = sprintsByWeek[weekMonday];

                return (
                  <Fragment key={weekMonday}>
                    {week.map((day, col) => {
                      const inMonth = Number(day.split('-')[1]) === month + 1;
                      const isToday = day === today;
                      const dayNum = Number(day.split('-')[2]);
                      const isLastCol = col === 6;
                      return (
                        <div
                          key={`hdr-${day}`}
                          style={{
                            padding: `${space[1]} ${space[1]} 0`,
                            background: inMonth ? color.bg : color.bgSubtle,
                            borderRight: isLastCol ? border.none : border.default,
                            // Deliberately NO borderBottom here — this row
                            // reads as connected to the sprint chip/tasks
                            // below it, not a separate divider row. The
                            // week's own bottom edge is drawn by the task
                            // cells further down (see CalendarDayCell).
                            boxSizing: 'border-box',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              minWidth: 20,
                              textAlign: 'center',
                              fontSize: font.size.xs,
                              fontWeight: isToday ? font.weight.semibold : font.weight.normal,
                              color: isToday ? color.navyOn : inMonth ? color.text : color.textSubtle,
                              background: isToday ? color.navy : 'transparent',
                              borderRadius: radius.full,
                              padding: `0 ${space[1]}`,
                            }}
                          >
                            {dayNum}
                          </span>
                        </div>
                      );
                    })}

                    {weekFocus && (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          display: 'flex',
                          alignItems: 'center',
                          gap: space[1],
                          margin: `2px ${space[1]}`,
                          // Same padding/font scale as CalendarChip itself
                          // (1px vertical, fontSize.xs) — "same size as a
                          // task card... thin," not a padded banner.
                          padding: `1px ${space[1]}`,
                          background: 'rgba(217, 119, 6, 0.12)', // color.warning at 12% — same tint CalendarChip's own tag tint uses
                          borderRadius: radius.sm, // same radius CalendarChip uses — reads as a chip stretched across the week
                        }}
                      >
                        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.warning, flexShrink: 0 }}>
                          Sprint:
                        </span>
                        <span
                          style={{
                            fontSize: font.size.xs,
                            color: color.text,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {weekFocus}
                        </span>
                      </div>
                    )}

                    {week.map((day, col) => {
                      const inMonth = Number(day.split('-')[1]) === month + 1;
                      const isLastCol = col === 6;
                      const dayItems = itemsByDate[day] || [];
                      return (
                        <CalendarDayCell
                          key={day}
                          dateStr={day}
                          inMonth={inMonth}
                          items={
                            selectedTags.size > 0
                              ? dayItems.filter((i) => i.tag_id && selectedTags.has(i.tag_id))
                              : dayItems
                          }
                          isLastRow={isLastRow}
                          isLastCol={isLastCol}
                          onToggleStatus={onToggleStatus}
                          onEdit={handleEdit}
                        />
                      );
                    })}
                  </Fragment>
                );
              }
            )}
          </div>
        </div>

        <DragOverlay>
          {activeInstance ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                background: activeInstance.tag ? undefined : color.bgMuted,
                ...getTagCardStyle(activeInstance.tag),
                borderRadius: radius.sm,
                padding: `1px ${space[1]}`,
                boxShadow: elevation.dropdown,
                cursor: 'grabbing',
                maxWidth: 160,
              }}
            >
              {activeInstance.tag && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: radius.full,
                    background: activeInstance.tag.color || color.accent,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: font.size.xs,
                  color: color.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeInstance.title || '(untitled)'}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing && <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
