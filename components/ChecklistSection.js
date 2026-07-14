// ChecklistSection — the instance-level checklist inside the card detail
// view (EditModal). Operates directly on checklist_items for one instance;
// writes are immediate (not gated behind the modal's Save button), same as
// a real checklist. Independent feature: does not touch tag or timer state.
import { useEffect, useState } from 'react';
import {
  getChecklistItems,
  addChecklistItem,
  removeChecklistItem,
  toggleChecklistItem,
  swapChecklistItemPositions,
} from '@/lib/checklist-queries';
import { color, space, font } from '@/lib/tokens';
import { input as inputStyle, label as labelStyle, buttonPrimary, buttonGhost } from '@/lib/components';
import { useRefresh } from './RefreshContext';

export default function ChecklistSection({ instanceId }) {
  const { refresh } = useRefresh();
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    getChecklistItems(instanceId)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [instanceId]);

  const withErrorHandling = async (fn) => {
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };

  const add = () =>
    withErrorHandling(async () => {
      const text = newText.trim();
      if (!text) return;
      const item = await addChecklistItem(instanceId, text);
      setItems((prev) => [...prev, item]);
      setNewText('');
      refresh();
    });

  const toggle = (item) =>
    withErrorHandling(async () => {
      const updated = await toggleChecklistItem(item.id, !item.is_done);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      refresh();
    });

  const remove = (item) =>
    withErrorHandling(async () => {
      await removeChecklistItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      refresh();
    });

  const move = (index, delta) =>
    withErrorHandling(async () => {
      const otherIndex = index + delta;
      if (otherIndex < 0 || otherIndex >= items.length) return;
      const a = items[index];
      const b = items[otherIndex];
      await swapChecklistItemPositions(a, b);
      const next = [...items];
      next[index] = { ...b, position: a.position };
      next[otherIndex] = { ...a, position: b.position };
      next.sort((x, y) => x.position - y.position);
      setItems(next);
    });

  const row = { display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]} 0` };
  const smallGhost = { ...buttonGhost, padding: `0 ${space[1]}`, fontSize: font.size.sm };

  return (
    <div>
      <label style={labelStyle}>Checklist{items.length > 0 ? ` (${items.filter((i) => i.is_done).length}/${items.length})` : ''}</label>

      {items.map((item, index) => (
        <div key={item.id} style={row}>
          <input
            type="checkbox"
            checked={item.is_done}
            onChange={() => toggle(item)}
            aria-label={item.is_done ? 'Mark not done' : 'Mark done'}
          />
          <span
            style={{
              flex: 1,
              fontSize: font.size.md,
              color: item.is_done ? color.textMuted : color.text,
              textDecoration: item.is_done ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {item.text}
          </span>
          <button type="button" style={smallGhost} onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
            ↑
          </button>
          <button
            type="button"
            style={smallGhost}
            onClick={() => move(index, 1)}
            disabled={index === items.length - 1}
            aria-label="Move down"
          >
            ↓
          </button>
          <button type="button" style={{ ...smallGhost, color: color.danger }} onClick={() => remove(item)} aria-label="Delete item">
            ×
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: space[1], marginTop: space[1] }}>
        <input
          style={inputStyle}
          placeholder="Add checklist item"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" style={{ ...buttonPrimary, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm }} onClick={add}>
          Add
        </button>
      </div>

      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[1] }}>{error}</div>}
    </div>
  );
}
