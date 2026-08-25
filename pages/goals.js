// pages/goals.js — Goals view. Its own top-level route (Pages Router, same
// as this whole app: confirmed no app/ directory exists before adding this
// file), not another tab inside pages/index.js's shell, since the ask was
// for "a new page."
//
// No sidebar: pages/index.js's own mobile layout is this app's only existing
// "no sidebar" precedent (the ScheduleRail `aside` is conditionally omitted
// below `useIsMobile()`, leaving just header + content) — mirrored here
// unconditionally, header + content, no aside, at any width.
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listGoals, updateGoal, createGoal, deleteGoal } from '@/lib/goals-queries';
import { color, space, radius, font } from '@/lib/tokens';
import { buttonGhost, textMuted } from '@/lib/components';
import AppNav from '@/components/AppNav';
import GoalGraph from '@/components/GoalGraph';
import TagManagerModal from '@/components/TagManagerModal';

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

// Counts every descendant under `id` — NOT including id itself — by walking
// the same flat `goals` list the page already has in hand, no extra round
// trip. Deliberately a plain JS walk rather than get_goal_progress (that RPC
// counts complete/total LEAVES for a progress percentage, a different
// question from "how many rows total, leaf or not, hang off this one" that
// the delete-confirmation copy needs).
function countDescendants(goals, id) {
  const childrenByParent = {};
  for (const g of goals) {
    if (g.parent_id) (childrenByParent[g.parent_id] ??= []).push(g.id);
  }
  let count = 0;
  const stack = [...(childrenByParent[id] || [])];
  while (stack.length) {
    const childId = stack.pop();
    count += 1;
    stack.push(...(childrenByParent[childId] || []));
  }
  return count;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [managingTags, setManagingTags] = useState(false);

  const [activeTree, setActiveTree] = useState(0);
  // Id of a goal just created via onAddRootGoal/onAddSubgoal below, so
  // GoalGraph can open it straight into rename mode instead of landing
  // silently with a "New Goal" placeholder the user has to go find and
  // click themselves. Cleared by GoalGraph itself once consumed.
  const [autoEditId, setAutoEditId] = useState(null);

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

  // Scoped to whichever category tab is active — inserts a root with
  // parent_id null and category = that tab's value, then refetches so the
  // new node appears in the SAME render pass that sets autoEditId (both
  // setState calls batch together), guaranteeing GoalGraph's autoEditId
  // effect finds the node already present in its `data` prop.
  const onAddRootGoal = async () => {
    try {
      const newGoal = await createGoal({ title: 'New Goal', parentId: null, category: TREE_CATEGORIES[activeTree] });
      await load();
      setAutoEditId(newGoal.id);
    } catch (e) {
      setError(e.message);
    }
  };

  // Replaces the old onAddSubgoal(goal) => setAddModal({parentGoal: goal}):
  // that modal-opening version was dead code (nothing rendered ever called
  // it — GoalNode.js, the only component with a working "+ Sub-goal"
  // button, hasn't been rendered since the graph refactor). This is a real,
  // wired-up affordance instead: direct insert, no modal, straight into
  // rename mode, called from GoalGraph's new per-card "+" button.
  const onAddSubgoal = async (parentId) => {
    try {
      const newGoal = await createGoal({ title: 'New Goal', parentId, category: null });
      await load();
      setAutoEditId(newGoal.id);
    } catch (e) {
      setError(e.message);
    }
  };

  // Confirmation copy differs by whether the node has descendants — counted
  // from the `goals` already in hand (see countDescendants above), not a
  // fresh query. On confirm, the DB's own goals_parent_id_fkey ON DELETE
  // CASCADE (verified firing for real via Supabase MCP before this was
  // written, not assumed from the schema) takes every descendant with it in
  // the single deleteGoal() call — no per-descendant delete loop needed.
  // Reuses the same load() refetch as every other write on this page.
  const onDeleteGoal = async (id) => {
    const descendantCount = countDescendants(goals, id);
    const message = descendantCount > 0
      ? `Delete this goal and its ${descendantCount} sub-goal${descendantCount === 1 ? '' : 's'}?`
      : 'Delete this goal?';
    if (!confirm(message)) return;
    try {
      await deleteGoal(id);
      await load(); // no full page reload — refetches goals and re-renders without the deleted branch
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

  return (
    <>
      <Head>
        <title>Goals · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <AppNav current="goals" onManageTags={() => setManagingTags(true)} />

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: font.size.sm, color: color.muted, marginBottom: space[4], flexShrink: 0 }}>
            A left-to-right view of what's actually moving.
          </div>

          {loading && <div style={textMuted}>Loading…</div>}
          {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4], flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: space[2] }}>
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
            {/* Scoped to whichever tab is active — inserts a root with THAT
                category, not a picker, since the tab already says which
                tree the user is looking at. */}
            <button type="button" style={buttonGhost} onClick={onAddRootGoal}>
              + Add Root Goal
            </button>
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
              <GoalGraph
                data={forests[activeTree]}
                onToggleLeaf={onToggleLeaf}
                onRename={onRename}
                onAddSubgoal={onAddSubgoal}
                onDeleteGoal={onDeleteGoal}
                autoEditId={autoEditId}
                onAutoEditConsumed={() => setAutoEditId(null)}
              />
            )
          )}
        </section>
      </div>

      {managingTags && <TagManagerModal onClose={() => setManagingTags(false)} />}
    </>
  );
}
