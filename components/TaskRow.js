// TaskRow — one task_instance in the daily list. Checkbox toggles done/todo;
// Skip/Undo toggles skipped; a start-timer button lives here (not on the
// board/calendar card faces) since the sidebar is the "Today" control panel
// — every task worth timing passes through it. Draggable via @dnd-kit,
// reordering the sidebar's list the same way the board's columns do — see
// DailySidebar.js for the shared lib/dragAndDrop.js wiring. All design
// values come from tokens/components.
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';
import { useTimer } from './TimerContext';
import { useRefresh } from './RefreshContext';
import { startTimer } from '@/lib/timer-queries';

export default function TaskRow({ instance, columnKey, onSetStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const done = instance.status === 'done';
  const skipped = instance.status === 'skipped';
  const { activeTimer, refreshTimer } = useTimer();
  const { refresh } = useRefresh();
  const isTiming = activeTimer?.instance_id === instance.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
    data: { columnKey, instance },
  });

  const act = async (status) => {
    setBusy(true);
    try {
      await onSetStatus(instance.id, status);
    } finally {
      setBusy(false);
    }
  };

  const startTiming = async () => {
    setTimerBusy(true);
    try {
      await startTimer(instance.id);
      refreshTimer();
      // Starting a new timer finalizes whatever session was previously
      // running (possibly on a different task) — nudge the shared instance
      // fetch so that other task's card-face total-tracked-time updates too.
      refresh();
    } finally {
      setTimerBusy(false);
    }
  };

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: space[3],
    padding: `${space[2]} ${space[3]}`,
    borderRadius: radius.md,
    cursor: 'grab',
    // Without this, touch-drag on mobile fights the browser's native scroll
    // gesture instead of starting a dnd-kit drag — same as WeekBoardCard.
    touchAction: 'none',
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : busy ? 0.5 : 1,
  };

  const titleStyle = {
    flex: 1,
    fontSize: font.size.md,
    color: done || skipped ? color.textMuted : color.text,
    textDecoration: done ? 'line-through' : 'none',
    cursor: onEdit ? 'pointer' : 'default',
  };

  const badge = {
    marginLeft: space[2],
    padding: `0 ${space[1]}`,
    fontSize: font.size.xs,
    color: color.accent,
    background: color.accentSubtle,
    borderRadius: radius.sm,
  };

  return (
    <div ref={setNodeRef} style={rowStyle} {...attributes} {...listeners}>
      <input
        type="checkbox"
        checked={done}
        disabled={busy || skipped}
        onChange={() => act(done ? 'todo' : 'done')}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      <span style={titleStyle} onClick={onEdit ? () => onEdit(instance) : undefined} title={onEdit ? 'Edit' : undefined}>
        {instance.title || '(untitled)'}
        {instance.template_id && <span style={badge}>recurring</span>}
        {skipped && <span style={{ ...badge, color: color.textMuted, background: color.bgMuted }}>skipped</span>}
      </span>
      <button
        type="button"
        onClick={startTiming}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={timerBusy || isTiming}
        title={isTiming ? 'Timing…' : 'Start timer'}
        style={{
          ...buttonGhost,
          padding: `0 ${space[1]}`,
          fontSize: font.size.sm,
          color: isTiming ? color.accent : color.textMuted,
        }}
      >
        {isTiming ? '⏱' : '▶'}
      </button>
      {skipped ? (
        <button style={buttonGhost} disabled={busy} onPointerDown={(e) => e.stopPropagation()} onClick={() => act('todo')}>
          Undo
        </button>
      ) : (
        <button style={buttonGhost} disabled={busy || done} onPointerDown={(e) => e.stopPropagation()} onClick={() => act('skipped')}>
          Skip
        </button>
      )}
    </div>
  );
}
