// DailyPlanningView — Step 5 of the Focus Mode/Daily Planning build,
// reworked (2026-08) to fix a reported bug and add real rail editing.
//
// Original shape: left builder pane (checkbox + drag-reorder lists) fed a
// `previewInstances` array into a READ-ONLY DayAgendaRail on the right.
// Bug: DayAgendaRail re-buckets/re-sorts whatever array it's given (pinned
// -> untimed -> timed-by-scheduled_start -> pinned), so a drag reorder
// involving any already-timed item, or a reorder across the Carried/
// Scheduled section boundary, never showed up in that "preview" even
// though the underlying state was correctly updating. Not a stale-state
// bug — a display component silently discarding caller order.
//
// Fix + feature ask: replace the read-only preview with the REAL
// interactive ScheduleRail (components/ScheduleRail.js — the one with
// drag-to-move/drag-to-resize, used on the board's own sidebar), pointed
// at tomorrow via its new `dateStr` prop instead of today. This removes
// the separate "preview order" concept entirely — the right pane always
// shows exactly what's in the DB, fetched fresh after every write, so
// there's nothing left to go stale.
//
// Data model (confirmed with user, no separate draft/staging table): every
// interaction here writes directly to the real task_instances rows
// immediately, same as ScheduleRail's own board-sidebar writes always
// have. Checking a Carried Over item, dragging it to reorder, or toggling
// the Already-on-Tomorrow defer checkbox all persist right away via the
// EXISTING overrideInstance (lib/data.js) — extended in the original Step
// 5 build to also accept an optional `position`, reused as-is here.
// overrideInstance, not moveInstance, specifically because both lists can
// include fresh, non-override recurring instances that moveInstance's own
// header comment says must not go through it — overrideInstance's
// is_override:true is what makes touching those safe (protects them from
// the next generateInstances() regeneration pass). See that function's own
// comment.
//
// All date logic goes through getLogicalToday() (lib/dates.js) — no direct
// `new Date()` today/tomorrow comparisons anywhere in this file.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchInstances, overrideInstance } from '@/lib/data';
import { getLogicalToday, addDays } from '@/lib/dates';
import { space, font, color, radius } from '@/lib/tokens';
import { buttonPrimary, textMuted } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import { useTimer } from './TimerContext';
import ScheduleRail from './ScheduleRail';

function formatHeaderDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

const TAG_STYLES = {
  carried: { bg: color.tagAdminSoft, fg: color.tagAdmin, label: 'Carried' },
  scheduled: { bg: color.navySoft, fg: color.navy, label: 'Scheduled' },
};

function SourceTag({ kind }) {
  const s = TAG_STYLES[kind];
  return (
    <span
      style={{
        flexShrink: 0,
        padding: `2px ${space[2]}`,
        borderRadius: radius.full,
        background: s.bg,
        color: s.fg,
        fontSize: font.size.xs,
        fontWeight: font.weight.medium,
      }}
    >
      {s.label}
    </span>
  );
}

// Shared row visuals — checkbox (default checked), title, source tag.
// Unchecked rows visibly gray out (opacity) so the roll-forward/defer
// decision is obvious on this screen, not a later surprise.
function RowBody({ row, kind, onToggle, dragHandle }) {
  return (
    <>
      {dragHandle}
      <input type="checkbox" checked={row.checked} onChange={() => onToggle(row.instance.id)} style={{ flexShrink: 0 }} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: font.size.sm,
          color: color.inkV6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {row.instance.title || '(untitled)'}
      </span>
      <SourceTag kind={kind} />
    </>
  );
}

const rowStyle = (checked, isDragging = false, extra = {}) => ({
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[2]} ${space[2]}`,
  borderRadius: radius.sm,
  opacity: isDragging ? 0.4 : checked ? 1 : 0.45,
  ...extra,
});

// Drag-sortable row — used by Carried Over, where reorder still drives the
// position Carried items land in on tomorrow's auto-stacked rail.
function SortableRow({ row, kind, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.instance.id });
  return (
    <div
      ref={setNodeRef}
      style={rowStyle(row.checked, isDragging, { transform: CSS.Transform.toString(transform), transition })}
    >
      <RowBody
        row={row}
        kind={kind}
        onToggle={onToggle}
        dragHandle={
          <span
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            style={{ cursor: 'grab', color: color.mutedFaint, fontSize: font.size.sm, flexShrink: 0, touchAction: 'none' }}
          >
            ⠿
          </span>
        }
      />
    </div>
  );
}

// Plain (non-draggable) row — used by Already on Tomorrow, whose own order
// no longer drives anything now that the right-pane rail positions those
// tasks by their real scheduled_start. No useSortable/dnd-kit involvement
// at all here, so this list needs no DndContext/SortableContext ancestor.
function PlainRow({ row, kind, onToggle }) {
  return (
    <div style={rowStyle(row.checked)}>
      <RowBody row={row} kind={kind} onToggle={onToggle} dragHandle={null} />
    </div>
  );
}

// sortable=true (Carried Over): wraps rows in DndContext/SortableContext so
// drag-reorder works, and onReorder is required. sortable=false (Already on
// Tomorrow): plain list, no drag machinery.
function PlanSection({ title, subtitle, rows, kind, onToggle, onReorder, sortable = true }) {
  const ids = rows.map((r) => r.instance.id);
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.instance.id === active.id);
    const newIndex = rows.findIndex((r) => r.instance.id === over.id);
    onReorder(arrayMove(rows, oldIndex, newIndex));
  };

  return (
    <div style={{ marginBottom: space[5] }}>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.mutedText, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: font.size.xs, color: color.mutedText, marginBottom: space[2] }}>{subtitle}</div>}
      {rows.length === 0 ? (
        <div style={{ fontSize: font.size.sm, color: color.mutedText, padding: `${space[1]} ${space[2]}` }}>None.</div>
      ) : sortable ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {rows.map((row) => (
              <SortableRow key={row.instance.id} row={row} kind={kind} onToggle={onToggle} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        rows.map((row) => <PlainRow key={row.instance.id} row={row} kind={kind} onToggle={onToggle} />)
      )}
    </div>
  );
}

export default function DailyPlanningView({ onClose }) {
  const logicalToday = getLogicalToday();
  const logicalTomorrow = useMemo(() => addDays(logicalToday, 1), [logicalToday]);
  const dayAfterTomorrow = useMemo(() => addDays(logicalToday, 2), [logicalToday]);

  const [carried, setCarried] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const { refresh: globalRefresh } = useRefresh();
  const { refreshTimer } = useTimer();

  // Shared write path for Carried Over: writes the WHOLE list's
  // scheduledDate + position in one pass. Checked rows get position 0..n in
  // current list order so ScheduleRail's auto-stack places them on
  // tomorrow's rail in that same order; unchecked rows get pushed to the
  // day after tomorrow, no position needed. Slight over-write (unchanged
  // rows get re-written too) is an accepted tradeoff at this app's
  // single-user scale, same reasoning already used elsewhere
  // (lib/board-queries.js) for per-row writes over a real bulk upsert.
  // globalRefresh() is what makes the right-pane ScheduleRail (subscribed
  // to the same RefreshContext version everywhere else in the app already
  // is) pick up the change immediately.
  //
  // Called from two places: (1) every toggle/reorder, which is the actual
  // fix for the reported bug — the "preview" is the same live rail every
  // other view already trusts, so a reorder shows up the moment it
  // happens, not a second sort order that could disagree with it; and (2)
  // Confirm, as a catch-all for whatever's currently in the list even if
  // the user touched nothing (everything defaults to checked:true — "carry
  // it all forward" — and with no separate draft table, that default has
  // to actually get written somewhere, not just displayed). Deliberately
  // NOT also run once automatically on load: doing so was tried and
  // reverted — it wrote every row to tomorrow before the user ever saw the
  // list, which immediately emptied Carried Over into the (non-sortable)
  // Already-on-Tomorrow section and left nothing left to actually drag.
  const syncCarried = async (rows) => {
    setError(null);
    try {
      let pos = 0;
      await Promise.all(
        rows.map((row) =>
          overrideInstance(row.instance.id, {
            scheduledDate: row.checked ? logicalTomorrow : dayAfterTomorrow,
            ...(row.checked ? { position: pos++ } : {}),
          })
        )
      );
      globalRefresh();
      refreshTimer();
    } catch (e) {
      setError(e.message);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [todayRows, tomorrowRows] = await Promise.all([
        fetchInstances({ from: logicalToday, to: logicalToday }),
        fetchInstances({ from: logicalTomorrow, to: logicalTomorrow }),
      ]);
      // Pinned tasks (Morning Chain/Evening Winddown) don't go through
      // triage here — they're structurally guaranteed on every day via
      // their own daily recurrence, not something to carry-over/check off
      // in this builder. Excluded from both lists; the right-pane rail
      // still shows them (it fetches tomorrow's full set on its own).
      setCarried(
        todayRows
          .filter((i) => i.status !== 'done' && !i.pinned_position)
          .map((instance) => ({ instance, checked: true }))
      );
      setScheduled(tomorrowRows.filter((i) => !i.pinned_position).map((instance) => ({ instance, checked: true })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [logicalToday, logicalTomorrow]);

  useEffect(() => {
    load();
  }, [load]);

  // Already on Tomorrow's own immediate-write toggle — no position/reorder
  // needed (order here no longer drives the rail's auto-stack the way
  // Carried Over's does, since these rows already have their own real
  // scheduled_start once on tomorrow's rail). Unchecking just defers the
  // task one more day; checking restores it to tomorrow.
  const toggleScheduled = async (id) => {
    const row = scheduled.find((r) => r.instance.id === id);
    if (!row) return;
    const nextChecked = !row.checked;
    setScheduled((prev) => prev.map((r) => (r.instance.id === id ? { ...r, checked: nextChecked } : r)));
    setError(null);
    try {
      await overrideInstance(id, { scheduledDate: nextChecked ? logicalTomorrow : dayAfterTomorrow });
      globalRefresh();
      refreshTimer();
    } catch (e) {
      setError(e.message);
    }
  };

  const onConfirm = async () => {
    setConfirming(true);
    // Catch-all write for whatever's currently in Carried Over — covers the
    // case where the user opened this view, left everything at its default
    // checked:true, and never touched a checkbox or drag (every OTHER
    // interaction already wrote immediately via syncCarried above, so this
    // is a no-op re-write for anything already synced, not a second write
    // path).
    await syncCarried(carried);
    setConfirming(false);
    onClose();
  };

  return (
    <div style={{ display: 'flex', gap: space[6] }}>
      <div style={{ flex: '1 1 380px', minWidth: 0, maxWidth: 480 }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.inkV6, marginBottom: 2 }}>
          What do you want to get done tomorrow?
        </div>
        <div style={{ fontSize: font.size.sm, color: color.mutedText, marginBottom: space[4] }}>
          {formatHeaderDate(logicalTomorrow)}
        </div>

        {error && <div style={{ color: color.danger, marginBottom: space[3], fontSize: font.size.sm }}>{error}</div>}

        {loading ? (
          <div style={textMuted}>Loading…</div>
        ) : (
          <>
            <PlanSection
              title="Carried Over"
              subtitle="from today"
              rows={carried}
              kind="carried"
              onToggle={(id) => {
                const next = carried.map((r) => (r.instance.id === id ? { ...r, checked: !r.checked } : r));
                setCarried(next);
                syncCarried(next);
              }}
              onReorder={(next) => {
                setCarried(next);
                syncCarried(next);
              }}
            />
            <PlanSection
              title="Already on Tomorrow"
              subtitle="uncheck to push to the day after"
              rows={scheduled}
              kind="scheduled"
              onToggle={toggleScheduled}
              sortable={false}
            />
          </>
        )}

        {/* Every toggle/reorder above already writes immediately — this is
            a catch-all for anything left untouched at its default (see
            onConfirm's own comment), not a batch-commit of pending local
            state. No separate Cancel: nothing here needs undoing by
            leaving — navigating away (e.g. the top nav's Calendar tab and
            back to Board) already unmounts this view and resets Daily
            Planning mode fresh next time it's opened. */}
        <button type="button" disabled={loading || confirming} style={buttonPrimary} onClick={onConfirm}>
          Confirm Tomorrow's Board
        </button>
      </div>

      <div style={{ flex: '1 1 380px', minWidth: 0, borderLeft: `1px solid ${color.borderSubtle}`, paddingLeft: space[6] }}>
        <ScheduleRail dateStr={logicalTomorrow} headerLabel="Tomorrow" standalone />
      </div>
    </div>
  );
}
