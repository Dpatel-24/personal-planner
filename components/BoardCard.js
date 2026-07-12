// BoardCard — one task_instance as a card in a status column. Click-to-move
// status buttons (no drag-and-drop, per CLAUDE.md anti-goals).
import { useState } from 'react';
import { color, space, radius, font } from '@/lib/tokens';
import { card as cardStyle, buttonGhost } from '@/lib/components';
import { humanDate } from '@/lib/dates';

export default function BoardCard({ instance, onSetStatus }) {
  const [busy, setBusy] = useState(false);
  const status = instance.status;

  const act = async (next) => {
    setBusy(true);
    try {
      await onSetStatus(instance.id, next);
    } finally {
      setBusy(false);
    }
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
    <div
      style={{
        ...cardStyle,
        padding: space[3],
        marginBottom: space[2],
        opacity: busy ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: font.size.md, color: color.text }}>
        {instance.title || '(untitled)'}
        {instance.template_id && <span style={badge}>recurring</span>}
      </div>
      <div style={{ fontSize: font.size.xs, color: color.textMuted, margin: `${space[1]} 0 ${space[2]}` }}>
        {humanDate(instance.scheduled_date)}
      </div>
      <div style={{ display: 'flex', gap: space[1] }}>
        {status !== 'todo' && (
          <button style={buttonGhost} disabled={busy} onClick={() => act('todo')}>
            To do
          </button>
        )}
        {status !== 'done' && (
          <button style={buttonGhost} disabled={busy} onClick={() => act('done')}>
            Done
          </button>
        )}
        {status !== 'skipped' && (
          <button style={buttonGhost} disabled={busy} onClick={() => act('skipped')}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
