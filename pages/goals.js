// pages/goals.js — Goals view. Its own top-level route (Pages Router, same
// as this whole app: confirmed no app/ directory exists before adding this
// file), not another tab inside pages/index.js's shell, since the ask was
// for "a new page."
//
// No sidebar: pages/index.js's own mobile layout is this app's only existing
// "no sidebar" precedent (the DailySidebar `aside` is conditionally omitted
// below `useIsMobile()`, leaving just header + content) — mirrored here
// unconditionally, header + content, no aside, at any width.
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listGoals, updateGoal } from '@/lib/goals-queries';
import { color, space, radius, border, font } from '@/lib/tokens';
import { buttonPrimary, buttonGhost, textMuted } from '@/lib/components';
import GoalGraph from '@/components/GoalGraph';
import AddGoalModal from '@/components/AddGoalModal';

const TREE_LABELS = ['Short-Term', 'Long-Term'];
const TREE_CATEGORIES = ['short_term', 'long_term']; // index-matched to TREE_LABELS

// Reshapes the flat `goals` list (as returned by listGoals(), each row
// already carrying effective_category) into the nested {id, title, done,
// children} forest GoalGraph expects, bucketed by root category. Real
// goal UUIDs flow straight through as node ids — GoalGraph no longer
// invents its own, since rename/toggle need to address the actual table
// row, not a position-derived label.
function buildGoalForests(goals) {
  const childrenByParent = {};
  for (const g of goals) {
    const key = g.parent_id ?? 'root';
    (childrenByParent[key] ??= []).push(g);
  }

  function buildNode(g) {
    const kids = childrenByParent[g.id] || [];
    const node = { id: g.id, title: g.title, done: g.is_complete };
    if (kids.length) node.children = kids.map(buildNode);
    return node;
  }

  const roots = childrenByParent['root'] || [];
  return TREE_CATEGORIES.map((cat) =>
    roots.filter((g) => g.effective_category === cat).map(buildNode)
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // null = closed. {} = add a root goal. {parentGoal} = add a sub-goal.
  const [addModal, setAddModal] = useState(null);

  const [activeTree, setActiveTree] = useState(0);

  // Real forest, rebuilt from `goals` on every fetch — GoalGraph gets live
  // data, not a separate mutable copy. Since `goals` already refetches after
  // every write (see `load()` below), a toggle or rename shows up here
  // automatically without extra state to keep in sync by hand.
  const forests = useMemo(() => buildGoalForests(goals), [goals]);

  const onToggleLeaf = async (id) => {
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;
    try {
      await updateGoal(id, { isComplete: !goal.is_complete });
      await load(); // no full page reload — refetches goals + progress and re-renders
    } catch (e) {
      setError(e.message);
    }
  };

  const onRename = async (id, newTitle) => {
    try {
      await updateGoal(id, { title: newTitle });
      await load(); // graph re-renders with the new title from the refetch, no full reload
    } catch (e) {
      setError(e.message);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await listGoals();
      setGoals(all);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onAddSubgoal = (goal) => setAddModal({ parentGoal: goal });

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space[2],
    padding: `${space[3]} ${space[6]}`,
    borderBottom: border.default,
    background: color.bg,
    flexShrink: 0,
  };

  return (
    <>
      <Head>
        <title>Goals · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header style={headerStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.ink }}>Goals</div>
              <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
                ← Planner
              </Link>
            </div>
            <div style={{ fontSize: font.size.sm, color: color.muted, marginTop: space[1] }}>
              A left-to-right view of what's actually moving.
            </div>
          </div>
          <button type="button" style={buttonPrimary} onClick={() => setAddModal({})}>
            + Add Goal
          </button>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={textMuted}>Loading…</div>}
          {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

          <div style={{ display: 'flex', gap: space[2], marginBottom: space[4], flexShrink: 0 }}>
            {TREE_LABELS.map((label, i) => {
              const active = activeTree === i;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveTree(i)}
                  style={{
                    padding: `${space[1]} ${space[4]}`,
                    borderRadius: radius.full,
                    border: active ? 'none' : `1px solid ${color.muted}`,
                    background: active ? color.ink : 'transparent',
                    color: active ? color.white : color.muted,
                    fontSize: font.size.sm,
                    fontWeight: font.weight.medium,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Left-to-right graph layout, now backed by the real `goals`
              table via buildGoalForests() — only the active tree (via the
              Short-Term/Long-Term toggle) is passed in. GoalGraph's own
              layout math assumes at least one root node (Math.max over an
              empty node list is -Infinity), so this must NOT render it
              during the initial fetch either (goals starts as [], so
              forests[activeTree] is briefly empty on first paint even when
              the category isn't actually empty) — gate the whole branch on
              `!loading`, not just the "genuinely empty" message. */}
          {!loading && (
            forests[activeTree].length === 0 ? (
              <div style={textMuted}>No {TREE_LABELS[activeTree].toLowerCase()} goals yet. Add one above.</div>
            ) : (
              <GoalGraph data={forests[activeTree]} onToggleLeaf={onToggleLeaf} onRename={onRename} />
            )
          )}
        </section>
      </div>

      {addModal && (
        <AddGoalModal
          parentGoal={addModal.parentGoal ?? null}
          onClose={() => setAddModal(null)}
          onCreated={load}
        />
      )}
    </>
  );
}
