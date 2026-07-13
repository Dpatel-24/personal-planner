// RecurringCreateModal — preset-based recurring task creation (no raw RRULE).
import { useState } from 'react';
import Modal from './Modal';
import { createRecurringTask } from '@/lib/data';
import { buildRRule, describeRRule, FREQUENCIES } from '@/lib/rrulePresets';
import { todayStr } from '@/lib/dates';
import { color, space, radius, border, font } from '@/lib/tokens';
import {
  input as inputStyle,
  label as labelStyle,
  buttonPrimary,
  buttonSecondary,
  heading,
  textMuted,
} from '@/lib/components';

const WEEKDAYS = [
  ['MO', 'Mon'],
  ['TU', 'Tue'],
  ['WE', 'Wed'],
  ['TH', 'Thu'],
  ['FR', 'Fri'],
  ['SA', 'Sat'],
  ['SU', 'Sun'],
];

export default function RecurringCreateModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [freq, setFreq] = useState('weekly');
  const [weekdays, setWeekdays] = useState([]);
  const [endDate, setEndDate] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const showWeekdays = freq === 'weekly' || freq === 'biweekly';
  const rule = startDate ? buildRRule(freq, { startDate, weekdays }) : '';

  const toggleDay = (code) =>
    setWeekdays((w) => (w.includes(code) ? w.filter((x) => x !== code) : [...w, code]));

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!startDate) {
      setError('Start date is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createRecurringTask({
        title: title.trim(),
        description: description.trim(),
        recurrenceRule: rule,
        startDate,
        endDate: endDate || null,
        tag: tag.trim() || null,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const dayBtn = (active) => ({
    padding: `${space[1]} ${space[2]}`,
    borderRadius: radius.sm,
    border: active ? border.accent : border.default,
    background: active ? color.accentSubtle : color.white,
    color: active ? color.accent : color.textMuted,
    fontSize: font.size.xs,
    fontFamily: font.family,
    cursor: 'pointer',
  });

  const field = { marginBottom: space[3] };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ ...heading, marginBottom: space[4] }}>New recurring task</div>

        <div style={field}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div style={field}>
          <label style={labelStyle}>Description (optional)</label>
          <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={field}>
          <label style={labelStyle}>Starts</label>
          <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div style={field}>
          <label style={labelStyle}>Repeats</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={freq} onChange={(e) => setFreq(e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {showWeekdays && (
          <div style={field}>
            <label style={labelStyle}>On days (defaults to the start day)</label>
            <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
              {WEEKDAYS.map(([code, lbl]) => (
                <button key={code} type="button" style={dayBtn(weekdays.includes(code))} onClick={() => toggleDay(code)}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={field}>
          <label style={labelStyle}>Ends (optional)</label>
          <input style={inputStyle} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div style={field}>
          <label style={labelStyle}>Tag (optional)</label>
          <input
            style={inputStyle}
            placeholder="e.g. Work"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </div>

        {rule && (
          <div style={{ ...textMuted, marginBottom: space[4] }}>Repeats {describeRRule(rule)}.</div>
        )}

        {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <button type="button" style={buttonSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimary} disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
