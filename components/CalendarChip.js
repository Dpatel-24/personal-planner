// CalendarChip — one task_instance chip in a calendar day cell. Draggable via
// @dnd-kit/sortable using the exact same columnKey/instance data shape as
// WeekBoardCard, so lib/dragAndDrop.js's shared handler works identically
// here. Matches WeekBoardCard's click/toggle split: a small checkbox toggles
// done/todo (stopping propagation), and clicking the rest of the chip (no
// pointer movement) opens the same EditModal the board uses.
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '@/lib/tokens';

export default function CalendarChip({ instance, columnKey, onToggleStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const done = instance.status === 'done';
  const skipped = instance.status === 'skipped';

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
          title={instance.tag}
          style={{
            width: 6,
            height: 6,
            borderRadius: radius.full,
            background: color.accent,
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
    </div>
  );
}
