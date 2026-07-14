// TagPicker — select an existing tag (V3 `tags` table, single-select via
// tag_id/default_tag_id) or quick-create a new one inline. Deliberately
// minimal: no color picker (tags.color exists in the schema but has no UI
// yet — a future addition, not built until asked for).
import { useEffect, useState } from 'react';
import { getTags, createTag } from '@/lib/tag-queries';
import { color, space, font } from '@/lib/tokens';
import { input as inputStyle, label as labelStyle, buttonPrimary, buttonSecondary } from '@/lib/components';

const NEW_TAG_VALUE = '__new__';

export default function TagPicker({ value, onChange, label = 'Tag (optional)' }) {
  const [tags, setTags] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTags()
      .then(setTags)
      .catch((e) => setError(e.message));
  }, []);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === NEW_TAG_VALUE) {
      setCreating(true);
      return;
    }
    onChange(v || null);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      cancelCreate();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tag = await createTag(name);
      setTags((t) => [...t, tag].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(tag.id);
      cancelCreate();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const smallBtn = { padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {creating ? (
        <div style={{ display: 'flex', gap: space[1] }}>
          <input
            autoFocus
            style={inputStyle}
            placeholder="New tag name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === 'Escape') cancelCreate();
            }}
            disabled={busy}
          />
          <button type="button" onClick={handleCreate} disabled={busy} style={{ ...buttonPrimary, ...smallBtn }}>
            Add
          </button>
          <button type="button" onClick={cancelCreate} disabled={busy} style={{ ...buttonSecondary, ...smallBtn }}>
            Cancel
          </button>
        </div>
      ) : (
        <select style={{ ...inputStyle, cursor: 'pointer' }} value={value || ''} onChange={handleSelect}>
          <option value="">No tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value={NEW_TAG_VALUE}>+ New tag…</option>
        </select>
      )}
      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[1] }}>{error}</div>}
    </div>
  );
}
