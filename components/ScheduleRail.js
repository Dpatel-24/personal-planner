// ScheduleRail — Schedule Rail V5 (Tier 1 + Tier 2). Fixed-hour vertical
// grid with a day's tasks positioned by scheduled_start/
// estimated_duration_minutes. THE Today UI surface on both platforms — no
// separate sidebar/list component exists anymore (both were deleted once
// this fully replaced them):
//
// - Desktop (`standalone=false`, the default): a narrow companion column,
//   used only where a caller explicitly wants the bare rail without its own
//   header/add-task form.
// - Both the desktop Today sidebar and mobile's Today tab pass
//   `standalone` — the rail owns its own header/add-task form/recurring
//   button in that mode (see pages/index.js).
//
// `dateStr` (optional, defaults to real today via todayStr()) is what makes
// this reusable for a day other than today — added for Daily Planning's
// tomorrow-preview rail (components/DailyPlanningView.js). Real today keeps
// using fetchInstancesForDateWithRollover (rollover only makes sense for a
// day that's actually happening); any other date uses fetchPlannedSchedule
// instead, which skips the rollover merge but still auto-stacks via the same
// assignTodaySchedule. `headerLabel` (defaults to "Today") is the standalone
// header's title text, so a non-today rail doesn't lie about which day it is.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  fetchInstancesForDateWithRollover,
  fetchPlannedSchedule,
  createOneOffTask,
  setInstanceStatus,
  updateEstimatedDuration,
  updateScheduledStart,
  deleteInstance,
} from '@/lib/data';
import { cascadeLater } from '@/lib/scheduling';
import { formatDuration } from '@/lib/timer-queries';
import { todayStr, humanDate } from '@/lib/dates';
import { isLifeFormulaEntryTask } from '@/lib/lifeFormulaLink';
import { color, space, radius, border, font } from '@/lib/tokens';
import { input as inputStyle, buttonPrimary, buttonSecondary, buttonGhost, heading, textMuted } from '@/lib/components';
import { getTagCardStyle } from '@/lib/tag-styles';
import { useRefresh } from './RefreshContext';
import RecurringCreateModal from './RecurringCreateModal';
import EditModal from './EditModal';

const RAIL_START_HOUR = 6; // 6:00 AM
const RAIL_END_HOUR = 24; // midnight (exclusive top of the last hour row, i.e. the grid's bottom edge lands exactly at midnight) — grid's minimum height; real content can extend past this if tasks run later, see railHeight below. Mirrored by lib/scheduling.js's CASCADE_END_OF_DAY_HOUR — keep the two in sync, see that constant's own comment.
export const PIXELS_PER_MINUTE = 1; // 60px per hour row
const HOUR_HEIGHT = PIXELS_PER_MINUTE * 60;
const RAIL_WIDTH = 200; // desktop companion-column width; standalone (mobile) ignores this and goes full width
const MIN_BLOCK_HEIGHT = 18; // a 15-min block (15px) is otherwise too short to hold readable text
const RESIZE_STEP_MINUTES = 15; // shared grid — both the resize handle and the +/- stepper below snap/step by this, so a value set from either entry point lands on the same grid
const RESIZE_SNAP_PX = RESIZE_STEP_MINUTES * PIXELS_PER_MINUTE;
const MIN_DURATION_MINUTES = 15;

function formatHourLabel(hour) {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

// RailBlock — one task's positioned block, local to this file (not a shared
// extraction — a new component built for this feature, not the same thing
// as "extracting shared checkbox/timer/tag-dot subcomponents", still
// out-of-scope tech debt). Two duration-editing entry points, ONE write
// path — both call the parent's onDurationChange(id, minutes), which is the
// same function regardless of which entry point triggered it, so there is
// no separate/local-only state to drift out of sync with the DB:
// - Drag-resize: pointer-capture drag on the bottom-edge handle gives LIVE
//   visual feedback (local dragHeight state) without writing to the DB on
//   every pixel of movement — only on pointer-up does it call
//   onDurationChange once with the final, 15-min-snapped duration.
// - +/- stepper: writes immediately on click, no Save-button gate, same
//   pattern this app's other inline-edit controls (tag/checklist pickers)
//   already use.
// - Whole-block move (rail_drag_cascade_plan.md Step 3): a dedicated grip
//   handle ("≡"), NOT the whole block body — Step 2 had it on the outer
//   div as an interim measure explicitly flagged as needing this exact
//   replacement. The grip is its own small element with its own
//   pointerdown/move/up + stopPropagation()/touchAction:'none', the same
//   established pattern the resize handle already uses — a genuinely
//   distinct hit area, so a plain click anywhere else on the card (title,
//   tag, empty space) still opens EditModal exactly as before, with no
//   suppression logic needed (unlike Step 2's interim version): the grip's
//   own stopPropagation on click means a drag-and-release on the grip
//   itself never reaches the outer div's onClick at all, same as the
//   resize handle already doesn't.
//   Every pointer-move past a small movement threshold calls
//   onMovePreview(id, proposedStart) — the PARENT runs cascadeLater()
//   against its in-memory task list and re-renders every affected block at
//   its would-be position; nothing here touches the DB. On pointer-up, the
//   LAST proposedStart computed during the drag (read from a ref, not
//   React state, for the same closure-staleness reason the resize handle's
//   own commit already established) is handed to onMoveCommit(id,
//   proposedStart) — the parent re-runs the EXACT SAME cascadeLater() call
//   the live preview already used and batches the result to the DB, so
//   what was previewed is structurally guaranteed to be what persists, not
//   a second derivation that could drift from it.
function RailBlock({ instance, top, durationMin, onToggleStatus, onEdit, onDurationChange, onMovePreview, onMoveEnd, onMoveCommit, onDelete }) {
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
    // Pinned tasks (Morning Chain/Evening Winddown) never resize — their
    // duration/position is re-clamped every load regardless
    // (assignTodaySchedule, lib/scheduling.js), so a resize here would just
    // get silently overwritten on next load anyway. Bail before starting
    // the drag at all, same "no drag handle, graceful no-op" treatment the
    // board's own pinned cards get.
    if (instance.pinned_position) return;
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
      onDurationChange(instance.id, finalMinutes);
    }
  };

  // Whole-block move, via the dedicated grip handle below — NOT the outer
  // div (see the component comment above for why that changed from Step 2).
  // moveDragRef, not state: the live preview itself lives in the PARENT (a
  // move can shift SIBLING blocks too, which this component has no way to
  // render on its own) — this ref only tracks the gesture and the latest
  // computed proposedStart, the value onGripPointerUp commits with.
  const moveDragRef = useRef(null); // { startY, startScheduledStart, moved, currentProposedStart } while dragging, else null

  // Set right before onGripPointerUp commits an actual move (moved === true)
  // that started on the MIDDLE zone (tag/title/tracked-time), not the grip.
  // That zone is also the tap target for opening EditModal (via the outer
  // div's own onClick, unchanged) — a plain tap must still open it exactly
  // as before, but the click event that trails a real drag's pointerup must
  // NOT also open EditModal right after the drop. The middle zone's own
  // onClick below checks this flag and swallows exactly that one click.
  const justDraggedRef = useRef(false);

  const onGripPointerDown = (e) => {
    // Same pinned bail as the resize handle above — a pinned task's
    // position is re-clamped every load regardless, so whole-block move is
    // a no-op here too, not just visually locked.
    if (instance.pinned_position) return;
    e.stopPropagation(); // don't also trigger the block's own onClick (opens EditModal) — same as the resize handle
    e.preventDefault();
    moveDragRef.current = { startY: e.clientY, startScheduledStart: instance.scheduled_start, moved: false, currentProposedStart: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onGripPointerMove = (e) => {
    if (!moveDragRef.current) return;
    const deltaY = e.clientY - moveDragRef.current.startY;
    if (!moveDragRef.current.moved && Math.abs(deltaY) < 3) return; // small jitter before a real drag starts shouldn't trigger a cascade computation
    moveDragRef.current.moved = true;

    // Snaps to the SAME 15-min grid the resize handle already uses — every
    // scheduled_start in this app is already on that grid, so a move that
    // landed off it would be a new, inconsistent kind of value.
    const deltaMinutes = Math.round(deltaY / PIXELS_PER_MINUTE / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
    const proposedStart = new Date(
      new Date(moveDragRef.current.startScheduledStart).getTime() + deltaMinutes * 60000
    );
    moveDragRef.current.currentProposedStart = proposedStart;
    onMovePreview(instance.id, proposedStart);
  };

  const onGripPointerUp = () => {
    if (!moveDragRef.current) return;
    const { moved, currentProposedStart } = moveDragRef.current;
    moveDragRef.current = null;
    if (moved && currentProposedStart) {
      // Only the middle zone's trailing click needs suppressing (the grip's
      // own onClick already unconditionally stops propagation below,
      // whether this gesture moved or not) — harmless to always set this,
      // since the middle zone's onClick is the only place that reads it.
      justDraggedRef.current = true;
      // onMoveCommit owns clearing the preview itself, AFTER it has applied
      // the result to local task state — calling onMoveEnd() here first
      // would clear the preview one tick before the optimistic update lands,
      // producing exactly the revert-then-jump flash this was written to
      // avoid (see onMoveCommit's own comment in the parent).
      onMoveCommit(instance.id, currentProposedStart);
    } else {
      // A plain tap (never crossed the movement threshold) commits nothing —
      // same as Step 2, nothing to persist for a gesture that never moved.
      onMoveEnd();
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
        // V6 (exploring): grey surface fallback blended blocks together with
        // no clear separation — trying navy tint + a navy outline instead
        // (same idea as the pre-V6 always-on accent tint, just navy). Tagged
        // instances still get their own tag color via getTagCardStyle.
        background: instance.tag ? undefined : color.navySoft,
        ...getTagCardStyle(instance.tag),
        border: `1px solid ${color.navy}`,
        opacity: done ? 0.6 : 1,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={() => onEdit(instance)}
    >
      {/* Drag-move grip — a small dedicated affordance, kept even though the
          middle zone right below is now ALSO grabbable (widening the actual
          hit area was the point; the icon still signals "grab here" at a
          glance). Distinct from the resize handle (bottom 6px strip). Its
          own stopPropagation()/touchAction:'none' means neither the card's
          click-to-edit nor the browser's native touch-scroll ever fights
          this gesture.
          Pinned instances (Morning Chain/Evening Winddown) never drag —
          onGripPointerDown already bails immediately for them — so this
          space is otherwise dead weight on a pinned block. Swapped for a
          delete button there instead: a pinned routine left unchecked
          rolls over and duplicates itself alongside the next day's own
          fresh instance (see onDelete's own comment, above), and this is
          the one place that duplicate is actually visible, so it's the
          most direct spot to clear it from. */}
      {instance.pinned_position ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // don't also open EditModal
            onDelete(instance.id);
          }}
          aria-label="Delete this instance"
          title="Delete this instance"
          style={{
            flexShrink: 0,
            width: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: color.danger,
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      ) : (
        <div
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to move"
          title="Drag to move"
          style={{
            flexShrink: 0,
            width: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            color: color.textMuted,
            fontSize: 10,
            lineHeight: 1,
            touchAction: 'none', // same reasoning as the resize handle — without this, touch-drag fights the browser's native scroll gesture
          }}
        >
          ≡
        </div>
      )}
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggleStatus(instance.id, done ? 'todo' : 'done')}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ flexShrink: 0 }}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      {/* Grabbable middle zone (tag dot + title + tracked-time) — extends
          the drag-to-move hit area from the checkbox out to the duration
          stepper below, not just the small grip icon, per user request. A
          plain tap still opens EditModal exactly as before (this zone
          doesn't stopPropagation on pointerdown, so the outer div's own
          onClick still fires normally for a non-drag tap) — only the click
          that trails an ACTUAL drag gets swallowed here, via
          justDraggedRef, so a drop doesn't also pop the edit modal open. */}
      <div
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onClick={(e) => {
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            e.stopPropagation();
          }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: space[1],
          height: '100%',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
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
            // V6: done state is the block's own opacity dim (above) + this
            // strikethrough — title color stays constant either way.
            color: color.inkV6,
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
      </div>
      {/* Duration stepper — immediate write, no Save-button gate, calls the
          SAME onDurationChange the resize handle below calls. This is the
          restored replacement for the deleted sidebar's stepper; it does
          not introduce a second write path. */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onDurationChange(instance.id, Math.max(MIN_DURATION_MINUTES, durationMin - RESIZE_STEP_MINUTES))}
          disabled={durationMin <= MIN_DURATION_MINUTES}
          aria-label="Decrease duration"
          title={`${durationMin}m`}
          style={{ ...buttonGhost, padding: 0, width: 14, height: 14, fontSize: 10, lineHeight: 1, minWidth: 0 }}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onDurationChange(instance.id, durationMin + RESIZE_STEP_MINUTES)}
          aria-label="Increase duration"
          title={`${durationMin}m`}
          style={{ ...buttonGhost, padding: 0, width: 14, height: 14, fontSize: 10, lineHeight: 1, minWidth: 0 }}
        >
          +
        </button>
      </div>
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
          touchAction: 'none', // without this, touch-drag fights the browser's native scroll gesture instead of starting the resize
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

export default function ScheduleRail({ standalone = false, dateStr, headerLabel = 'Today' }) {
  const router = useRouter();
  const { version, refresh } = useRefresh();
  const today = dateStr || todayStr();
  // Rollover only applies to the app's own built-in "today" rail (no
  // dateStr passed at all) — NOT decided by comparing the resolved date
  // string to todayStr(), which briefly gives the wrong answer: between
  // midnight and 4 AM, getLogicalToday() (lib/dates.js) still treats
  // "today" as the previous calendar day, so Daily Planning's
  // logicalTomorrow (= getLogicalToday()+1) is EXACTLY today's real
  // calendar date during that window. A string-equality check would then
  // wrongly route Daily Planning's tomorrow rail through the rollover
  // fetch, pulling in yesterday's still-open carryover onto what's
  // actually a future-day preview.
  const isRealToday = dateStr === undefined;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [showRecurring, setShowRecurring] = useState(false);
  const [editing, setEditing] = useState(null);
  // Live whole-block-drag preview. null when no drag is in progress;
  // otherwise a Map(id -> ISO string) of every task cascadeLater() says
  // would move if the drag were dropped right now, INCLUDING the dragged
  // task's own new position. Rendering-only — the actual DB write happens
  // in onMoveCommit below, via a separate cascadeLater() call at drop time,
  // not from this state.
  const [dragPreview, setDragPreview] = useState(null);
  // Current-time indicator. Ticks on a plain interval rather than once at
  // mount — the rail is a long-lived panel (no unmount/remount as the hour
  // changes), so without this the line would freeze at whatever time the
  // page happened to load. A 60s tick is plenty for a line whose own
  // granularity is 1px/minute; no need for anything finer.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks(await (isRealToday ? fetchInstancesForDateWithRollover(today) : fetchPlannedSchedule(today)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, isRealToday, version]);

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

  // Manual delete for a single instance — surfaced on pinned blocks only
  // (RailBlock, below). Pinned recurring routines (Morning Chain/Evening
  // Winddown) that go incomplete roll over into the next day's rail
  // alongside that day's own fresh instance (CLAUDE.md: "rollover is a
  // computed query, not a mutation" — nothing else auto-resolves this), so
  // an unchecked routine visually duplicates itself every day it's missed.
  // deleteInstance (lib/data.js) removes just that one row; safe to do here
  // specifically because lib/recurrence.js's generateInstances/
  // expandOccurrences never generates before `today` (windowStart is
  // clamped to max(template.start_date, today)), so a deleted PAST instance
  // is never recreated by a later regeneration pass. EditModal's own
  // Delete button intentionally stays hidden for recurring instances
  // (isRecurring guard) since deleting an occurrence there isn't scoped to
  // "the stale rollover copy" the way this one is — this is a narrower,
  // purpose-built affordance, not a general recurring-instance delete.
  const onDelete = async (id) => {
    try {
      await deleteInstance(id);
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

  // The ONE function that ever persists a duration change — lib/data.js's
  // updateEstimatedDuration — regardless of which RailBlock entry point
  // triggered it (drag-resize handle or the +/- stepper). Passed down as a
  // single prop so both entry points share the same write path, not two
  // separate ones that could drift out of sync.
  const onDurationChange = async (id, minutes) => {
    try {
      await updateEstimatedDuration(id, minutes);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  // Called on every qualifying pointer-move during a whole-block drag (see
  // RailBlock's onGripPointerMove). Runs cascadeLater() against the CURRENT
  // in-memory `tasks` array only — no DB read, no DB write. A
  // CascadeEndOfDayError (or any other failure) here just means "don't
  // update the preview this tick" rather than crashing the drag —
  // onMoveCommit below is what decides how an actual DROP past the
  // boundary surfaces to the user, a different question from what a
  // mid-drag preview tick should do when it happens to compute an invalid
  // position.
  const onMovePreview = (movedId, proposedStart) => {
    try {
      const result = cascadeLater(tasks, movedId, proposedStart);
      setDragPreview(new Map(result.map((r) => [r.id, r.scheduled_start])));
    } catch (e) {
      console.error('[ScheduleRail] cascade preview skipped:', e.message);
    }
  };

  // Called on every pointer-up regardless of whether anything actually
  // moved — always clears the live preview immediately, giving instant
  // visual feedback rather than waiting on onMoveCommit's own async
  // refresh() to bring the real values back (same brief "revert then
  // re-settle" beat the resize handle's dragHeight clear already has).
  const onMoveEnd = () => {
    setDragPreview(null);
  };

  // Step 3: the ACTUAL commit — runs the EXACT SAME cascadeLater() call
  // onMovePreview already used for the live preview (not a second
  // derivation that could drift from what was shown), then batches every
  // changed row into the DB via Promise.all of individual
  // updateScheduledStart() calls — this app's established multi-row-write
  // pattern (see lib/scheduling.js's assignTodaySchedule, same reasoning:
  // Supabase has no true bulk upsert-by-id-list for arbitrary per-row
  // values without a temp table). A CascadeEndOfDayError here (an ACTUAL
  // drop, not just a preview tick) surfaces via the existing error banner
  // and writes nothing — the drop is cancelled, the block reverts to its
  // real position, exactly the "stop and report, don't truncate or wrap"
  // behavior lib/scheduling.js's own contract already promises.
  //
  // Optimistic local update BEFORE the network write (latency fix, post-
  // Step-4): apply cascadeLater's result straight onto `tasks` state and
  // clear the preview in the SAME tick, so the blocks land at their final
  // position immediately with no visible revert. Persist in the background,
  // then refresh() to reconcile with the DB as source of truth — mirrors
  // lib/dragAndDrop.js's handleSharedDragEnd (Board's own drag-and-drop),
  // which already does update-local-state-first/persist-after/refresh-to-
  // reconcile. Before this, clearing the preview and only THEN awaiting the
  // write + a full fetchInstancesForDateWithRollover() refetch meant every
  // drop flashed back to the stale pre-drag position for the whole
  // round-trip. On write failure, refresh() (in the catch) discards the
  // optimistic state and re-syncs to what's really in the DB — same
  // success/failure symmetry Board's own version already has.
  const onMoveCommit = async (movedId, proposedStart) => {
    let result;
    try {
      result = cascadeLater(tasks, movedId, proposedStart);
    } catch (e) {
      setError(e.message);
      setDragPreview(null);
      return;
    }
    const changedById = new Map(result.map((r) => [r.id, r.scheduled_start]));
    setTasks((prev) =>
      prev.map((t) => (changedById.has(t.id) ? { ...t, scheduled_start: changedById.get(t.id) } : t))
    );
    setDragPreview(null);
    try {
      await Promise.all(result.map(({ id, scheduled_start }) => updateScheduledStart(id, scheduled_start)));
      refresh();
    } catch (e) {
      setError(e.message);
      refresh(); // discard the optimistic state, re-sync to the true DB values
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

  // Current-time line position. Works unchanged for a non-today `dateStr`
  // too — `now` (the real clock) simply never falls within a future day's
  // railStart..railHeight window, so showNowLine naturally stays false for
  // Daily Planning's tomorrow rail without any extra date-equality check.
  // Hidden
  // outside the rendered grid (before 6 AM or past the bottom of railHeight,
  // e.g. very early morning) rather than clamped to an edge — a line
  // sitting at the top or bottom implying "now" when it isn't there yet/
  // anymore would be misleading.
  const nowMinutes = minutesFromRailStart(now, railStart);
  const showNowLine = nowMinutes >= 0 && nowMinutes <= railHeight / PIXELS_PER_MINUTE;

  const headerBlock = standalone && (
    <>
      <div style={{ padding: space[4], borderBottom: border.default }}>
        <h2 style={heading}>{headerLabel}</h2>
        <div style={{ ...textMuted, marginTop: space[1] }}>{humanDate(today)}</div>
      </div>
      <div style={{ padding: space[4], borderBottom: border.default }}>
        <form onSubmit={add} style={{ display: 'flex', gap: space[2] }}>
          <input
            style={inputStyle}
            placeholder={isRealToday ? 'Add a task for today' : `Add a task for ${headerLabel.toLowerCase()}`}
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
              // dragPreview only ever contains entries that actually
              // change (cascadeLater's own contract) — a task not in it
              // renders at its real, DB-backed scheduled_start, same as
              // when no drag is happening at all.
              const effectiveStart = dragPreview?.get(instance.id) ?? instance.scheduled_start;
              const startMin = minutesFromRailStart(new Date(effectiveStart), railStart);
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
                  onDurationChange={onDurationChange}
                  onMovePreview={onMovePreview}
                  onMoveEnd={onMoveEnd}
                  onMoveCommit={onMoveCommit}
                  onDelete={onDelete}
                />
              );
            })}

            {/* Current-time line — painted AFTER the task blocks (later in
                DOM order), so it stays visible crossing over a block rather
                than being covered by one. pointerEvents:'none' so it's
                purely visual, never intercepts a click/drag meant for
                whatever block it happens to be sitting on. */}
            {showNowLine && (
              <div
                style={{
                  position: 'absolute',
                  top: nowMinutes * PIXELS_PER_MINUTE,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: color.navy,
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: -4,
                    top: -3,
                    width: 8,
                    height: 8,
                    borderRadius: radius.full,
                    background: color.navy,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </div>
  );
}
