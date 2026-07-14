// EditModal — edit a task. One-off: title/description/date + delete. Recurring:
// title/description with the CLAUDE.md three-way scope (this / this+future / all).
// Changing the recurrence rule itself from here is a follow-up; the data layer
// already supports it (updateTemplateAll/splitTemplate accept recurrenceRule).
import { useState } from 'react';
import Modal from './Modal';
import { InstanceTagSection, TemplateDefaultTagSection } from './TagAssignSection';
import ChecklistSection from './ChecklistSection';
import ChecklistTemplateSection from './ChecklistTemplateSection';
import {
  updateOneOff,
  overrideInstance,
  updateTemplateAll,
  splitTemplate,
  deleteInstance,
} from '@/lib/data';
import { humanDate } from '@/lib/dates';
import { color, space, font } from '@/lib/tokens';
import {
  input as inputStyle,
  label as labelStyle,
  buttonPrimary,
  buttonSecondary,
  buttonDanger,
  heading,
  textMuted,
} from '@/lib/components';

const SCOPES = [
  ['single', 'This occurrence only', 'Detaches just this occurrence and edits it. The series is untouched.'],
  ['future', 'This and future', 'Ends the current series the day before, and starts a new one from this date.'],
  ['all', 'All occurrences', 'Edits the series. Completed and individually-edited occurrences are kept.'],
];

export default function EditModal({ instance, onClose, onSaved }) {
  const isRecurring = !!instance.template_id;
  const [title, setTitle] = useState(instance.title || '');
  const [description, setDescription] = useState(instance.description || '');
  const [scheduledDate, setScheduledDate] = useState(instance.scheduled_date);
  const [scope, setScope] = useState('single');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = {
        title: title.trim(),
        description: description.trim(),
      };
      if (!isRecurring) {
        await updateOneOff(instance.id, { ...fields, scheduledDate });
      } else if (scope === 'single') {
        await overrideInstance(instance.id, fields);
      } else if (scope === 'future') {
        await splitTemplate(instance.template, instance.scheduled_date, fields);
      } else {
        await updateTemplateAll(instance.template_id, fields);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteInstance(instance.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const field = { marginBottom: space[3] };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ ...heading, marginBottom: space[1] }}>Edit task</div>
        <div style={{ ...textMuted, marginBottom: space[4] }}>
          {humanDate(instance.scheduled_date)}
          {isRecurring ? ' · recurring' : ''}
        </div>

        <div style={field}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div style={field}>
          <label style={labelStyle}>Description (optional)</label>
          <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={field}>
          <InstanceTagSection instanceId={instance.id} initialTagId={instance.tag_id} />
        </div>

        {isRecurring && instance.template_id && (
          <div style={field}>
            <TemplateDefaultTagSection
              templateId={instance.template_id}
              initialTagId={instance.template?.defaultTagRow?.id}
            />
          </div>
        )}

        <div style={field}>
          <ChecklistSection instanceId={instance.id} />
        </div>

        {isRecurring && instance.template_id && (
          <div style={field}>
            <ChecklistTemplateSection templateId={instance.template_id} />
          </div>
        )}

        {!isRecurring && (
          <div style={field}>
            <label style={labelStyle}>Date</label>
            <input
              style={inputStyle}
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
        )}

        {isRecurring && (
          <div style={{ marginBottom: space[4] }}>
            <label style={labelStyle}>Apply to</label>
            {SCOPES.map(([key, lbl, hint]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: space[2],
                  padding: `${space[1]} 0`,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={scope === key}
                  onChange={() => setScope(key)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ fontSize: font.size.md, color: color.text }}>{lbl}</span>
                  {scope === key && (
                    <span style={{ display: 'block', fontSize: font.size.xs, color: color.textMuted }}>{hint}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
          <div>
            {!isRecurring && (
              <button type="button" style={buttonDanger} onClick={remove} disabled={busy}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: space[2] }}>
            <button type="button" style={buttonSecondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" style={buttonPrimary} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
