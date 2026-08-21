// scheduling.js — Schedule Rail auto-placement. One function: given today's
// resolved instances (native + rolled-over, already in the same order the
// sidebar renders them — see lib/data.js's fetchInstancesForDateWithRollover,
// which returns [...rollover, ...today] pre-sorted by `position`), stack
// every instance with no scheduled_start yet back-to-back from 8:00 AM in
// that list order, using each instance's own estimated_duration_minutes.
//
// Idempotent by design: a row that already has scheduled_start is never
// written to again — the running clock advances PAST it (using its own
// start+duration) so anything auto-placed after it in list order still
// stacks correctly, but the row itself is left alone. Reloading the same
// day, or adding a new unscheduled task alongside already-scheduled ones,
// never reshuffles a time a prior pass (or a manual edit) already set.
import { supabase } from './supabaseClient';

const RAIL_START_HOUR = 8; // 8:00 AM, local time — matches the rail's fixed start

// Local midnight + RAIL_START_HOUR for a 'YYYY-MM-DD' date string. Local
// time, not UTC, since "8:00 AM" means the user's own wall-clock 8 AM —
// same date-string handling convention as lib/dates.js elsewhere in this app
// (plain Y/M/D construction, never new Date(dateStr) directly, which parses
// as UTC midnight and would shift the hour in any non-UTC timezone).
function railStartFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, RAIL_START_HOUR, 0, 0, 0);
}

// Mutates nothing in place; returns a new array with newly-assigned
// scheduled_start values merged in, so the caller doesn't need a second
// round-trip fetch to see them. Writes only the rows that were actually
// null — a plain per-row update (Supabase has no bulk upsert-by-id-list for
// arbitrary per-row values without a temp table), acceptable at this app's
// scale (single user, a handful of tasks/day).
export async function assignTodaySchedule(instances, todayDateStr, client = supabase) {
  let cursor = railStartFor(todayDateStr);
  const toWrite = [];

  for (const instance of instances) {
    if (instance.scheduled_start) {
      // Already scheduled (prior auto-assign pass, or a manual/future
      // resize-driven edit) — advance the clock past its own end time so
      // whatever comes after it in list order stacks AFTER it, not on top
      // of it. Guards against moving the cursor BACKWARDS if this task's
      // own start is earlier than where the cursor already is (an
      // out-of-order manually-scheduled task shouldn't un-stack everything
      // that already got placed after it in this same pass).
      const existingEnd = new Date(
        new Date(instance.scheduled_start).getTime() + instance.estimated_duration_minutes * 60000
      );
      if (existingEnd > cursor) cursor = existingEnd;
      continue;
    }
    toWrite.push({ id: instance.id, scheduled_start: new Date(cursor).toISOString() });
    cursor = new Date(cursor.getTime() + instance.estimated_duration_minutes * 60000);
  }

  if (toWrite.length === 0) return instances; // fully idempotent no-op — nothing was unscheduled

  await Promise.all(
    toWrite.map(({ id, scheduled_start }) =>
      client.from('task_instances').update({ scheduled_start }).eq('id', id)
    )
  );

  const writtenById = new Map(toWrite.map((w) => [w.id, w.scheduled_start]));
  return instances.map((instance) =>
    writtenById.has(instance.id) ? { ...instance, scheduled_start: writtenById.get(instance.id) } : instance
  );
}
