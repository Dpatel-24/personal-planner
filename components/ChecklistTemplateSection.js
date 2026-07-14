// ChecklistTemplateSection — defines a recurring template's checklist
// (checklist_templates). Shown only for recurring tasks, separately from the
// instance-level ChecklistSection. Writes here are immediate and template-
// scoped: per CLAUDE.md, editing this does NOT retroactively touch any
// already-generated instance's checklist_items — it only affects instances
// materialized AFTER the edit (see lib/recurrence.js generateInstances).
import { useEffect, useState } from 'react';
import { getChecklistTemplate, addChecklistTemplateItem, removeChecklistTemplateItem } from '@/lib/checklist-queries';
import { color, space, font } from '@/lib/tokens';
import { input as inputStyle, label as labelStyle, buttonPrimary, buttonGhost, textMuted } from '@/lib/components';

export default function ChecklistTemplateSection({ templateId }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    getChecklistTemplate(templateId)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [templateId]);

  const add = async () => {
    const text = newText.trim();
    if (!text) return;
    try {
      const item = await addChecklistTemplateItem(templateId, text);
      setItems((prev) => [...prev, item]);
      setNewText('');
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (item) => {
    try {
      await removeChecklistTemplateItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const row = { display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]} 0` };

  return (
    <div>
      <label style={labelStyle}>Checklist template (applies to future occurrences)</label>
      <div style={{ ...textMuted, marginBottom: space[1] }}>
        Editing this never changes already-generated occurrences.
      </div>

      {items.map((item) => (
        <div key={item.id} style={row}>
          <span style={{ flex: 1, fontSize: font.size.md, color: color.text, wordBreak: 'break-word' }}>{item.text}</span>
          <button
            type="button"
            style={{ ...buttonGhost, padding: `0 ${space[1]}`, fontSize: font.size.sm, color: color.danger }}
            onClick={() => remove(item)}
            aria-label="Delete template item"
          >
            ×
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: space[1], marginTop: space[1] }}>
        <input
          style={inputStyle}
          placeholder="Add checklist template item"
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
