// GoalGraph — left-to-right node-graph layout for the Goals page. Fed the
// real `goals` table via pages/goals.js's buildGoalForests(). Pure
// presentational component: given a forest (array of root nodes, each
// `{ id, title, children: [...] }` or `{ id, title, done }` for a leaf), it
// computes its own layout and draws it — persistence (rename, leaf toggle)
// is entirely the caller's job via the onRename/onToggleLeaf props.
//
// No graph/diagram library — same "primitives composed in the component, no
// external dependency for something this app can express directly" approach
// already used for the dashboard's bar/line views.
//
// Styling note: the ask referenced var(--line-empty) for connector/track
// color, but no such token exists (checked lib/tokens.js and
// styles/globals.css before writing this) — only ink/paper/card/muted/
// mutedFaint/coherence/resistance/execution/state tokens do. The ask itself
// allows "var(--line-empty) or similar light neutral", so this uses
// color.mutedFaint (#B0AFA9), the lightest neutral already in that set,
// rather than defining a new token for one component.
//
// Inline rename: each node's title doubles as a click-to-edit field. Only
// one editingId is tracked at a time (component-local state, same "pure UI
// state doesn't need to live on the page" reasoning as GoalNode's old
// per-node `expanded` state) — committing (Enter/blur) calls onRename(id,
// newTitle) and lets the caller own the actual persistence + refetch;
// Escape cancels via a skipNextBlur ref so the blur handler that would
// otherwise fire right after doesn't also commit the reverted value.
//
// Add sub-goal: every card (leaf or not — any goal can gain children, a
// leaf simply becomes non-leaf the moment it does) carries a small "+"
// button calling onAddSubgoal(id). GoalNode.js (the old to-do-list
// renderer) had a working version of this; it's dead code now, since
// nothing renders GoalNode anymore post-graph-refactor, and this
// component — the one actually on screen — had never grown an equivalent.
// Built fresh here rather than resurrecting GoalNode.
//
// autoEditId: the caller (pages/goals.js) sets this to a freshly-created
// goal's id right after insert + refetch, so the new node opens already in
// rename mode instead of landing silently with a "New Goal" placeholder
// title the user has to go hunt down and click themselves. Consumed via
// onAutoEditConsumed so it doesn't re-trigger edit mode on a later,
// unrelated re-render (e.g. toggling some other leaf).
//
// Delete: a small "×" next to the "+" button calls onDeleteGoal(id) with no
// confirmation of its own — the caller (pages/goals.js) owns building the
// leaf-vs-non-leaf confirmation copy (it needs a descendant count from the
// full flat `goals` list, which this component never receives — it only
// ever sees ONE tree's worth of already-shaped nodes) and the actual
// deleteGoal() + refetch. This component's job stays purely presentational,
// same division as onRename/onToggleLeaf/onAddSubgoal above.
import { useEffect, useRef, useState } from 'react';
import { color, space, radius, font } from '@/lib/tokens';

const COLUMN_WIDTH = 270; // px between depth columns
const ROW_HEIGHT = 46; // px between stacked leaf rows
const LEAF_CARD_WIDTH = 220;
const LEAF_CARD_HEIGHT = 40;
const ROOT_CARD_WIDTH = 240; // "slightly larger" than non-root, per the ask
const NON_LEAF_CARD_HEIGHT = 52; // room for the title row + "X of Y complete" subtext row
const PADDING = 24; // outer margin so edge cards/curves aren't clipped
const RING_SIZE = 20;
const RING_STROKE = 3;

function cardWidth(isRoot) {
  return isRoot ? ROOT_CARD_WIDTH : LEAF_CARD_WIDTH;
}
function cardHeight(isLeaf) {
  return isLeaf ? LEAF_CARD_HEIGHT : NON_LEAF_CARD_HEIGHT;
}

// Same layout algorithm as before (see git history for the original
// comment): depth -> x, a single leaf-counter running across the WHOLE
// forest -> leaf y, non-leaf y = midpoint of its own children's y range,
// computed bottom-up. Widths/heights now vary by node type (see above), so
// this also carries each node's own box size forward for the renderer and
// the connector math, instead of assuming one fixed size for everything.
//
// Nodes now carry their own real `id` (a `goals` table UUID) instead of a
// synthetic "root0-1-2" string built here — inline rename/toggle need to
// address the actual database row, so the id has to be the real one all the
// way through, not a position-derived label reassigned on every render.
function layoutForest(roots) {
  const nodes = [];
  const edges = [];
  let leafCounter = 0;

  function countLeaves(node) {
    if (!node.children || node.children.length === 0) {
      return { done: node.done ? 1 : 0, total: 1 };
    }
    return node.children.reduce(
      (acc, child) => {
        const c = countLeaves(child);
        return { done: acc.done + c.done, total: acc.total + c.total };
      },
      { done: 0, total: 0 }
    );
  }

  function layout(node, depth) {
    const isRoot = depth === 0;
    const isLeaf = !node.children || node.children.length === 0;
    const width = cardWidth(isRoot);
    const height = cardHeight(isLeaf);
    let y;
    if (isLeaf) {
      y = leafCounter * ROW_HEIGHT;
      leafCounter += 1;
    } else {
      const childYs = node.children.map((child) => layout(child, depth + 1));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      node.children.forEach((child) => edges.push({ from: node.id, to: child.id }));
    }
    const leaves = isLeaf ? null : countLeaves(node);
    // "Complete" for a ROOT specifically — a leaf root is complete when its
    // own done flag is set; a non-leaf root is complete when every leaf
    // under it is done (100%, and it actually has leaves — an empty
    // non-leaf can't be "complete"). Only meaningful on root nodes; computed
    // unconditionally anyway since it's cheap and harmless elsewhere.
    const complete = isLeaf ? !!node.done : leaves.total > 0 && leaves.done === leaves.total;
    nodes.push({
      id: node.id,
      title: node.title,
      done: node.done,
      complete,
      isLeaf,
      isRoot,
      width,
      height,
      x: depth * COLUMN_WIDTH,
      y,
      leavesDone: leaves?.done,
      leavesTotal: leaves?.total,
    });
    return y;
  }

  roots.forEach((root) => {
    layout(root, 0);
    leafCounter += 1; // one blank row of separation before the next tree
  });

  return { nodes, edges };
}

// Circular progress ring — SVG stroke-dasharray technique, filled
// color.coherenceText against a color.mutedFaint track, starting at 12
// o'clock (rotated -90deg) like a normal progress indicator.
function ProgressRing({ pct }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <svg width={RING_SIZE} height={RING_SIZE} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke={color.mutedFaint} strokeWidth={RING_STROKE} />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={r}
        fill="none"
        stroke={color.coherenceText}
        strokeWidth={RING_STROKE}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

// Leaf's circular checkbox — a plain circle (not a ring), filled solid with
// a white checkmark when checked, per the ask (distinct from the non-leaf
// progress ring, which is always a partial arc).
function LeafCheckbox({ checked, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={checked ? 'Mark not done' : 'Mark done'}
      style={{
        flexShrink: 0,
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: radius.full,
        border: checked ? 'none' : `2px solid ${color.mutedFaint}`,
        background: checked ? color.coherenceText : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      {checked && (
        <svg width={11} height={11} viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4.5" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export default function GoalGraph({
  data,
  onToggleLeaf,
  onRename,
  onAddSubgoal,
  onDeleteGoal,
  onArchiveGoal,
  onUnarchiveGoal,
  archivedView = false,
  autoEditId,
  onAutoEditConsumed,
}) {
  const { nodes, edges } = layoutForest(data);
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  // Escape sets this before blurring the input (blur fires right after) so
  // the blur handler below can tell "cancelled" apart from "clicked away to
  // commit" and skip writing the reverted value.
  const skipNextBlur = useRef(false);

  const startEdit = (n) => {
    skipNextBlur.current = false;
    setEditingId(n.id);
    setEditValue(n.title);
  };

  // Fires once per genuinely-new autoEditId — by the time the caller sets
  // it, `data` has already been refetched to include the new node (see
  // pages/goals.js), so nodesById[autoEditId] is guaranteed to resolve on
  // this same render. Consuming it immediately (onAutoEditConsumed) is what
  // keeps this from reopening edit mode on some later unrelated re-render.
  useEffect(() => {
    if (autoEditId && nodesById[autoEditId]) {
      startEdit(nodesById[autoEditId]);
      onAutoEditConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId]);

  const commitEdit = () => {
    const id = editingId;
    const trimmed = editValue.trim();
    setEditingId(null);
    if (!id || !trimmed || trimmed === nodesById[id]?.title) return; // no-op edit, nothing to persist
    onRename(id, trimmed);
  };

  const cancelEdit = () => {
    skipNextBlur.current = true;
    setEditingId(null);
  };

  const contentWidth = Math.max(...nodes.map((n) => n.x + n.width)) + PADDING * 2;
  const contentHeight = Math.max(...nodes.map((n) => n.y + n.height / 2)) + PADDING * 2;

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxWidth: '100%', maxHeight: '100%' }}>
      <div style={{ position: 'relative', width: contentWidth, height: contentHeight }}>
        {/* Connectors first, in normal document order — cards (painted
            after) sit visually on top without an explicit z-index. */}
        <svg width={contentWidth} height={contentHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
          {edges.map((e) => {
            const from = nodesById[e.from];
            const to = nodesById[e.to];
            const x1 = from.x + from.width + PADDING;
            const y1 = from.y + PADDING;
            const x2 = to.x + PADDING;
            const y2 = to.y + PADDING;
            const midX = (x1 + x2) / 2;
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={color.mutedFaint}
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {nodes.map((n) => {
          const pct = n.isLeaf ? null : n.leavesTotal > 0 ? Math.round((n.leavesDone / n.leavesTotal) * 100) : 0;
          return (
            <div
              key={n.id}
              className="goal-card"
              style={{
                position: 'absolute',
                left: n.x + PADDING,
                top: n.y + PADDING - n.height / 2,
                width: n.width,
                height: n.height,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 2,
                padding: `0 ${space[3]}`,
                background: color.card,
                border: n.isRoot ? `2px solid ${color.ink}` : `1px solid ${color.mutedFaint}`,
                borderRadius: radius.lg,
                overflow: 'hidden', // safety net — the subtext line already clips itself, this covers anything else
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                {n.isLeaf ? (
                  <LeafCheckbox checked={!!n.done} onToggle={() => onToggleLeaf(n.id)} />
                ) : (
                  <ProgressRing pct={pct} />
                )}
                {editingId === n.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEdit();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    onBlur={() => {
                      if (skipNextBlur.current) {
                        skipNextBlur.current = false;
                        return;
                      }
                      commitEdit();
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: n.isRoot ? font.size.md : font.size.sm,
                      fontWeight: n.isRoot ? font.weight.bold : font.weight.medium,
                      color: color.ink,
                      fontFamily: font.family,
                      border: `1px solid ${color.coherenceText}`,
                      borderRadius: radius.sm,
                      padding: '0 2px',
                      background: color.paper,
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(n);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: n.isRoot ? font.size.md : font.size.sm,
                      fontWeight: n.isRoot ? font.weight.bold : font.weight.medium,
                      color: n.isLeaf && n.done ? color.mutedFaint : color.ink,
                      textDecoration: n.isLeaf && n.done ? 'line-through' : 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'text',
                    }}
                    title={n.title}
                  >
                    {n.title}
                  </span>
                )}
                {!n.isLeaf && (
                  <span style={{ fontSize: font.size.xs, color: color.muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {pct}%
                  </span>
                )}
                {/* Archive/Unarchive — root cards only. Archive only shows up
                    once the root is actually complete (n.complete, computed
                    in layoutForest above); Unarchive shows on every root
                    card in the Completed view instead, the safety net back
                    out. Text buttons, not icon-only — this is a rarer
                    action than +/×, worth a label. */}
                {n.isRoot && !archivedView && n.complete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchiveGoal(n.id);
                    }}
                    aria-label={`Archive ${n.title}`}
                    title="Move to Completed"
                    style={{
                      flexShrink: 0,
                      padding: `2px ${space[2]}`,
                      borderRadius: radius.full,
                      border: `1px solid ${color.coherenceText}`,
                      background: 'transparent',
                      color: color.coherenceText,
                      fontSize: 11,
                      fontWeight: font.weight.medium,
                      lineHeight: 1.4,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Archive
                  </button>
                )}
                {n.isRoot && archivedView && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnarchiveGoal(n.id);
                    }}
                    aria-label={`Unarchive ${n.title}`}
                    title="Move back out of Completed"
                    style={{
                      flexShrink: 0,
                      padding: `2px ${space[2]}`,
                      borderRadius: radius.full,
                      border: `1px solid ${color.mutedFaint}`,
                      background: 'transparent',
                      color: color.muted,
                      fontSize: 11,
                      fontWeight: font.weight.medium,
                      lineHeight: 1.4,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Unarchive
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSubgoal(n.id);
                  }}
                  aria-label={`Add sub-goal under ${n.title}`}
                  title="Add sub-goal"
                  style={{
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                    borderRadius: radius.full,
                    border: `1px solid ${color.mutedFaint}`,
                    background: 'transparent',
                    color: color.muted,
                    fontSize: 13,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGoal(n.id);
                  }}
                  aria-label={`Delete ${n.title}`}
                  title="Delete goal"
                  style={{
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                    borderRadius: radius.full,
                    border: `1px solid ${color.mutedFaint}`,
                    background: 'transparent',
                    color: color.resistanceText,
                    fontSize: 12,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
              {!n.isLeaf && (
                <div
                  style={{
                    fontSize: font.size.xs,
                    color: color.muted,
                    // RING_SIZE is a bare number (px); space[2] is the STRING
                    // '8px' (lib/tokens.js's spacing scale is always
                    // unit-suffixed) — `RING_SIZE + space[2]` silently string-
                    // concatenates to "208px" instead of adding to 28, which
                    // is exactly the bug that clipped this text to nothing.
                    // Caught live, not just in review.
                    paddingLeft: RING_SIZE + 8,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {n.leavesDone} of {n.leavesTotal} complete
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
