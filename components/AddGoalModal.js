// AddGoalModal — one form for both cases the page needs: a root goal (no
// parentGoal prop; user picks Short-Term/Long-Term) and a sub-goal (parentGoal
// passed in; no category picker, since a child's category is never stored —
// it's derived from the root at read time, see lib/goals-queries.js). Modal
// itself, the input/label/button styles, and the immediate-write-then-close
// flow all match EditModal.js/TagManagerModal.js's existing form pattern.
import { useState } from 'react';
import Modal from './Modal';
import { createGoal } from '@/lib/goals-queries';
import { color, space, font } from '@/lib/tokens';
import { input as inputStyle, label as labelStyle, buttonPrimary, buttonSecondary, heading, textMuted } from '@/lib/components';

export default function AddGoalModal({ parentGoal = null, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('short_term');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createGoal({
        title: trimmed,
        parentId: parentGoal?.id ?? null,
        category: parentGoal ? null : category, // sub-goals never carry their own category
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const field = { marginBottom: space[3] };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ ...heading, marginBottom: space[1] }}>Add Goal</div>
        <div style={{ ...textMuted, marginBottom: space[4] }}>
          {parentGoal ? `Sub-goal under "${parentGoal.title}"` : 'New root goal'}
        </div>

        <div style={field}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        {!parentGoal && (
          <div style={field}>
            <label style={labelStyle}>Category</label>
            <div style={{ display: 'flex', gap: space[3] }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="category"
                  checked={category === 'short_term'}
                  onChange={() => setCategory('short_term')}
                />
                <span style={{ fontSize: font.size.md, color: color.text }}>Short-Term</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="category"
                  checked={category === 'long_term'}
                  onChange={() => setCategory('long_term')}
                />
                <span style={{ fontSize: font.size.md, color: color.text }}>Long-Term</span>
              </label>
            </div>
          </div>
        )}

        {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <button type="button" style={buttonSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimary} disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
