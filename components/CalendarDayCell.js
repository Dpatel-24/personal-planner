// CalendarDayCell — one day in the month grid. Droppable (useDroppable, id =
// the date string) so an empty day is still a valid drop target, and its
// visible chips are a dnd-kit SortableContext — the same droppable/sortable
// pairing WeekBoardColumn uses, just laid out for a compact grid cell instead
// of a full column.
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { color, space, radius, border, font } from '@/lib/tokens';
import CalendarChip from './CalendarChip';

const VISIBLE_LIMIT = 3;

export default function CalendarDayCell({
  dateStr,
  dayNum,
  inMonth,
  isToday,
  items,
  isLastRow,
  isLastCol,
  onToggleStatus,
  onEdit,
}) {
  const { setNodeRef } = useDroppable({ id: dateStr, data: { columnKey: dateStr } });
  const visible = items.slice(0, VISIBLE_LIMIT);
  const itemIds = visible.map((i) => i.id);

  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 104,
        padding: space[1],
        background: inMonth ? color.bg : color.bgSubtle,
        borderBottom: isLastRow ? border.none : border.default,
        borderRight: isLastCol ? border.none : border.default,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          minWidth: 20,
          textAlign: 'center',
          fontSize: font.size.xs,
          fontWeight: isToday ? font.weight.semibold : font.weight.normal,
          color: isToday ? color.white : inMonth ? color.text : color.textSubtle,
          background: isToday ? color.accent : 'transparent',
          borderRadius: radius.full,
          padding: `0 ${space[1]}`,
          marginBottom: space[1],
        }}
      >
        {dayNum}
      </div>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {visible.map((t) => (
          <CalendarChip
            key={t.id}
            instance={t}
            columnKey={dateStr}
            onToggleStatus={onToggleStatus}
            onEdit={onEdit}
          />
        ))}
      </SortableContext>
      {items.length > VISIBLE_LIMIT && (
        <div style={{ fontSize: font.size.xs, color: color.textMuted, paddingLeft: space[1] }}>
          +{items.length - VISIBLE_LIMIT} more
        </div>
      )}
    </div>
  );
}
