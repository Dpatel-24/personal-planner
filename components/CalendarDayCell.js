// CalendarDayCell — one day's TASKS in the month grid. The day-number badge
// used to live here too, but moved out to CalendarView.js's own render loop
// (2026-08) so a week's layout could become three stacked pieces — a row of
// 7 date badges, then one optional full-width sprint-focus chip, then this
// row of 7 task cells — instead of the date and tasks being welded into one
// cell with no room to insert anything between them. This component is now
// purely the droppable task area: no date, no "isToday" styling, just
// items in vs. items rendered.
//
// Droppable (useDroppable, id = the date string) so an empty day is still a
// valid drop target, and its visible chips are a dnd-kit SortableContext —
// the same droppable/sortable pairing WeekBoardColumn uses, just laid out
// for a compact grid cell instead of a full column. Clicking "+X more"
// expands to show all tasks for the day.
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { color, space, font, border } from '@/lib/tokens';
import CalendarChip from './CalendarChip';

const VISIBLE_LIMIT = 3;

export default function CalendarDayCell({
  dateStr,
  inMonth,
  items,
  isLastRow,
  isLastCol,
  onToggleStatus,
  onEdit,
}) {
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef } = useDroppable({ id: dateStr, data: { columnKey: dateStr } });
  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT);
  const itemIds = visible.map((i) => i.id);

  return (
    <div
      ref={setNodeRef}
      style={{
        // 88, not the old 104 — that included room for the date badge,
        // which no longer lives inside this cell.
        minHeight: expanded ? 'auto' : 88,
        minWidth: 0,
        overflow: expanded ? 'visible' : 'hidden',
        padding: space[1],
        background: inMonth ? color.bg : color.bgSubtle,
        // Week separator — this cell is now the visual "bottom" of each
        // week block (date row and the optional sprint chip above it carry
        // no border of their own), so this is the only line marking where
        // one week ends and the next begins.
        borderBottom: isLastRow ? border.none : border.default,
        borderRight: isLastCol ? border.none : border.default,
      }}
    >
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          style={{
            fontSize: font.size.xs,
            color: color.accent,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: `0 ${space[1]}`,
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          {expanded ? 'Show less' : `+${items.length - VISIBLE_LIMIT} more`}
        </button>
      )}
    </div>
  );
}
