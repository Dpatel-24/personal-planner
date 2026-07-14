// CalendarChip — one task_instance chip in a calendar day cell. Draggable via
// @dnd-kit/sortable using the exact same columnKey/instance data shape as
// WeekBoardCard, so lib/dragAndDrop.js's shared handler works identically
// here. Matches WeekBoardCard's click/toggle split: a small checkbox toggles
// done/todo (stopping propagation), and clicking the rest of the chip (no
// pointer movement) opens the same EditModal the board uses.
import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '@/lib/tokens';
import { useTimer } from './TimerContext';
import { useRefresh } from './RefreshContext';
import { startTimer, formatDuration } from '@/lib/timer-queries';

export default function CalendarChip({ instance, columnKey, onToggleStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const done = instance.status === 'done';
  const skipped = instance.status === 'skipped';
  const { activeTimer, refreshTimer } = useTimer();
  const { refresh } = useRefresh();
  const isTiming = activeTimer?.instance_id === instance.id;

  // Re-render every second while THIS chip's timer is the active one, so the
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

  const start = async (e) => {
    e.stopPropagation();
    setTimerBusy(true);
    try {
      await startTimer(instance.id);
      refreshTimer();
      // See WeekBoardCard.js's identical comment — starting a new timer
      // finalizes whatever session was previously running elsewhere.
      refresh();
    } finally {
      setTimerBusy(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      onClick={() => onEdit(instance)}
      title={instance.title || '(untitled)'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        background: color.bgMuted,
        borderRadius: radius.sm,
        padding: `1px ${space[1]}`,
        marginBottom: 2,
        cursor: busy ? 'default' : 'grab',
        touchAction: 'none', // let dnd-kit own touch gestures on this chip
        opacity: isDragging ? 0.4 : busy ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <input
        type="checkbox"
        checked={done}
        disabled={busy}
        onChange={toggle}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 10, height: 10, flexShrink: 0 }}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      {instance.tag && (
        <span
          title={instance.tag.name}
          style={{
            width: 6,
            height: 6,
            borderRadius: radius.full,
            // tags.color is nullable (no color-picker UI yet) — fall back to
            // the accent token so every tag still shows a visible dot.
            background: instance.tag.color || color.accent,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          fontSize: font.size.xs,
          color: done || skipped ? color.textMuted : color.text,
          textDecoration: done ? 'line-through' : 'none',
          fontStyle: skipped ? 'italic' : 'normal',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {instance.title || '(untitled)'}
      </span>
      {instance.checklist_total > 0 && (
        <span style={{ fontSize: font.size.xs, color: color.textMuted, flexShrink: 0 }}>
          {instance.checklist_done}/{instance.checklist_total}
        </span>
      )}
      {totalTrackedSeconds > 0 && (
        <span
          style={{
            fontSize: font.size.xs,
            color: isTiming ? color.accent : color.textMuted,
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDuration(totalTrackedSeconds)}
        </span>
      )}
      <button
        type="button"
        onClick={start}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={timerBusy || isTiming}
        title={isTiming ? 'Timing…' : 'Start timer'}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          fontSize: font.size.xs,
          lineHeight: 1,
          color: isTiming ? color.accent : color.textMuted,
          cursor: timerBusy || isTiming ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        {isTiming ? '⏱' : '▶'}
      </button>
    </div>
  );
}
