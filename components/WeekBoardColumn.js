// WeekBoardColumn — a single column (Inbox or one day) in the week board.
// Droppable (via useDroppable, so an EMPTY column is still a valid drop
// target) and its card list is a dnd-kit SortableContext for within-column
// reordering. isToday drives the accent header (CLAUDE.md v2 decision: today
// gets a visually distinct header via tokens, no ad hoc colors). isInbox
// drives a slightly different container treatment, also token-only.
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { space, radius, border, font, color } from '@/lib/tokens';
import { panel, textMuted } from '@/lib/components';
import WeekBoardCard from './WeekBoardCard';
import QuickAddCard from './QuickAddCard';

export default function WeekBoardColumn({
  columnKey,
  title,
  items,
  isToday = false,
  isInbox = false,
  onToggleStatus,
  onEdit,
  onCreated,
}) {
  const { setNodeRef } = useDroppable({ id: columnKey, data: { columnKey } });

  // Width comes from the .week-column CSS class (styles/globals.css), not an
  // inline value — a media query there shrinks it on mobile so one column
  // reads as a natural swipeable card instead of desktop's fixed 220px.
  //
  // display:flex + flexDirection:column here, paired with the content div's
  // flex:1 below, is what makes the droppable region cover the WHOLE column
  // height instead of just wherever the cards happen to end. Without it, a
  // short column (few cards) only registers drops near its own content —
  // its parent row still stretches this div to match the tallest sibling
  // column (default flex align-items:stretch), but a plain block child
  // doesn't inherit that extra height into its own layout on its own.
  const columnStyle = {
    ...panel,
    flexShrink: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    background: isInbox ? color.bgMuted : color.bgSubtle,
    border: isInbox ? border.strong : border.default,
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: `${space[2]} ${space[3]}`,
    borderBottom: border.default,
    borderRadius: `${radius.lg} ${radius.lg} 0 0`,
    background: isToday ? color.accentSubtle : 'transparent',
  };

  const titleStyle = {
    fontSize: font.size.sm,
    fontWeight: isToday || isInbox ? font.weight.semibold : font.weight.medium,
    color: isToday ? color.accent : color.text,
  };

  const itemIds = items.map((i) => i.id);

  return (
    <div className="week-column" style={columnStyle} data-today={isToday ? 'true' : undefined}>
      <div style={headerStyle}>
        <span style={titleStyle}>{title}</span>
        <span style={{ ...textMuted, fontSize: font.size.xs }}>{items.length}</span>
      </div>
      <div ref={setNodeRef} style={{ padding: space[2], minHeight: 48, flex: 1 }}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div style={{ ...textMuted, fontSize: font.size.xs, padding: space[1] }}>Nothing here.</div>
          ) : (
            items.map((i) => (
              <WeekBoardCard
                key={i.id}
                instance={i}
                columnKey={columnKey}
                onToggleStatus={onToggleStatus}
                onEdit={onEdit}
              />
            ))
          )}
        </SortableContext>
        <QuickAddCard scheduledDate={isInbox ? null : columnKey} onCreated={onCreated} />
      </div>
    </div>
  );
}
