// goals-queries.js — data access for the `goals` table (self-referencing
// parent/child hierarchy: a goal's parent_id points at another goals.id, or
// is null for a root goal). Same convention as every other lib/*.js module
// (lib/data.js, lib/tag-queries.js): plain functions calling the browser
// supabase client directly, no API routes or server actions anywhere in this
// app (checked before writing this — pages/api only has the unused
// create-next-app boilerplate stub, nothing reads or writes through it).
//
// Category rule: a goal may only carry its OWN `category` when parent_id is
// null. A child's displayed category — `effective_category` below — is never
// stored on the child row; it's resolved at read time by walking up to the
// root ancestor and taking THAT row's category. This is the same
// derived-field pattern lib/data.js's resolveInstance() already uses for an
// instance's title/description (live-resolved from its template at read
// time, never persisted) — extended here to handle unbounded depth. tag_id
// resolving to a tag's color is a different case: that's a single, fixed FK
// hop, expressible directly as a PostgREST embed (`tagRow:tags(...)`) in the
// SELECT string. A goal's ancestor chain has no fixed depth, so it can't be
// expressed as one embed — this fetches id/parent_id/category for every goal
// once and walks the chain in memory instead. Same "resolve at read time,
// never persist" principle, just a different resolution mechanism because
// the relationship shape is different.
import { supabase } from './supabaseClient';

const GOALS_SELECT = 'id, parent_id, title, category, is_complete, is_archived, created_at, updated_at';

// Walks every goal's parent_id chain to its root and attaches that root's
// OWN category as effective_category (a root's effective_category is just
// its own category — parent_id is null, so there's nothing to walk).
// `cache` avoids re-walking a shared ancestor chain for every sibling under
// the same branch.
function resolveEffectiveCategories(rows) {
  const byId = new Map(rows.map((g) => [g.id, g]));
  const cache = new Map();

  const rootCategoryOf = (id) => {
    if (cache.has(id)) return cache.get(id);
    const seen = new Set();
    let current = byId.get(id);
    while (current?.parent_id && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parent_id) ?? null;
    }
    // current is now the root (parent_id null) — or null if the chain
    // pointed somewhere not in this fetch, or a cycle was caught. Either
    // way, that's not a category we can trust, so fall back to null rather
    // than guessing.
    const result = current?.category ?? null;
    cache.set(id, result);
    return result;
  };

  return rows.map((g) => ({
    ...g,
    effective_category: g.parent_id ? rootCategoryOf(g.id) : g.category,
  }));
}

// Enforces "a goal may only carry its own category when parent_id is null"
// on a write's FINAL patch/insert shape — not a DB constraint, and not a
// rejection. Explicit ask: if a request sets both parent_id and category,
// parent_id wins and category is silently dropped. Applied to the resulting
// patch (not just "did this call's payload include both fields") so it also
// catches a goal moving from root to child — a previously-root goal's own
// stored category must not survive it gaining a parent, even if that
// particular update call didn't touch category itself.
function withCategoryRule(patch) {
  if (patch.parent_id) {
    return { ...patch, category: null };
  }
  return patch;
}

// All goals, each with effective_category resolved. Ordered by created_at so
// a UI can render root-then-children in a stable, insertion-based order
// (matches the app's general "manual/creation order over alphabetical"
// convention — see task_instances.position elsewhere in this codebase).
export async function listGoals(client = supabase) {
  const { data, error } = await client
    .from('goals')
    .select(GOALS_SELECT)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return resolveEffectiveCategories(data ?? []);
}

export async function createGoal({ title, parentId = null, category = null }, client = supabase) {
  const insertRow = withCategoryRule({ title, parent_id: parentId, category });
  const { data, error } = await client.from('goals').insert(insertRow).select(GOALS_SELECT).single();
  if (error) throw error;
  return data;
}

export async function updateGoal(id, fields, client = supabase) {
  const patch = {};
  if ('title' in fields) patch.title = fields.title;
  if ('isComplete' in fields) patch.is_complete = fields.isComplete;
  if ('parentId' in fields) patch.parent_id = fields.parentId;
  if ('category' in fields) patch.category = fields.category;
  patch.updated_at = new Date().toISOString();

  const finalPatch = withCategoryRule(patch);
  const { data, error } = await client.from('goals').update(finalPatch).eq('id', id).select(GOALS_SELECT).single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id, client = supabase) {
  // on delete cascade (goals.parent_id fkey) removes the whole subtree —
  // no manual cleanup needed here, matches the DB-level guarantee verified
  // when the table was created.
  const { error } = await client.from('goals').delete().eq('id', id);
  if (error) throw error;
}

// Archives a whole tree in one round trip — `ids` is the root's own id PLUS
// every descendant's id (caller walks the tree to build this list; see
// pages/goals.js's countDescendants for the same walk already done there).
// Archiving is a flag flip, not a delete — an archived goal and its subtree
// simply stop appearing in the Short-Term/Long-Term views and start
// appearing in Completed instead (pages/goals.js's own filtering), nothing
// about the row itself changes otherwise.
export async function archiveGoals(ids, client = supabase) {
  if (ids.length === 0) return;
  const { error } = await client.from('goals').update({ is_archived: true }).in('id', ids);
  if (error) throw error;
}

// Reverse of archiveGoals() — same whole-tree-at-once shape, the safety net
// so archiving isn't a one-way trip if done by mistake.
export async function unarchiveGoals(ids, client = supabase) {
  if (ids.length === 0) return;
  const { error } = await client.from('goals').update({ is_archived: false }).in('id', ids);
  if (error) throw error;
}
