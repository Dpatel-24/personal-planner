// ScheduleRail — Schedule Rail V5 (Tier 1 + Tier 2). Fixed-hour vertical
// grid with today's tasks positioned by scheduled_start/
// estimated_duration_minutes. Two contexts, one component:
//
// - Desktop (`standalone=false`, the default): a narrow companion column
//   next to DailySidebar's list — DailySidebar still owns the "Today"
//   header/add-task form/recurring button there.
// - Mobile (`standalone=true`): per explicit direction, the rail itself
//   IS the Today tab's content, replacing DailySidebar entirely — so in
//   this mode it also renders its own header/add-task form/recurring
//   button (duplicated from DailySidebar's JSX rather than extracted into
//   a shared subcomponent — consistent with this feature's own stated
//   scope: "extracting shared checkbox/timer/tag-dot subcomponents... is
//   flagged as future tech debt, not part of this feature").
//
// Independently fetches today's resolved instances via the same
// fetchInstancesForDateWithRollover() DailySidebar uses, subscribed to the
// same RefreshContext `version` — NOT prop-drilled from DailySidebar. This
// mirrors how Board/Calendar/Sidebar already stay in sync today (each
// fetches its own copy, all refresh() together), so checking a box here
// updates DailySidebar instantly and vice versa without any new coupling
// between the two components.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  fetchInstancesForDateWithRollover,
  createOneOffTask,
  setInstanceStatus,
  updateEstimatedDuration,
} from '@/lib/data';
import { formatDuration } from '@/lib/timer-queries';
import { todayStr, humanDate } from '@/lib/dates';
import { isLifeFormulaEntryTask } from '@/lib/lifeFormulaLink';
import { color, space, radius, border, font } from '@/lib/tokens';
import { input as inputStyle, buttonPrimary, buttonSecondary, heading, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import RecurringCreateModal from './RecurringCreateModal';
import EditModal from './EditModal';

const RAIL_START_HOUR = 6; // 6:00 AM
const RAIL_END_HOUR = 21; // 9:00 PM (exclusive top of the last hour row) — grid's minimum height; real content can extend past this if tasks run later, see railHeight below
export const PIXELS_PER_MINUTE = 1; // 60px per hour row
const HOUR_HEIGHT = PIXELS_PER_MINUTE * 60;
const RAIL_WIDTH = 200; // desktop companion-column width; standalone (mobile) ignores this and goes full width
const MIN_BLOCK_HEIGHT = 18; // a 15-min block (15px) is otherwise too short to hold readable text
const RESIZE_STEP_MINUTES = 15; // matches TaskRow's own stepper — a value set from either entry point lands on the same grid
const RESIZE_SNAP_PX = RESIZE_STEP_MINUTES * PIXELS_PER_MINUTE;
const MIN_DURATION_MINUTES = 15;

function formatHourLabel(hour) {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

// RailBlock — one task's positioned block, local to this file (not a shared
// extraction — a new component built for this feature, not the same thing
// as "extracting shared checkbox/timer/tag-dot subcomponents" the plan
// flagged as out-of-scope tech debt). Owns the drag-resize gesture: a
// pointer-capture drag on its bottom-edge handle gives LIVE visual feedback
// (local dragHeight state) without writing to the DB on every pixel of
// movement — only on pointer-up does it call onResizeCommit once with the
// final, 15-min-snapped duration. Reuses the exact touchAction:'none' +
// stopPropagation pattern TaskRow.js's own drag handling already
// established (see TaskRow.js:63), per the plan's explicit instruction to
// stay consistent with existing drag handling in this app.
function RailBlock({ instance, top, durationMin, onToggleStatus, onEdit, onResizeCommit }) {
  // Drag math is always computed against the TRUE duration-based height
  // (durationMin * PIXELS_PER_MINUTE), never the display-clamped height —
  // otherwise a short (e.g. 15-min, visually clamped to MIN_BLOCK_HEIGHT)
  // block would start every drag already a few px off-grid, throwing off
  // every snap computed from that point on. MIN_BLOCK_HEIGHT only affects
  // what's rendered, never the drag/snap arithmetic.
  const baseHeightPx = durationMin * PIXELS_PER_MINUTE;

  const [dragHeight, setDragHeight] = useState(null); // null = not dragging; use baseHeightPx
  // The drag's live/final height lives in this ref, not just in
  // `dragHeight` state — onHandlePointerUp reads it from here, never from
  // the `dragHeight` closure, so it can't ever read a stale pre-update
  // value if pointerup fires before a pointermove's setState has re-
  // rendered this component (state updates are NOT guaranteed synchronous;
  // a ref write always is).
  const dragStateRef = useRef(null); // { startY, currentHeight } while dragging, else null

  const done = instance.status === 'done';
  const height = Math.max(dragHeight ?? baseHeightPx, MIN_BLOCK_HEIGHT);

  const onHandlePointerDown = (e) => {
    e.stopPropagation(); // don't also trigger the block's own onClick (opens EditModal)
    e.preventDefault();
    dragStateRef.current = { startY: e.clientY, currentHeight: baseHeightPx };
    e.target.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e) => {
    if (!dragStateRef.current) return;
    const deltaY = e.clientY - dragStateRef.current.startY;
    const rawHeight = baseHeightPx + deltaY;
    const minHeight = MIN_DURATION_MINUTES * PIXELS_PER_MINUTE;
    const snapped = Math.max(minHeight, Math.round(rawHeight / RESIZE_SNAP_PX) * RESIZE_SNAP_PX);
    dragStateRef.current.currentHeight = snapped;
    setDragHeight(snapped); // visual feedback only — the eventual commit reads the ref, not this
  };

  const onHandlePointerUp = () => {
    if (!dragStateRef.current) return;
    const finalHeight = dragStateRef.current.currentHeight;
    const finalMinutes = Math.round(finalHeight / PIXELS_PER_MINUTE);
    dragStateRef.current = null;
    setDragHeight(null);
    if (finalMinutes !== instance.estimated_duration_minutes) {
      onResizeCommit(instance.id, finalMinutes);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 48, // leaves room for the hour labels painted underneath
        right: 0,
        height,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: space[1],
        padding: `0 ${space[1]}`,
        borderRadius: radius.sm,
        background: done ? color.bgMuted : color.accentSubtle,
        border: `1px solid ${done ? color.border : color.accent}`,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={() => onEdit(instance)}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggleStatus(instance.id, done ? 'todo' : 'done')}
        onClick={(e) => e.stopPropagation()}
        style={{ flexShrink: 0 }}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      {instance.tag && (
        <span
          title={instance.tag.name}
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: radius.full,
            background: instance.tag.color || color.accent,
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: font.size.xs,
          color: done ? color.textMuted : color.text,
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={instance.title}
      >
        {instance.title || '(untitled)'}
      </span>
      {/* Read-only tracked time — timer start/stop is deliberately
          sidebar-only, matching WeekBoardCard/CalendarChip's existing
          convention. */}
      {instance.tracked_seconds > 0 && (
        <span style={{ fontSize: font.size.xs, color: color.textMuted, flexShrink: 0 }}>
          {formatDuration(instance.tracked_seconds)}
        </span>
      )}
      {/* Drag-resize handle — bottom 6px strip of the block. */}
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'ns-resize',
          touchAction: 'none', // same reasoning as TaskRow.js:63 — without this, touch-drag fights the browser's native scroll gesture
        }}
      />
    </div>
  );
}

// Minutes since RAIL_START_HOUR's midnight-relative start, for a Date. Can
// go negative (task scheduled before the grid's first hour) or past the
// grid's nominal end — both handled by the absolute-positioned block simply
// landing outside the rendered hour rows' visible range within the
// scrollable container, not clamped/hidden.
function minutesFromRailStart(date, railStart) {
  return (date.getTime() - railStart.getTime()) / 60000;
}

export default function ScheduleRail({ standalone = false }) {
  const router = useRouter();
  const { version, refresh } = useRefresh();
  const [today] = useState(todayStr);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [showRecurring, setShowRecurring] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks(await fetchInstancesForDateWithRollover(today));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, version]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEdit = (instance) => {
    if (isLifeFormulaEntryTask(instance)) {
      router.push('/life-formula');
      return;
    }
    setEditing(instance);
  };

  const onToggleStatus = async (id, status) => {
    try {
      await setInstanceStatus(id, status);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle('');
    try {
      await createOneOffTask({ title: t, scheduledDate: today });
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  // Same write path as TaskRow's own stepper (Step 7) — one function,
  // lib/data.js's updateEstimatedDuration, ever actually persists a
  // duration change, regardless of which entry point triggered it.
  const onResizeCommit = async (id, minutes) => {
    try {
      await updateEstimatedDuration(id, minutes);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const hours = Array.from({ length: RAIL_END_HOUR - RAIL_START_HOUR }, (_, i) => RAIL_START_HOUR + i);
  const railStart = new Date(); // placeholder default; real value computed below once `today` is known
  railStart.setFullYear(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  railStart.setHours(RAIL_START_HOUR, 0, 0, 0);

  const gridHeight = (RAIL_END_HOUR - RAIL_START_HOUR) * HOUR_HEIGHT;
  const scheduledTasks = tasks.filter((t) => t.scheduled_start);
  const latestEndMinutes = scheduledTasks.reduce((max, t) => {
    const startMin = minutesFromRailStart(new Date(t.scheduled_start), railStart);
    const endMin = startMin + (t.estimated_duration_minutes || 15);
    return Math.max(max, endMin);
  }, 0);
  // Real content can run past the nominal grid (e.g. a long backlog pushes
  // past 9 PM) — the rail's height grows to fit rather than clipping tasks.
  const railHeight = Math.max(gridHeight, latestEndMinutes * PIXELS_PER_MINUTE);

  const headerBlock = standalone && (
    <>
      <div style={{ padding: space[4], borderBottom: border.default }}>
        <h2 style={heading}>Today</h2>
        <div style={{ ...textMuted, marginTop: space[1] }}>{humanDate(today)}</div>
      </div>
      <div style={{ padding: space[4], borderBottom: border.default }}>
        <form onSubmit={add} style={{ display: 'flex', gap: space[2] }}>
          <input
            style={inputStyle}
            placeholder="Add a task for today"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" style={buttonPrimary}>
            Add
          </button>
        </form>
        <button
          type="button"
          style={{ ...buttonSecondary, width: '100%', marginTop: space[2] }}
          onClick={() => setShowRecurring(true)}
        >
          New recurring task
        </button>
      </div>
      {showRecurring && (
        <RecurringCreateModal onClose={() => setShowRecurring(false)} onCreated={refresh} />
      )}
    </>
  );

  return (
    <div
      style={{
        width: standalone ? '100%' : RAIL_WIDTH,
        flexShrink: 0,
        borderLeft: standalone ? border.none : border.default,
        background: color.bg,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {headerBlock}

      <div style={{ padding: space[3], borderBottom: border.default, flexShrink: 0 }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.text }}>
          Schedule
        </div>
      </div>

      {error && <div style={{ color: color.danger, padding: space[3] }}>{error}</div>}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ ...textMuted, padding: space[3] }}>Loading…</div>
        ) : (
          <div style={{ position: 'relative', height: railHeight, padding: `0 ${space[2]}` }}>
            {/* Hour grid lines — background layer, painted first so task
                blocks (absolute, painted after) sit visually on top. */}
            {hours.map((hour) => (
              <div
                key={hour}
                style={{
                  position: 'absolute',
                  top: (hour - RAIL_START_HOUR) * HOUR_HEIGHT,
                  left: 0,
                  right: 0,
                  height: HOUR_HEIGHT,
                  borderTop: border.default,
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ ...textMuted, fontSize: font.size.xs, paddingLeft: space[1] }}>
                  {formatHourLabel(hour)}
                </span>
              </div>
            ))}

            {scheduledTasks.map((instance) => {
              const startMin = minutesFromRailStart(new Date(instance.scheduled_start), railStart);
              const durationMin = instance.estimated_duration_minutes || 15;
              const top = startMin * PIXELS_PER_MINUTE;

              return (
                <RailBlock
                  key={instance.id}
                  instance={instance}
                  top={top}
                  durationMin={durationMin}
                  onToggleStatus={onToggleStatus}
                  onEdit={handleEdit}
                  onResizeCommit={onResizeCommit}
                />
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </div>
  );
}
