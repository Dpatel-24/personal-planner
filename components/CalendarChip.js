// CalendarChip — one task_instance chip in a calendar day cell. Draggable via
// @dnd-kit/sortable using the exact same columnKey/instance data shape as
// WeekBoardCard, so lib/dragAndDrop.js's shared handler works identically
// here. Click (no pointer movement) toggles done/todo, same as before drag
// was added — the PointerSensor's activation distance (see CalendarView)
// keeps a plain click from starting a drag.
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '@/lib/tokens';

export default function CalendarChip({ instance, columnKey, onToggleStatus }) {
  const [busy, setBusy] = useState(false);
  const done = instance.status === 'done';
  const skipped = instance.status === 'skipped';

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
    data: { columnKey, instance },
  });

  const toggle = async () => {
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
      onClick={toggle}
      title={instance.title || '(untitled)'}
      style={{
        fontSize: font.size.xs,
        color: done || skipped ? color.textMuted : color.text,
        textDecoration: done ? 'line-through' : 'none',
        fontStyle: skipped ? 'italic' : 'normal',
        background: color.bgMuted,
        borderRadius: radius.sm,
        padding: `1px ${space[1]}`,
        marginBottom: 2,
        cursor: busy ? 'default' : 'grab',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: isDragging ? 0.4 : busy ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      {instance.title || '(untitled)'}
    </div>
  );
}
