// GoalGraph — left-to-right node-graph layout for the Goals page. Currently
// fed hardcoded placeholder data (see pages/goals.js) — a rendering-layer
// swap only, no data-fetching touched. Pure presentational component: given
// a forest (array of root nodes, each `{ title, children: [...] }` or
// `{ title, done }` for a leaf), it computes its own layout and draws it.
//
// No graph/diagram library — same "primitives composed in the component, no
// external dependency for something this app can express directly" approach
// already used for the dashboard's bar/line views (WeekBoardCard's progress
// bar, the SVG moving-average chart, etc).
import { color, space, radius, border, font } from '@/lib/tokens';

const COLUMN_WIDTH = 270; // px between depth columns, per spec
const ROW_HEIGHT = 46; // px between stacked leaf rows, per spec
const CARD_WIDTH = 220; // leaves ~50px of gutter per column for the curve
const CARD_HEIGHT = 36;
const PADDING = 24; // outer margin so edge cards/curves aren't clipped

// Assigns every node a depth-based x and a computed y (see file header):
// leaves stack top-to-bottom with even spacing (a single counter running
// across the WHOLE forest, not reset per tree, so sibling trees never
// overlap vertically); non-leaf y is the midpoint of its own children's y
// range, computed bottom-up (children laid out before their parent) so
// that midpoint is well-defined before it's used.
function layoutForest(roots) {
  const nodes = [];
  const edges = [];
  let leafCounter = 0;

  function layout(node, depth, id) {
    const isLeaf = !node.children || node.children.length === 0;
    let y;
    if (isLeaf) {
      y = leafCounter * ROW_HEIGHT;
      leafCounter += 1;
    } else {
      const childYs = node.children.map((child, i) => layout(child, depth + 1, `${id}-${i}`));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      node.children.forEach((_, i) => edges.push({ from: id, to: `${id}-${i}` }));
    }
    nodes.push({ id, title: node.title, done: node.done, isLeaf, x: depth * COLUMN_WIDTH, y });
    return y;
  }

  roots.forEach((root, i) => {
    layout(root, 0, `root${i}`);
    leafCounter += 1; // one blank row of separation before the next tree
  });

  return { nodes, edges };
}

export default function GoalGraph({ data }) {
  const { nodes, edges } = layoutForest(data);
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const contentWidth = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH + PADDING * 2;
  const contentHeight = Math.max(...nodes.map((n) => n.y)) + CARD_HEIGHT + PADDING * 2;

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxWidth: '100%', maxHeight: '100%' }}>
      <div style={{ position: 'relative', width: contentWidth, height: contentHeight }}>
        {/* Connectors first, in normal document order — cards (position:
            absolute, painted after) sit on top without needing an explicit
            z-index, same "later in the DOM wins" rule as everywhere else
            in this app that layers an overlay over static content. */}
        <svg width={contentWidth} height={contentHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
          {edges.map((e) => {
            const from = nodesById[e.from];
            const to = nodesById[e.to];
            const x1 = from.x + CARD_WIDTH + PADDING;
            const y1 = from.y + CARD_HEIGHT / 2 + PADDING;
            const x2 = to.x + PADDING;
            const y2 = to.y + CARD_HEIGHT / 2 + PADDING;
            const midX = (x1 + x2) / 2; // cubic bezier: horizontal S-curve between the two edges
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={color.border}
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {nodes.map((n) => (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: n.x + PADDING,
              top: n.y + PADDING - CARD_HEIGHT / 2,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: space[2],
              padding: `0 ${space[3]}`,
              background: color.card,
              border: border.default,
              borderRadius: radius.md,
            }}
          >
            {n.isLeaf && <input type="checkbox" checked={!!n.done} readOnly style={{ flexShrink: 0 }} />}
            <span
              style={{
                fontSize: font.size.sm,
                color: n.isLeaf && n.done ? color.textMuted : color.text,
                textDecoration: n.isLeaf && n.done ? 'line-through' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={n.title}
            >
              {n.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
