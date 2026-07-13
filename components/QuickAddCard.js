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
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: `${space[1]} ${space[2]}`,
          border: 'none',
          background: 'transparent',
          color: color.textMuted,
          fontSize: font.size.sm,
          fontFamily: font.family,
          cursor: 'pointer',
          borderRadius: radius.sm,
        }}
      >
        + Add a task
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: space[1] }}>
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
