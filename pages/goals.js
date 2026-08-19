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
import { listGoals, updateGoal, getGoalProgress } from '@/lib/goals-queries';
import { color, space, border, font } from '@/lib/tokens';
import { heading, buttonPrimary, buttonGhost, textMuted } from '@/lib/components';
import GoalGraph from '@/components/GoalGraph';
import AddGoalModal from '@/components/AddGoalModal';

// Hardcoded placeholder data for the new left-to-right graph layout —
// rendering-layer swap only, per the ask. Deliberately NOT wired to
// listGoals()/getGoalProgress() below, which keep running exactly as
// before (their state — goals, progressByGoalId, childrenByParent — is
// simply unused by the graph for this step, not removed).
const data = [
  {
    title: "Ship Personal Planner V4",
    children: [
      { title: "Tag manager operations", children: [
        { title: "Rename flow", done: true },
        { title: "Delete with confirm-count", done: true },
        { title: "Merge via Postgres transaction", done: false },
      ]},
      { title: "Confirm auth gap", children: [
        { title: "Decide auth vs anon key", done: false },
      ]},
      { title: "Natural language quick-add", done: false },
    ]
  },
  {
    title: "Rebuild LastKey foundation",
    children: [
      { title: "Fix hardcoded fallback creds", done: true },
      { title: "Lock a final name", children: [
        { title: "Domain availability check", done: true },
        { title: "USPTO knockout search", done: false },
      ]},
      { title: "Days Inn owner_user_id fix", done: false },
    ]
  },
];

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [progressByGoalId, setProgressByGoalId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // null = closed. {} = add a root goal. {parentGoal} = add a sub-goal.
  const [addModal, setAddModal] = useState(null);

  const childrenByParent = useMemo(() => {
    const map = {};
    for (const g of goals) {
      const key = g.parent_id ?? 'root';
      (map[key] ??= []).push(g);
    }
    return map;
  }, [goals]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await listGoals();
      setGoals(all);

      // A goal is non-leaf if it appears as SOMEONE's parent_id — cheap to
      // derive from the flat list itself rather than a second query.
      const parentIds = new Set(all.filter((g) => g.parent_id).map((g) => g.parent_id));
      const nonLeafIds = all.filter((g) => parentIds.has(g.id)).map((g) => g.id);

      const entries = await Promise.all(
        nonLeafIds.map(async (id) => [id, await getGoalProgress(id)])
      );
      setProgressByGoalId(Object.fromEntries(entries));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onToggleComplete = async (goal) => {
    try {
      await updateGoal(goal.id, { isComplete: !goal.is_complete });
      await load(); // no full page reload — just refetches goals + progress and re-renders
    } catch (e) {
      setError(e.message);
    }
  };

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
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            <div style={{ ...heading, fontSize: font.size.lg }}>Goals</div>
            <Link href="/" style={{ ...buttonGhost, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm, textDecoration: 'none' }}>
              ← Planner
            </Link>
          </div>
          <button type="button" style={buttonPrimary} onClick={() => setAddModal({})}>
            + Add Goal
          </button>
        </header>

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={textMuted}>Loading…</div>}
          {error && <div style={{ color: color.danger, marginBottom: space[3] }}>{error}</div>}

          {/* Left-to-right graph layout, placeholder data (see `data` above)
              — replaces the to-do-list tree rendering for this step. Not
              gated on `loading`/real goals: this data is fixed, independent
              of the still-running fetch above. */}
          <GoalGraph data={data} />
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
