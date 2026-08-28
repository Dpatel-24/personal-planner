// QuickAddCard — Trello-style "+ Add a task" affordance at the bottom of a
// column's card list. Click to reveal an inline title input; Enter/Add
// creates a one-off task scheduled on that column's date (null for Inbox).
// Separate from (not a replacement for) the sidebar's "Add a task for today".
import { useState } from 'react';
import { createOneOffTask } from '@/lib/data';
import { space, radius, font, color } from '@/lib/tokens';
import { input as inputStyle, buttonPrimary, buttonSecondary } from '@/lib/components';

export default function QuickAddCard({ scheduledDate, onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTitle('');
    setOpen(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      await createOneOffTask({ title: t, scheduledDate });
      setTitle('');
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    // Standalone bar, not an inline text link — white rounded card/row,
    // sits above the task list (see WeekBoardColumn.js's render order).
    // "+" and "Add task" are two separate spans (not one string) so the
    // icon can stay visually distinct from the label per the spec, both
    // muted gray, no bold — this is deliberately quiet, not a primary
    // action button. No time badge: new tasks are untimed/anytime by
    // default until set elsewhere (the rail's duration stepper).
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: space[1],
          textAlign: 'left',
          padding: `${space[2]} ${space[2]}`,
          marginBottom: space[2],
          border: `1px solid ${color.borderSubtle}`,
          borderRadius: radius.md,
          background: color.paperV6,
          color: color.mutedText,
          fontSize: font.size.sm,
          fontWeight: font.weight.normal,
          fontFamily: font.family,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true">+</span>
        <span>Add task</span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: space[2] }}>
      <input
        autoFocus
        style={{ ...inputStyle, fontSize: font.size.sm, padding: space[2] }}
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
        disabled={busy}
      />
      <div style={{ display: 'flex', gap: space[1], marginTop: space[1] }}>
        <button
          type="submit"
          disabled={busy}
          style={{ ...buttonPrimary, padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          style={{ ...buttonSecondary, padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
