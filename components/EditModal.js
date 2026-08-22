// EditModal — edit a task. One-off: title/description/date + delete. Recurring:
// title/description with the CLAUDE.md three-way scope (this / this+future / all).
// Changing the recurrence rule itself from here is a follow-up; the data layer
// already supports it (updateTemplateAll/splitTemplate accept recurrenceRule).
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { InstanceTagSection } from './TagAssignSection';
import ChecklistSection from './ChecklistSection';
import {
  updateOneOff,
  overrideInstance,
  updateTemplateAll,
  splitTemplate,
  deleteInstance,
} from '@/lib/data';
import { getChecklistItems } from '@/lib/checklist-queries';
import { supabase } from '@/lib/supabaseClient';
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
  ['all', 'All occurrences', 'Applies title, description, tag, and checklist here to every future occurrence. Completed and individually-edited occurrences are kept as-is.'],
];

export default function EditModal({ instance, onClose, onSaved }) {
  const isRecurring = !!instance.template_id;
  const [title, setTitle] = useState(instance.title || '');
  const [description, setDescription] = useState(instance.description || '');
  const [scheduledDate, setScheduledDate] = useState(instance.scheduled_date);
  const [scope, setScope] = useState('single');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [template, setTemplate] = useState(instance.template || null);

  // Fetch the full template object if needed for "future" scope
  useEffect(() => {
    if (isRecurring && !instance.template && instance.template_id) {
      supabase
        .from('task_templates')
        .select('*')
        .eq('id', instance.template_id)
        .single()
        .then(({ data, error: err }) => {
          if (err) {
            setError(err.message);
          } else {
            setTemplate(data);
          }
        });
    }
  }, [isRecurring, instance.template, instance.template_id]);

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
        if (!template) {
          setError('Template data is loading. Please try again.');
          setBusy(false);
          return;
        }
        await splitTemplate(template, instance.scheduled_date, fields);
      } else {
        // "All occurrences": pull the CURRENT, just-saved state of tag and
        // checklist for THIS instance fresh from the DB (both write
        // instantly on change, independent of this Save button — see
        // TagAssignSection/ChecklistSection — so by the time Save is
        // clicked the DB already holds whatever the user last set) and push
        // them out to the template + every eligible sibling occurrence,
        // full replace. See lib/data.js's updateTemplateAll for the full
        // reasoning and the is_override/status guard.
        const [{ data: freshInstance, error: tagReadErr }, freshChecklist] = await Promise.all([
          supabase.from('task_instances').select('tag_id').eq('id', instance.id).single(),
          getChecklistItems(instance.id),
        ]);
        if (tagReadErr) throw tagReadErr;
        await updateTemplateAll(instance.template_id, {
          ...fields,
          tagId: freshInstance.tag_id,
          checklistItems: freshChecklist.map((item) => ({ text: item.text })),
        });
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

        <div style={field}>
          <ChecklistSection instanceId={instance.id} />
          {isRecurring && (
            <div style={{ ...textMuted, fontSize: font.size.xs, marginTop: space[1] }}>
              Choosing "All occurrences" below applies this checklist to every future occurrence.
            </div>
          )}
        </div>

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
