// TagManagerModal — a basic reachable list of all tags (V3 `tags` table),
// with a form to create new ones (name + optional color hex). Deliberately
// minimal per CLAUDE.md: no rename/delete/merge UI yet — just enough to seed
// and see the initial set. Opened from the app header (pages/index.js).
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getTags, createTag } from '@/lib/tag-queries';
import { color, space, radius, font } from '@/lib/tokens';
import { input as inputStyle, buttonPrimary, buttonSecondary, heading, textMuted } from '@/lib/components';

export default function TagManagerModal({ onClose }) {
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  const row = { display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]} 0` };

  return (
    <Modal onClose={onClose}>
      <div style={{ ...heading, marginBottom: space[1] }}>Manage tags</div>
      <div style={{ ...textMuted, marginBottom: space[4] }}>
        Single-select per task — see the tag picker on any card.
      </div>

      {tags.length === 0 && <div style={textMuted}>No tags yet. Add one below.</div>}
      {tags.map((tag) => (
        <div key={tag.id} style={row}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: radius.full,
              background: tag.color || color.accent,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: font.size.md, color: color.text }}>{tag.name}</span>
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[4] }}>
        <button type="button" style={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
