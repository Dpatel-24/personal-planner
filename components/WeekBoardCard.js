// WeekBoardCard — one task_instance in a week-board column. Layout/rendering
// only: title + description, a checkbox reflecting status, and a "carried
// over" badge when is_overdue is true (computed in lib/board-queries.js, not
// a DB column). No drag yet. Clicking the card opens the v1 edit flow
// (EditModal, via the onEdit callback) — the checkbox stops that click so it
// can toggle status independently.
import { useState } from 'react';
import { color, space, radius, font } from '@/lib/tokens';
import { card as cardStyle } from '@/lib/components';

export default function WeekBoardCard({ instance, onToggleStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const done = instance.status === 'done';

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
      onClick={() => onEdit(instance)}
      style={{
        ...cardStyle,
        padding: space[3],
        marginBottom: space[2],
        opacity: busy ? 0.5 : 1,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={toggle}
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: 3, flexShrink: 0 }}
          aria-label={done ? 'Mark not done' : 'Mark done'}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
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
          {instance.is_overdue && <span style={badge}>carried over</span>}
        </div>
      </div>
    </div>
  );
}
