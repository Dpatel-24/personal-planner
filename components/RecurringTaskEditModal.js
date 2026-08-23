// RecurringTaskEditModal — edit a recurring task template's title,
// description, and recurrence rule. Does NOT edit the default tag or
// checklist here anymore (2026-08 redesign) — those are set by opening any
// one occurrence via the normal Edit-task flow and choosing "All
// occurrences", which pushes that occurrence's CURRENT tag/checklist onto
// the template and every eligible sibling in one retroactive step (see
// lib/data.js's updateTemplateAll). The old template-level pickers here
// (TemplateDefaultTagSection / ChecklistTemplateSection) only ever affected
// occurrences generated AFTER the edit — silently non-retroactive, which
// read as a bug from the outside (see CLAUDE.md decisions log).
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getTaskTemplate, updateTaskTemplate, deleteTaskTemplate } from '@/lib/tag-queries';
import { FREQUENCIES, buildRRule, describeRRule, weekdayCode, monthDay } from '@/lib/rrulePresets';
import { color, space, font } from '@/lib/tokens';
import { input as inputStyle, label as labelStyle, buttonPrimary, buttonSecondary, buttonDanger, heading, textMuted } from '@/lib/components';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Parse frequency and weekdays from an RRULE string
function parseRRule(ruleStr) {
  if (!ruleStr) return { frequency: 'weekly', weekdays: [] };

  let frequency = 'weekly';
  let weekdays = [];

  if (ruleStr.includes('FREQ=DAILY')) frequency = 'daily';
  else if (ruleStr.includes('FREQ=MONTHLY')) frequency = 'monthly';
  else if (ruleStr.includes('INTERVAL=2')) frequency = 'biweekly';
  else frequency = 'weekly';

  const byDayMatch = ruleStr.match(/BYDAY=([A-Z,]+)/);
  if (byDayMatch) {
    weekdays = byDayMatch[1].split(',');
  }

  return { frequency, weekdays };
}

export default function RecurringTaskEditModal({ taskId, onClose, onSaved }) {
  const [template, setTemplate] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [weekdays, setWeekdays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTaskTemplate(taskId)
      .then((t) => {
        setTemplate(t);
        setTitle(t.title || '');
        setDescription(t.description || '');
        const parsed = parseRRule(t.recurrence_rule);
        setFrequency(parsed.frequency);
        setWeekdays(parsed.weekdays);
      })
      .catch((e) => setError(e.message));
  }, [taskId]);

  const toggleWeekday = (code) => {
    setWeekdays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  };

  const getNewRRule = () => {
    // For weekly/biweekly, use selected weekdays; for others, use the original start date
    const daysForRule = (frequency === 'weekly' || frequency === 'biweekly')
      ? weekdays.length > 0 ? weekdays : WEEKDAY_CODES.slice(0, 1)
      : undefined;

    return buildRRule(frequency, {
      startDate: template?.start_date,
      weekdays: daysForRule,
    });
  };

  const remove = async () => {
    if (!confirm(`Delete "${template.title}"? This also deletes every occurrence it has generated — cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTaskTemplate(taskId);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if ((frequency === 'weekly' || frequency === 'biweekly') && weekdays.length === 0) {
      setError('Select at least one day of the week.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateTaskTemplate(taskId, {
        title: title.trim(),
        description: description.trim(),
        recurrence_rule: getNewRRule(),
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
  const ruleDescription = template ? describeRRule(template.recurrence_rule) : '';

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ ...heading, marginBottom: space[1] }}>Edit Recurring Task</div>
        <div style={{ ...textMuted, marginBottom: space[4], fontSize: font.size.sm }}>
          {ruleDescription}
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
          <label style={labelStyle}>Frequency</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {(frequency === 'weekly' || frequency === 'biweekly') && (
          <div style={field}>
            <label style={labelStyle}>Days of week</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
              {WEEKDAY_CODES.map((code, i) => (
                <label key={code} style={{ display: 'flex', alignItems: 'center', gap: space[1], cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(code)}
                    onChange={() => toggleWeekday(code)}
                  />
                  <span style={{ fontSize: font.size.sm }}>{WEEKDAY_NAMES[i].slice(0, 3)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {template?.default_tag_id && (
          <div style={{ ...field, ...textMuted, fontSize: font.size.xs }}>
            Tag and checklist are set from any occurrence via Edit task → "All occurrences", not here.
          </div>
        )}

        {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
          <button type="button" style={buttonDanger} onClick={remove} disabled={busy}>
            Delete
          </button>
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
