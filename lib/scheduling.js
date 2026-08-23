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

// 'YYYY-MM-DD' for a Date's own LOCAL calendar day. Defined here (rather
// than down by the drag-cascade functions that also use it) so
// assignTodaySchedule can use it too — see its own call site below.
function dateKeyFor(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
    // "Already scheduled" only counts if scheduled_start's own LOCAL
    // calendar day actually matches the day being rendered. A rollover
    // task (scheduled_date in the past, still 'todo') keeps whatever
    // scheduled_start it had from whenever it was last placed on ITS OWN
    // day — carrying that unchanged into today's render would position it
    // relative to a day that isn't today at all, the same wrong-day-offset
    // problem a drag-without-clearing-scheduled_start produces (see
    // moveInstance/updateOneOff/overrideInstance in lib/data.js). Treating
    // a wrong-day scheduled_start as "unscheduled for today" here lets it
    // fall through to the normal auto-stack branch below and get placed
    // fresh — no drag or manual edit required, just showing up on a new
    // day is enough to need a new position on it.
    const startsToday = instance.scheduled_start && dateKeyFor(new Date(instance.scheduled_start)) === todayDateStr;
    if (startsToday) {
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

// --- Whole-block drag + live cascade (rail_drag_cascade_plan.md, Step 1) ---
// Pure functions only — no UI, no DB writes. UI wiring (live preview,
// drag handle, batched commit-on-drop) is Steps 2-3, explicitly not done
// here.

// dateKeyFor() (Date -> 'YYYY-MM-DD', local calendar day) is defined up by
// assignTodaySchedule now, which also needs it — same function, used here
// since cascadeLater only receives a proposed Date/ISO string, not a
// separate date-string param the way assignTodaySchedule does.

// Mirrors ScheduleRail.js's own RAIL_END_HOUR (9 PM) — kept as a separate
// local constant rather than importing it, since a UI component's layout
// constant is the wrong direction of dependency for a pure lib function.
// If the rail's own grid boundary ever changes, this should be revisited
// alongside it, not silently drift.
const CASCADE_END_OF_DAY_HOUR = 21; // 9:00 PM

// Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd). Touching
// (back-to-back, no gap) intervals do NOT count as overlapping — e.g.
// [8:10,8:25) and [8:25,8:40) are adjacent, not overlapping, which is what
// lets a cascaded chain end up perfectly contiguous with no gaps.
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Which task(s) a block dropped at `proposedStart` (for `duration` minutes)
// would overlap, given the CURRENT scheduled_start of everything else in
// `instances`. Never includes `movedId` itself. Returns the actual
// overlapping instance objects, sorted ascending by their own
// scheduled_start ("in time order", per the plan). Pure — reads
// `instances` and the three scalar args only, never mutates anything.
export function detectOverlap(instances, movedId, proposedStart, duration) {
  const proposedStartDate = new Date(proposedStart);
  const proposedEnd = new Date(proposedStartDate.getTime() + duration * 60000);

  const overlapping = instances.filter((instance) => {
    if (instance.id === movedId) return false;
    if (!instance.scheduled_start) return false; // unscheduled tasks can't overlap anything
    const start = new Date(instance.scheduled_start);
    const end = new Date(start.getTime() + (instance.estimated_duration_minutes || 0) * 60000);
    return intervalsOverlap(proposedStartDate, proposedEnd, start, end);
  });

  return overlapping.sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
}

// Thrown by cascadeLater instead of silently truncating/wrapping when a
// push would land past CASCADE_END_OF_DAY_HOUR — per the plan's explicit
// "stop and report, don't silently truncate or wrap to the next day".
export class CascadeEndOfDayError extends Error {
  constructor(taskId, attemptedStart) {
    super(
      `cascadeLater: pushing task ${taskId} to ${attemptedStart.toISOString()} would land past the ` +
        `${CASCADE_END_OF_DAY_HOUR}:00 end-of-day boundary. Not truncating or wrapping — reporting instead.`
    );
    this.name = 'CascadeEndOfDayError';
    this.taskId = taskId;
    this.attemptedStart = attemptedStart;
  }
}

// Places the moved task at `proposedStart` (its OWN duration is untouched
// — a move changes scheduled_start only, never estimated_duration_minutes),
// then walks forward via repeated detectOverlap() calls: whichever task the
// just-placed block now overlaps gets pushed to start exactly at that
// block's end, becoming the new "just-placed block" for the next
// iteration, chaining through however many further overlaps that push
// itself causes. This is a single-file domino chain (each step resolves
// the nearest/earliest overlap, then re-checks from the new position) —
// it does not attempt to simultaneously resolve multiple tasks that all
// independently overlapped the ORIGINAL moved position at once; realistic
// rail data (tasks non-overlapping to begin with) doesn't produce that
// shape, and the plan's own verify scenario is a straightforward linear
// chain.
//
// Invariants enforced structurally, not by a post-hoc check:
// - A pushed task's new start is always the previous block's end, which by
//   construction is always LATER than where the walk currently is scanning
//   from — no branch of this function ever assigns a start earlier than a
//   task's own current position.
// - The 8:00 AM floor only needs an explicit clamp on the MOVED task's own
//   proposedStart (the one truly free-floating value); every other task's
//   new start descends from that already-clamped point or from another
//   already->=8AM position, so the floor holds transitively for the whole
//   chain with no separate per-task check needed.
//
// Returns [{ id, scheduled_start }, ...] for every task that actually
// changed (the moved task plus any it cascaded into) — callers write
// exactly this set, nothing more. No DB access here; that's Step 3.
export function cascadeLater(instances, movedId, proposedStart) {
  const movedInstance = instances.find((i) => i.id === movedId);
  if (!movedInstance) {
    throw new Error(`cascadeLater: no instance found with id ${movedId}`);
  }

  const proposedStartDate = new Date(proposedStart);
  const floor = railStartFor(dateKeyFor(proposedStartDate));
  const movedNewStart = proposedStartDate < floor ? floor : proposedStartDate;
  const eodBoundary = new Date(floor);
  eodBoundary.setHours(CASCADE_END_OF_DAY_HOUR, 0, 0, 0);

  const results = new Map(); // id -> ISO string, only entries that actually changed
  results.set(movedId, movedNewStart.toISOString());

  // `working` mirrors `instances` but with every push applied so far, so
  // each detectOverlap() call sees already-cascaded positions, not stale
  // originals.
  let working = instances.map((i) =>
    i.id === movedId ? { ...i, scheduled_start: movedNewStart.toISOString() } : i
  );

  let frontierId = movedId;
  let frontierStart = movedNewStart;
  let frontierDuration = movedInstance.estimated_duration_minutes || 15;

  if (frontierStart.getTime() + frontierDuration * 60000 > eodBoundary.getTime()) {
    throw new CascadeEndOfDayError(movedId, movedNewStart);
  }

  // Bounds the loop defensively — with unique ids and each iteration
  // strictly resolving one task, this should never actually reach the
  // limit, but a pure function walking a caller-supplied array shouldn't
  // trust that invariant unconditionally.
  const maxIterations = instances.length + 1;
  let iterations = 0;

  while (iterations++ < maxIterations) {
    const overlaps = detectOverlap(working, frontierId, frontierStart, frontierDuration);
    if (overlaps.length === 0) break;

    const next = overlaps[0]; // earliest-starting overlap — the next link in the chain
    const nextNewStart = new Date(frontierStart.getTime() + frontierDuration * 60000);
    const nextDuration = next.estimated_duration_minutes || 15;

    if (nextNewStart.getTime() + nextDuration * 60000 > eodBoundary.getTime()) {
      throw new CascadeEndOfDayError(next.id, nextNewStart);
    }

    results.set(next.id, nextNewStart.toISOString());
    working = working.map((i) => (i.id === next.id ? { ...i, scheduled_start: nextNewStart.toISOString() } : i));

    frontierId = next.id;
    frontierStart = nextNewStart;
    frontierDuration = nextDuration;
  }

  return Array.from(results, ([id, scheduled_start]) => ({ id, scheduled_start }));
}
