// RecurringTasksModal — displays all recurring task templates with their
// details (title, description, recurrence rule, tag, active status). Opened
// from the TagManagerModal as a secondary "view all recurring" feature.
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getRecurringTasks } from '@/lib/tag-queries';
import { color, space, radius, font } from '@/lib/tokens';
import { buttonGhost, heading, textMuted } from '@/lib/components';

export default function RecurringTasksModal({ onClose, onEditTask }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRecurringTasks()
      .then(setTasks)
      .catch((e) => setError(e.message));
  }, []);

  const row = { display: 'flex', alignItems: 'flex-start', gap: space[2], padding: `${space[2]} 0`, borderBottom: `1px solid ${color.bgSubtle}` };

  return (
    // Wider than this app's default 420px modal — this list packs title +
    // description + rule + tag + an Edit button into one row per task, which
    // was cramped at the default width. See the single-scroll-container note
    // below for the other half of this fix.
    <Modal onClose={onClose} width={640}>
      <div style={{ ...heading, marginBottom: space[1] }}>Recurring Tasks</div>
      <div style={{ ...textMuted, marginBottom: space[4] }}>
        All recurring task templates. Click Edit to modify.
      </div>

      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginBottom: space[2] }}>{error}</div>}

      {tasks.length === 0 ? (
        <div style={textMuted}>No recurring tasks.</div>
      ) : (
        // No inner maxHeight/overflowY here — Modal's own maxHeight:90vh +
        // overflowY:auto already scrolls the whole modal body. A second,
        // independent scroll container nested inside it (this div previously
        // had its own maxHeight:400/overflowY:auto) is what let a row far
        // down the list — e.g. "Bills" — end up in the dead zone between the
        // two independently-scrolling boxes, unreachable/unclickable. One
        // scroll container, and every row is reachable by scrolling the
        // modal itself.
        <div>
          {tasks.map((task) => (
            <div key={task.id} style={row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[1], marginBottom: space[1] }}>
                  {task.defaultTagRow && (
                    <span
                      title={task.defaultTagRow.name}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: radius.full,
                        background: task.defaultTagRow.color || color.accent,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.text, wordBreak: 'break-word' }}>
                    {task.title || '(untitled)'}
                  </div>
                  <span style={{ fontSize: font.size.xs, color: color.textMuted, marginLeft: 'auto', flexShrink: 0 }}>
                    {task.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {task.description && (
                  <div style={{ fontSize: font.size.sm, color: color.textMuted, marginBottom: space[1], wordBreak: 'break-word' }}>
                    {task.description}
                  </div>
                )}
                {/* wordBreak: an RRULE string ("FREQ=WEEKLY;BYDAY=SA") has no
                    spaces — without an explicit break rule a long one can
                    force this row wider than the modal, which is exactly
                    what makes a fixed-width flex layout look "cut off": the
                    row (and the Edit button pinned to its end) push past the
                    modal's own edge instead of the text wrapping in place. */}
                <div style={{ fontSize: font.size.xs, color: color.textMuted, wordBreak: 'break-word' }}>
                  Rule: {task.recurrence_rule || 'N/A'}
                </div>
                {task.defaultTagRow && (
                  <div style={{ fontSize: font.size.xs, color: color.textMuted, marginTop: space[1] }}>
                    Default tag: {task.defaultTagRow.name}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEditTask(task.id)}
                style={{ ...buttonGhost, padding: `${space[1]} ${space[2]}`, fontSize: font.size.sm, flexShrink: 0 }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[4] }}>
        <button type="button" style={buttonGhost} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
