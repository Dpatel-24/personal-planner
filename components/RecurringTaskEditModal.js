// RecurringTaskEditModal — edit a recurring task template's title,
// description, and default tag. Does NOT allow changing the recurrence rule
// itself (that's a follow-up).
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getTaskTemplate, updateTaskTemplate } from '@/lib/tag-queries';
import { TemplateDefaultTagSection } from './TagAssignSection';
import { color, space, font } from '@/lib/tokens';
import { input as inputStyle, label as labelStyle, buttonPrimary, buttonSecondary, heading, textMuted } from '@/lib/components';

export default function RecurringTaskEditModal({ taskId, onClose, onSaved }) {
  const [template, setTemplate] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTaskTemplate(taskId)
      .then((t) => {
        setTemplate(t);
        setTitle(t.title || '');
        setDescription(t.description || '');
      })
      .catch((e) => setError(e.message));
  }, [taskId]);

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateTaskTemplate(taskId, {
        title: title.trim(),
        description: description.trim(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!template) {
    return (
      <Modal onClose={onClose}>
        <div style={textMuted}>Loading...</div>
      </Modal>
    );
  }

  const field = { marginBottom: space[3] };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ ...heading, marginBottom: space[1] }}>Edit Recurring Task</div>
        <div style={{ ...textMuted, marginBottom: space[4] }}>
          Rule: {template.recurrence_rule || 'N/A'}
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
          <TemplateDefaultTagSection templateId={taskId} initialTagId={template.default_tag_id} />
        </div>

        {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <button type="button" style={buttonSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimary} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
