// GoalNode — one row in a goal tree, rendering itself recursively for its
// children. This codebase has no existing nested/collapsible TREE component
// to reuse (checked first: ChecklistSection.js is a flat checkbox list with
// no nesting; CalendarDayCell.js has an expand/collapse boolean but for a
// flat "+X more" overflow, not a tree). What IS reused from those: the
// checkbox-toggles-a-boolean row shape from ChecklistSection, and the local
// expanded-boolean toggle pattern from CalendarDayCell — recomposed here
// into the one new piece this app didn't have, a recursive node.
//
// A leaf (no children) shows a checkbox wired to is_complete. A non-leaf
// shows get_goal_progress()'s percentage as a bar instead of a checkbox —
// its own completion is derived from its leaf descendants, never set
// directly. Expand/collapse state is local to each node (not lifted to the
// page) since it's pure UI state, not something a refetch needs to know
// about.
import { useState } from 'react';
import { color, space, radius, font } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';

const INDENT_PX = 20;

export default function GoalNode({ goal, childrenByParent, progressByGoalId, depth, onToggleComplete, onAddSubgoal }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const kids = childrenByParent[goal.id] || [];
  const isLeaf = kids.length === 0;
  const progress = progressByGoalId[goal.id]; // undefined until fetched; only meaningful for non-leaf nodes

  const row = {
    display: 'flex',
    alignItems: 'center',
    gap: space[2],
    padding: `${space[2]} 0`,
    paddingLeft: depth * INDENT_PX,
    borderBottom: `1px solid ${color.bgSubtle}`,
  };

  const chevron = {
    ...buttonGhost,
    padding: 0,
    width: 20,
    height: 20,
    fontSize: font.size.sm,
    color: color.textMuted,
    visibility: isLeaf ? 'hidden' : 'visible', // reserves the space either way, so titles stay aligned
  };

  const progressBarOuter = {
    width: 80,
    height: 6,
    borderRadius: radius.full,
    background: color.bgMuted,
    overflow: 'hidden',
    flexShrink: 0,
  };

  const progressBarInner = (pct) => ({
    width: `${pct}%`,
    height: '100%',
    background: color.accent,
    borderRadius: radius.full,
  });

  return (
    <div>
      <div style={row}>
        <button
          type="button"
          style={chevron}
          onClick={() => setExpanded((e) => !e)}
          disabled={isLeaf}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {isLeaf ? '' : expanded ? '▾' : '▸'}
        </button>

        {isLeaf ? (
          <input
            type="checkbox"
            checked={goal.is_complete}
            onChange={() => onToggleComplete(goal)}
            aria-label={goal.is_complete ? 'Mark not done' : 'Mark done'}
          />
        ) : (
          <div style={progressBarOuter}>
            {progress !== undefined && <div style={progressBarInner(progress)} />}
          </div>
        )}

        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: font.size.md,
            color: isLeaf && goal.is_complete ? color.textMuted : color.text,
            textDecoration: isLeaf && goal.is_complete ? 'line-through' : 'none',
            wordBreak: 'break-word',
          }}
        >
          {goal.title}
        </span>

        {!isLeaf && (
          <span style={{ fontSize: font.size.xs, color: color.textMuted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {progress !== undefined ? `${progress}%` : '…'}
          </span>
        )}

        <button
          type="button"
          style={{ ...buttonGhost, padding: `0 ${space[1]}`, fontSize: font.size.sm, flexShrink: 0 }}
          onClick={() => onAddSubgoal(goal)}
          aria-label={`Add sub-goal under ${goal.title}`}
        >
          + Sub-goal
        </button>
      </div>

      {expanded && !isLeaf && (
        <div>
          {kids.map((child) => (
            <GoalNode
              key={child.id}
              goal={child}
              childrenByParent={childrenByParent}
              progressByGoalId={progressByGoalId}
              depth={depth + 1}
              onToggleComplete={onToggleComplete}
              onAddSubgoal={onAddSubgoal}
            />
          ))}
        </div>
      )}
    </div>
  );
}
