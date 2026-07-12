// TaskRow — one task_instance in the daily list. Checkbox toggles done/todo;
// Skip/Undo toggles skipped. All design values come from tokens/components.
import { useState } from 'react';
import { color, space, radius, font } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';

export default function TaskRow({ instance, onSetStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const done = instance.status === 'done';
  const skipped = instance.status === 'skipped';

  const act = async (status) => {
    setBusy(true);
    try {
      await onSetStatus(instance.id, status);
    } finally {
      setBusy(false);
    }
  };

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: space[3],
    padding: `${space[2]} ${space[3]}`,
    borderRadius: radius.md,
    opacity: busy ? 0.5 : 1,
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
    <div style={rowStyle}>
      <input
        type="checkbox"
        checked={done}
        disabled={busy || skipped}
        onChange={() => act(done ? 'todo' : 'done')}
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      <span style={titleStyle} onClick={onEdit ? () => onEdit(instance) : undefined} title={onEdit ? 'Edit' : undefined}>
        {instance.title || '(untitled)'}
        {instance.template_id && <span style={badge}>recurring</span>}
        {skipped && <span style={{ ...badge, color: color.textMuted, background: color.bgMuted }}>skipped</span>}
      </span>
      {skipped ? (
        <button style={buttonGhost} disabled={busy} onClick={() => act('todo')}>
          Undo
        </button>
      ) : (
        <button style={buttonGhost} disabled={busy || done} onClick={() => act('skipped')}>
          Skip
        </button>
      )}
    </div>
  );
}
