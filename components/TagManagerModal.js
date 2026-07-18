// TagManagerModal — list of all tags (V3 `tags` table), with forms to
// create new ones and edit/delete existing tags (name, color, delete).
// Opened from the app header (pages/index.js). Secondary "View recurring"
// button opens RecurringTasksModal to see all templates with their details.
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getTags, createTag, updateTag, deleteTag } from '@/lib/tag-queries';
import { color, space, radius, font } from '@/lib/tokens';
import { input as inputStyle, buttonPrimary, buttonSecondary, buttonGhost, heading, textMuted } from '@/lib/components';
import RecurringTasksModal from './RecurringTasksModal';

export default function TagManagerModal({ onClose }) {
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showRecurring, setShowRecurring] = useState(false);

  const load = () => getTags().then(setTags).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await createTag(trimmed, colorHex.trim() || null);
      setName('');
      setColorHex('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const saveEdit = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    setBusy(true);
    setError(null);
    try {
      await updateTag(editingId, {
        name: trimmedName,
        color: editColor.trim() || null,
      });
      cancelEdit();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tagId) => {
    if (!confirm('Delete this tag?')) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTag(tagId);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const row = { display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]} 0` };

  return (
    <Modal onClose={onClose}>
      <div style={{ ...heading, marginBottom: space[1] }}>Manage tags</div>
      <div style={{ ...textMuted, marginBottom: space[4] }}>
        Single-select per task — see the tag picker on any card.
      </div>

      {tags.length === 0 && <div style={textMuted}>No tags yet. Add one below.</div>}
      {tags.map((tag) => (
        <div key={tag.id} style={{ ...row, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flex: 1 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: radius.full,
                background: tag.color || color.accent,
                flexShrink: 0,
              }}
            />
            {editingId === tag.id ? (
              <div style={{ display: 'flex', gap: space[1], flex: 1 }}>
                <input
                  autoFocus
                  style={{ ...inputStyle, flex: 1, padding: `${space[1]} ${space[2]}` }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <input
                  style={{ ...inputStyle, width: 100, padding: `${space[1]} ${space[2]}` }}
                  placeholder="#hex"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                />
              </div>
            ) : (
              <span style={{ fontSize: font.size.md, color: color.text }}>{tag.name}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: space[1] }}>
            {editingId === tag.id ? (
              <>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={busy}
                  style={{ ...buttonPrimary, padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{ ...buttonGhost, padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => startEdit(tag)}
                  style={{ ...buttonGhost, padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(tag.id)}
                  disabled={busy}
                  style={{
                    ...buttonGhost,
                    padding: `${space[1]} ${space[2]}`,
                    fontSize: font.size.sm,
                    color: color.danger,
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      <form onSubmit={add} style={{ display: 'flex', gap: space[1], marginTop: space[4] }}>
        <input
          style={inputStyle}
          placeholder="New tag name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={{ ...inputStyle, width: 100 }}
          placeholder="#hex (optional)"
          value={colorHex}
          onChange={(e) => setColorHex(e.target.value)}
        />
        <button type="submit" style={buttonPrimary} disabled={busy}>
          Add
        </button>
      </form>

      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[2] }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: space[4] }}>
        <button type="button" style={buttonSecondary} onClick={() => setShowRecurring(true)}>
          View recurring tasks
        </button>
        <button type="button" style={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>

      {showRecurring && (
        <RecurringTasksModal
          onClose={() => setShowRecurring(false)}
          onEditTask={(taskId) => {
            console.log('Edit task:', taskId);
            setShowRecurring(false);
          }}
        />
      )}
    </Modal>
  );
}
