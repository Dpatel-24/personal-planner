// WeekBoardCard — one task_instance in a week-board column. Draggable via
// @dnd-kit/sortable for all cards (including recurring non-override — they
// must LOOK draggable per spec), but only eligible cards persist on drop; see
// WeekBoardView's handleDragEnd for the eligibility check. Title + description,
// a checkbox reflecting status, and a "carried over" badge when is_overdue is
// true (computed in lib/board-queries.js, not a DB column).
//
// Click vs. drag: the DndContext's PointerSensor uses an activation distance
// (see WeekBoardView), so a plain click (no movement) never starts a drag and
// still opens the v1 edit flow; only the checkbox stops propagation so it can
// toggle status independently of that click.
//
// No start-timer button here — that control lives in the sidebar (TaskRow.js)
// only, since the sidebar is the "Today" control panel and every timeable
// task passes through it. This card still shows the read-only total-tracked-
// time (and colors it while timing) since that's informational, not a control.
import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '@/lib/tokens';
import { card as cardStyle } from '@/lib/components';
import { useTimer } from './TimerContext';
import { formatDuration } from '@/lib/timer-queries';

export default function WeekBoardCard({ instance, columnKey, onToggleStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const done = instance.status === 'done';
  const { activeTimer } = useTimer();
  const isTiming = activeTimer?.instance_id === instance.id;

  // Re-render every second while THIS card's timer is the active one, so the
  // live portion of the total keeps ticking without a re-fetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isTiming) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isTiming]);

  const liveSeconds = isTiming
    ? (Date.now() - new Date(activeTimer.started_at).getTime()) / 1000
    : 0;
  const totalTrackedSeconds = (instance.tracked_seconds || 0) + liveSeconds;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
    data: { columnKey, instance },
  });

  const toggle = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await onToggleStatus(instance.id, done ? 'todo' : 'done');
    } finally {
      setBusy(false);
    }
  };

  const badge = {
    display: 'inline-block',
    marginTop: space[1],
    padding: `0 ${space[1]}`,
    fontSize: font.size.xs,
    color: color.danger,
    background: color.dangerSubtle,
    borderRadius: radius.sm,
  };

  return (
    <div
      ref={setNodeRef}
      onClick={() => onEdit(instance)}
      style={{
        ...cardStyle,
        padding: space[3],
        marginBottom: space[2],
        cursor: 'grab',
        // Without this, touch-drag on mobile fights the browser's native
        // scroll gesture instead of starting a dnd-kit drag — recommended by
        // @dnd-kit for any sortable/draggable touch target.
        touchAction: 'none',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : busy ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={toggle}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ marginTop: 3, flexShrink: 0 }}
          aria-label={done ? 'Mark not done' : 'Mark done'}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
            {instance.tag && (
              <span
                title={instance.tag.name}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.full,
                  // tags.color is nullable (no color-picker UI yet) — fall
                  // back to the accent token so every tag still shows a dot.
                  background: instance.tag.color || color.accent,
                  flexShrink: 0,
                }}
              />
            )}
            <div
              style={{
                fontSize: font.size.md,
                color: done ? color.textMuted : color.text,
                textDecoration: done ? 'line-through' : 'none',
                wordBreak: 'break-word',
              }}
            >
              {instance.title || '(untitled)'}
            </div>
          </div>
          {instance.description && (
            <div
              style={{
                fontSize: font.size.xs,
                color: color.textMuted,
                marginTop: space[1],
                wordBreak: 'break-word',
              }}
            >
              {instance.description}
            </div>
          )}
          {instance.checklist_total > 0 && (
            <div style={{ fontSize: font.size.xs, color: color.textMuted, marginTop: space[1] }}>
              {instance.checklist_done}/{instance.checklist_total}
            </div>
          )}
          {totalTrackedSeconds > 0 && (
            <div
              style={{
                fontSize: font.size.xs,
                color: isTiming ? color.accent : color.textMuted,
                marginTop: space[1],
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDuration(totalTrackedSeconds)}
            </div>
          )}
          {instance.is_overdue && <span style={badge}>carried over</span>}
        </div>
      </div>
    </div>
  );
}
