// DailyPlanningView — Step 5 of the Focus Mode/Daily Planning build.
// Two-pane screen: left is an editable builder list for logical-tomorrow's
// board (Carried Over from today + Already on Tomorrow), right is a live,
// read-only preview via DayAgendaRail (Step 3's component, reused exactly
// — not rebuilt) reflecting the left pane's checked state in real time.
//
// All date logic goes through getLogicalToday() (lib/dates.js, Step 2) —
// no direct `new Date()` today/tomorrow comparisons anywhere in this file.
// All persistence on Confirm routes through the EXISTING overrideInstance
// (lib/data.js) — extended in this same step to also accept an optional
// `position`, rather than adding a new write path. overrideInstance, not
// moveInstance, specifically because "Already on Tomorrow" can include
// fresh, non-override recurring instances that moveInstance's own header
// comment says must not go through it — overrideInstance's is_override:true
// is what makes touching those safe (protects them from the next
// generateInstances() regeneration pass). See that function's own comment.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchInstances, createOneOffTask, overrideInstance } from '@/lib/data';
import { getLogicalToday, addDays } from '@/lib/dates';
import { space, font, color, radius } from '@/lib/tokens';
import { buttonPrimary, buttonSecondary, buttonGhost, textMuted, input as inputStyle } from '@/lib/components';
import { useRefresh } from './RefreshContext';
import { useTimer } from './TimerContext';
import DayAgendaRail from './DayAgendaRail';

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

// One draggable row — checkbox (default checked), title, source tag.
// Unchecked rows visibly gray out (opacity) so the roll-forward is obvious
// on this screen, not a later surprise, per the ask.
function PlanRow({ row, kind, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.instance.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `${space[2]} ${space[2]}`,
        borderRadius: radius.sm,
        opacity: isDragging ? 0.4 : row.checked ? 1 : 0.45,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <span
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        style={{ cursor: 'grab', color: color.mutedFaint, fontSize: font.size.sm, flexShrink: 0, touchAction: 'none' }}
      >
        ⠿
      </span>
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
    </div>
  );
}

function PlanSection({ title, subtitle, rows, kind, onToggle, onReorder }) {
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
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {rows.map((row) => (
              <PlanRow key={row.instance.id} row={row} kind={kind} onToggle={onToggle} />
            ))}
          </SortableContext>
        </DndContext>
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
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { refresh: globalRefresh } = useRefresh();
  const { refreshTimer } = useTimer();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [todayRows, tomorrowRows] = await Promise.all([
        fetchInstances({ from: logicalToday, to: logicalToday }),
        fetchInstances({ from: logicalTomorrow, to: logicalTomorrow }),
      ]);
      setCarried(todayRows.filter((i) => i.status !== 'done').map((instance) => ({ instance, checked: true })));
      setScheduled(tomorrowRows.map((instance) => ({ instance, checked: true })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [logicalToday, logicalTomorrow]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCarried = (id) =>
    setCarried((prev) => prev.map((r) => (r.instance.id === id ? { ...r, checked: !r.checked } : r)));
  const toggleScheduled = (id) =>
    setScheduled((prev) => prev.map((r) => (r.instance.id === id ? { ...r, checked: !r.checked } : r)));

  const submitAdd = async (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      await createOneOffTask({ title, scheduledDate: logicalTomorrow });
      setNewTitle('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      let pos = 0;
      const writes = [];
      for (const row of [...carried, ...scheduled]) {
        const fields = { scheduledDate: row.checked ? logicalTomorrow : dayAfterTomorrow };
        if (row.checked) fields.position = pos++;
        writes.push(overrideInstance(row.instance.id, fields));
      }
      await Promise.all(writes);
      globalRefresh();
      refreshTimer();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  // Live right-pane preview — checked rows only, in current (possibly
  // drag-reordered) display order. Read-only, no interaction; DayAgendaRail
  // itself still groups untimed-first/timed-by-time within whatever set it
  // receives.
  const previewInstances = [...carried, ...scheduled].filter((r) => r.checked).map((r) => r.instance);

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

        <form onSubmit={submitAdd} style={{ display: 'flex', gap: space[2], marginBottom: space[5] }}>
          <input
            type="text"
            placeholder="+ Add task"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={busy}
            style={{ ...inputStyle, flex: 1, fontSize: font.size.sm, padding: space[2] }}
          />
          <button type="submit" disabled={busy || !newTitle.trim()} style={{ ...buttonSecondary, padding: `${space[1]} ${space[3]}` }}>
            Add
          </button>
        </form>

        {loading ? (
          <div style={textMuted}>Loading…</div>
        ) : (
          <>
            <PlanSection
              title="Carried Over"
              subtitle="from today"
              rows={carried}
              kind="carried"
              onToggle={toggleCarried}
              onReorder={setCarried}
            />
            <PlanSection
              title="Already on Tomorrow"
              rows={scheduled}
              kind="scheduled"
              onToggle={toggleScheduled}
              onReorder={setScheduled}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: space[2] }}>
          <button type="button" disabled={busy || loading} style={buttonPrimary} onClick={onConfirm}>
            Confirm Tomorrow's Board
          </button>
          <button type="button" style={buttonGhost} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div style={{ flex: '1 1 380px', minWidth: 0, borderLeft: `1px solid ${color.borderSubtle}`, paddingLeft: space[6] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.inkV6, marginBottom: space[3] }}>
          Preview — {formatHeaderDate(logicalTomorrow)}
        </div>
        <DayAgendaRail instances={previewInstances} readOnly />
      </div>
    </div>
  );
}
