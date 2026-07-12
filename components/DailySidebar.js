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
import { input as inputStyle, buttonPrimary, heading, textMuted } from '@/lib/components';
import TaskRow from './TaskRow';

export default function DailySidebar() {
  const [today] = useState(todayStr);
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks(await fetchInstancesForDate(today));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [today]);

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
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const onSetStatus = async (id, status) => {
    try {
      await setInstanceStatus(id, status);
      await load();
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

      <form
        onSubmit={add}
        style={{ display: 'flex', gap: space[2], padding: space[4], borderBottom: border.default }}
      >
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

      <div style={{ flex: 1, overflowY: 'auto', padding: space[2] }}>
        {loading ? (
          <div style={{ ...textMuted, padding: space[2] }}>Loading…</div>
        ) : error ? (
          <div style={{ color: color.danger, padding: space[2] }}>{error}</div>
        ) : tasks.length === 0 ? (
          <div style={{ ...textMuted, padding: space[2] }}>No tasks today.</div>
        ) : (
          tasks.map((t) => <TaskRow key={t.id} instance={t} onSetStatus={onSetStatus} />)
        )}
      </div>
    </div>
  );
}
