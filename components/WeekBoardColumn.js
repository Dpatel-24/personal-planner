// WeekBoardColumn — a single column (Inbox or one day) in the week board.
// isToday drives the accent header (CLAUDE.md v2 decision: today gets a
// visually distinct header via tokens, no ad hoc colors). isInbox drives a
// slightly different container treatment so it reads as structurally
// separate from the Mon-Sun columns, also token-only.
import { space, radius, border, font, color } from '@/lib/tokens';
import { panel, textMuted } from '@/lib/components';
import WeekBoardCard from './WeekBoardCard';

export default function WeekBoardColumn({
  title,
  items,
  isToday = false,
  isInbox = false,
  onToggleStatus,
  onEdit,
}) {
  const columnStyle = {
    ...panel,
    width: 220,
    flexShrink: 0,
    padding: 0,
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

  return (
    <div style={columnStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>{title}</span>
        <span style={{ ...textMuted, fontSize: font.size.xs }}>{items.length}</span>
      </div>
      <div style={{ padding: space[2] }}>
        {items.length === 0 ? (
          <div style={{ ...textMuted, fontSize: font.size.xs, padding: space[1] }}>Nothing here.</div>
        ) : (
          items.map((i) => (
            <WeekBoardCard key={i.id} instance={i} onToggleStatus={onToggleStatus} onEdit={onEdit} />
          ))
        )}
      </div>
    </div>
  );
}
