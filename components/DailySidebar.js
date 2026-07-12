// DailySidebar — the always-visible right panel: today's tasks with add /
// complete / skip, all through the shared data layer (no view-owned queries).
import { useCallback, useEffect, useState } from 'react';
import {
  fetchInstancesForDate,
  createOneOffTask,
  setInstanceStatus,
} from '@/lib/data';
import { todayStr, humanDate } from '@/lib/dates';
import { color, space, border } from '@/lib/tokens';
import {
  input as inputStyle,
  buttonPrimary,
  buttonSecondary,
  heading,
  textMuted,
} from '@/lib/components';
import TaskRow from './TaskRow';
import RecurringCreateModal from './RecurringCreateModal';
import EditModal from './EditModal';
import { useRefresh } from './RefreshContext';

export default function DailySidebar() {
  const { version, refresh } = useRefresh();
  const [today] = useState(todayStr);
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks(await fetchInstancesForDate(today));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [today, version]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle('');
    try {
      await createOneOffTask({ title: t, scheduledDate: today });
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const onSetStatus = async (id, status) => {
    try {
      await setInstanceStatus(id, status);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: space[4], borderBottom: border.default }}>
        <h2 style={heading}>Today</h2>
        <div style={{ ...textMuted, marginTop: space[1] }}>{humanDate(today)}</div>
      </div>

      <div style={{ padding: space[4], borderBottom: border.default }}>
        <form onSubmit={add} style={{ display: 'flex', gap: space[2] }}>
          <input
            style={inputStyle}
            placeholder="Add a task for today"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" style={buttonPrimary}>
            Add
          </button>
        </form>
        <button
          type="button"
          style={{ ...buttonSecondary, width: '100%', marginTop: space[2] }}
          onClick={() => setShowRecurring(true)}
        >
          New recurring task
        </button>
      </div>

      {showRecurring && (
        <RecurringCreateModal onClose={() => setShowRecurring(false)} onCreated={refresh} />
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: space[2] }}>
        {loading ? (
          <div style={{ ...textMuted, padding: space[2] }}>Loading…</div>
        ) : error ? (
          <div style={{ color: color.danger, padding: space[2] }}>{error}</div>
        ) : tasks.length === 0 ? (
          <div style={{ ...textMuted, padding: space[2] }}>No tasks today.</div>
        ) : (
          tasks.map((t) => (
            <TaskRow key={t.id} instance={t} onSetStatus={onSetStatus} onEdit={setEditing} />
          ))
        )}
      </div>

      {editing && (
        <EditModal instance={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </div>
  );
}
