// GoalGraph — left-to-right node-graph layout for the Goals page. Currently
// fed hardcoded placeholder data (see pages/goals.js) — a rendering-layer
// swap only, no data-fetching touched. Pure presentational component: given
// a forest (array of root nodes, each `{ title, children: [...] }` or
// `{ title, done }` for a leaf), it computes its own layout and draws it.
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

  function layout(node, depth, id) {
    const isRoot = depth === 0;
    const isLeaf = !node.children || node.children.length === 0;
    const width = cardWidth(isRoot);
    const height = cardHeight(isLeaf);
    let y;
    if (isLeaf) {
      y = leafCounter * ROW_HEIGHT;
      leafCounter += 1;
    } else {
      const childYs = node.children.map((child, i) => layout(child, depth + 1, `${id}-${i}`));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      node.children.forEach((_, i) => edges.push({ from: id, to: `${id}-${i}` }));
    }
    const leaves = isLeaf ? null : countLeaves(node);
    nodes.push({
      id,
      title: node.title,
      done: node.done,
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

  roots.forEach((root, i) => {
    layout(root, 0, `root${i}`);
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

export default function GoalGraph({ data, onToggleLeaf }) {
  const { nodes, edges } = layoutForest(data);
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));

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
                <span
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
                  }}
                  title={n.title}
                >
                  {n.title}
                </span>
                {!n.isLeaf && (
                  <span style={{ fontSize: font.size.xs, color: color.muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {pct}%
                  </span>
                )}
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
