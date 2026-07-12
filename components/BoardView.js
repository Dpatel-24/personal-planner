// BoardView — Trello-style board that GROUPS the shared instances by status
// (CLAUDE.md: board = group by status). Bounded to a 28-day window so the
// Done/Skipped columns don't grow unbounded.
import { useCallback, useEffect, useState } from 'react';
import { fetchInstances, setInstanceStatus } from '@/lib/data';
import { todayStr, humanDate, addDays } from '@/lib/dates';
import { color, space, font } from '@/lib/tokens';
import { panel, textMuted } from '@/lib/components';
import BoardCard from './BoardCard';
import { useRefresh } from './RefreshContext';

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'done', label: 'Done' },
  { key: 'skipped', label: 'Skipped' },
];

export default function BoardView() {
  const { version, refresh } = useRefresh();
  const [today] = useState(todayStr);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const from = addDays(today, -14);
  const to = addDays(today, 13);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInstances(await fetchInstances({ from, to }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, version]);

  useEffect(() => {
    load();
  }, [load]);

  const onSetStatus = async (id, status) => {
    try {
      await setInstanceStatus(id, status);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div style={textMuted}>Loading…</div>;
  if (error) return <div style={{ color: color.danger }}>{error}</div>;

  return (
    <div>
      <div style={{ ...textMuted, marginBottom: space[3] }}>
        {humanDate(from)} – {humanDate(to)}
      </div>
      <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-start' }}>
        {COLUMNS.map((col) => {
          const items = instances.filter((i) => i.status === col.key);
          return (
            <div key={col.key} style={{ ...panel, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: space[3],
                }}
              >
                <span
                  style={{
                    fontSize: font.size.md,
                    fontWeight: font.weight.semibold,
                    color: color.text,
                  }}
                >
                  {col.label}
                </span>
                <span style={textMuted}>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ ...textMuted, fontSize: font.size.sm }}>Nothing here.</div>
              ) : (
                items.map((i) => (
                  <BoardCard key={i.id} instance={i} onSetStatus={onSetStatus} />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
