// timer-queries.js — data access for the V3 `time_entries` table. Timer is a
// single GLOBAL state, not per-task (CLAUDE.md decision): at most one row
// with ended_at IS NULL at any time. That invariant is enforced at the DB
// level by a unique index on a constant expression scoped to the
// `ended_at IS NULL` predicate (see the fix_one_active_timer_constraint_and_
// add_start_timer_rpc migration) — a partial unique index directly on the
// nullable ended_at column does NOT work, since Postgres treats NULLs as
// never equal for uniqueness purposes.
import { supabase } from './supabaseClient';

// The active timer (if any), joined to its instance's title. Title
// resolution mirrors the live-join inheritance pattern used elsewhere for
// title/description (NOT the frozen-at-generation pattern used for tags) —
// non-override recurring instances show the template's current title.
export async function getActiveTimer(client = supabase) {
  const { data, error } = await client
    .from('time_entries')
    .select(
      '*, instance:task_instances(id, title, template_id, is_override, template:task_templates(title))'
    )
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const inst = data.instance;
  const inherits = inst?.template_id && !inst?.is_override;
  const instanceTitle = inherits ? inst?.template?.title ?? inst?.title : inst?.title;
  return { ...data, instanceTitle: instanceTitle || '(untitled)' };
}

// Start a timer for instanceId. Stops whatever is currently running first —
// as ONE atomic database transaction (the start_timer() Postgres function),
// not two separate client round trips the UI could interleave. If a genuine
// concurrent start_timer call races this one, the loser gets a unique
// constraint violation from the DB rather than silently coexisting.
export async function startTimer(instanceId, client = supabase) {
  const { data, error } = await client.rpc('start_timer', { p_instance_id: instanceId });
  if (error) throw error;
  return data;
}

// Stop whatever timer is currently active. No-op (0 rows affected) if none
// is active — safe to call unconditionally.
export async function stopTimer(client = supabase) {
  const { error } = await client
    .from('time_entries')
    .update({ ended_at: new Date().toISOString() })
    .is('ended_at', null);
  if (error) throw error;
}

// Shared H:MM:SS formatter — used by TimerBar (elapsed since started_at) and
// by the card-face total-tracked-time display (summed completed sessions
// plus live elapsed if that instance is the currently active timer).
export function formatDuration(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
