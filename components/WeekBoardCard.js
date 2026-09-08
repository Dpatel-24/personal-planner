// WeekBoardCard — one task_instance in a week-board column. Draggable via
// @dnd-kit/sortable for all cards (including recurring non-override — they
// must LOOK draggable per spec), but only eligible cards persist on drop; see
// WeekBoardView's handleDragEnd for the eligibility check. Title + description,
// a checkbox reflecting status, and a "carried over" badge when is_overdue is
// true (computed in lib/board-queries.js, not a DB column).
//
// Click vs. drag: the DndContext's PointerSensor uses an activation distance
// (see WeekBoardView), so a plain click (no movement) never starts a drag and
// still opens the v1 edit flow; only the checkbox stops propagation so it can
// toggle status independently of that click.
//
// No start-timer button here — starting a timer isn't exposed anywhere in
// the current UI (see lib/timer-queries.js's startTimer). This card still
// shows the read-only total-tracked-time (and colors it while timing)
// since that's informational, not a control.
import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '@/lib/tokens';
import { card as cardStyle } from '@/lib/components';
import { getTagCardStyle } from '@/lib/tag-styles';
import { useTimer } from './TimerContext';
import { useRefresh } from './RefreshContext';
import { formatDuration } from '@/lib/timer-queries';
import { toggleChecklistItem } from '@/lib/checklist-queries';

export default function WeekBoardCard({ instance, columnKey, onToggleStatus, onEdit }) {
  const [busy, setBusy] = useState(false);
  const done = instance.status === 'done';
  const { activeTimer } = useTimer();
  const isTiming = activeTimer?.instance_id === instance.id;
  const { refresh } = useRefresh();

  // Checklist breakdown shown directly on the card (2026-09 ask: "I should
  // not have to click on the card to see the breakdown") — toggling an item
  // here writes immediately via the SAME toggleChecklistItem
  // (lib/checklist-queries.js) EditModal's own ChecklistSection already
  // uses, not a second write path, then refresh()es like every other board
  // write. stopPropagation on both the row and its pointerdown, same
  // pattern the status checkbox below already establishes, so tapping an
  // item never also opens EditModal (the card's own onClick) or gets
  // captured by dnd-kit's drag sensor.
  const toggleItem = async (e, item) => {
    e.stopPropagation();
    try {
      await toggleChecklistItem(item.id, !item.is_done);
      refresh();
    } catch {
      // Swallowed deliberately: a failed checklist toggle isn't worth a
      // card-level error banner (this card has none to show it in) — the
      // next refresh already reconciles to whatever's really in the DB,
      // same failure handling EditModal's own ChecklistSection relies on.
    }
  };

  // Re-render every second while THIS card's timer is the active one, so the
  // live portion of the total keeps ticking without a re-fetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isTiming) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isTiming]);

  const liveSeconds = isTiming
    ? (Date.now() - new Date(activeTimer.started_at).getTime()) / 1000
    : 0;
  const totalTrackedSeconds = (instance.tracked_seconds || 0) + liveSeconds;

  // Pinned tasks (Morning Chain/Evening Winddown) are excluded from the
  // draggable set entirely — disabled:true is dnd-kit's own supported way
  // to register a sortable item that can never be picked up (still a valid
  // hook call every render, just inert), and attributes/listeners are
  // withheld below so there's no grab cursor/pointer-down handler either.
  // Per the spec's own recommended simplification: no drag handle, not a
  // valid drop target, always renders at its fixed position (WeekBoardColumn
  // renders pinned cards outside the SortableContext's items list).
  const pinned = !!instance.pinned_position;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
    data: { columnKey, instance },
    disabled: pinned,
  });

  const toggle = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await onToggleStatus(instance.id, done ? 'todo' : 'done');
    } finally {
      setBusy(false);
    }
  };

  const badge = {
    display: 'inline-block',
    marginTop: space[1],
    padding: `0 ${space[1]}`,
    fontSize: font.size.xs,
    color: color.danger,
    background: color.dangerSubtle,
    borderRadius: radius.sm,
  };

  return (
    <div
      ref={setNodeRef}
      onClick={() => onEdit(instance)}
      style={{
        ...cardStyle,
        ...getTagCardStyle(instance.tag),
        padding: space[3],
        marginBottom: space[2],
        cursor: pinned ? 'default' : 'grab',
        // Dynamic, not static: 'none' only while a drag is ACTUALLY in
        // progress (isDragging, set by dnd-kit itself once its own
        // activationConstraint distance is crossed — see
        // lib/dragAndDrop.js's useDragSensors), so the browser still owns
        // native scrolling over the card the rest of the time. A static
        // touch-action:'none' (the previous value here) blocks native
        // touch scroll on this card unconditionally, drag or not — every
        // swipe that starts on a card (most of a populated column) has to
        // go through JS/dnd-kit's own pointer handling with no native
        // momentum, which is what read as "overly sensitive scroll /
        // sometimes triggers a drag" on mobile. 'pan-y' (not 'auto') keeps
        // vertical scroll unambiguous even while dnd-kit's own pointer
        // listeners are still attached before the activation threshold is
        // crossed.
        touchAction: isDragging ? 'none' : 'pan-y',
        transform: CSS.Transform.toString(transform),
        transition,
        // V6: done state is reduced opacity + strikethrough (below), never a
        // color change — distinct from the transient isDragging/busy dims.
        opacity: isDragging ? 0.4 : busy ? 0.5 : done ? 0.6 : 1,
      }}
      {...(pinned ? {} : attributes)}
      {...(pinned ? {} : listeners)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={toggle}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ marginTop: 3, flexShrink: 0 }}
          aria-label={done ? 'Mark not done' : 'Mark done'}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
            {instance.tag && (
              <span
                title={instance.tag.name}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.full,
                  // tags.color is nullable (no color-picker UI yet) — fall
                  // back to the accent token so every tag still shows a dot.
                  background: instance.tag.color || color.accent,
                  flexShrink: 0,
                }}
              />
            )}
            <div
              style={{
                fontSize: font.size.md,
                // V6: done state is the card's own opacity dim (above) +
                // this strikethrough — title color stays constant either way.
                color: color.inkV6,
                textDecoration: done ? 'line-through' : 'none',
                wordBreak: 'break-word',
              }}
            >
              {instance.title || '(untitled)'}
            </div>
          </div>
          {instance.description && (
            <div
              style={{
                fontSize: font.size.xs,
                color: color.textMuted,
                marginTop: space[1],
                wordBreak: 'break-word',
              }}
            >
              {instance.description}
            </div>
          )}
          {instance.checklist_total > 0 && (
            <div style={{ marginTop: space[1] }}>
              <div style={{ fontSize: font.size.xs, color: color.textMuted }}>
                {instance.checklist_done}/{instance.checklist_total}
              </div>
              <div style={{ marginTop: 2 }}>
                {instance.checklist_items.map((item) => (
                  <div
                    key={item.id}
                    onClick={(e) => toggleItem(e, item)}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: space[1],
                      padding: `1px 0`,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.is_done}
                      readOnly
                      style={{ marginTop: 2, flexShrink: 0, width: 11, height: 11 }}
                    />
                    <span
                      style={{
                        fontSize: font.size.xs,
                        color: item.is_done ? color.textSubtle : color.textMuted,
                        textDecoration: item.is_done ? 'line-through' : 'none',
                        wordBreak: 'break-word',
                      }}
                    >
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {totalTrackedSeconds > 0 && (
            <div
              style={{
                fontSize: font.size.xs,
                color: isTiming ? color.navy : color.textMuted,
                marginTop: space[1],
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDuration(totalTrackedSeconds)}
            </div>
          )}
          {instance.is_overdue && <span style={badge}>carried over</span>}
        </div>
      </div>
    </div>
  );
}
