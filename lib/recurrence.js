// recurrence.js — the instance generator. See CLAUDE.md "Recurrence
// regeneration rule": generateInstances must NEVER touch or overwrite any
// task_instances row where is_override = true OR status != 'todo'. Everything
// else is disposable and safely recreated from the template's RRULE.
//
// Structure: two PURE functions (expandOccurrences, reconcile) hold all the
// logic and are unit-testable without a DB; generateInstances just wires them
// to Supabase. All date math goes through rrule.js — never hand-rolled.
import { RRule } from 'rrule';
import { supabase } from './supabaseClient';

// --- Date helpers: everything in UTC to avoid TZ/DST drift on 'date' cols ---

function parseDateUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// --- Pure: expand a template's RRULE into occurrence date strings ----------
// Materializes only occurrences from `from` (default today) forward, within
// `windowDays`. Past occurrences are not regenerated. Respects template.active,
// template.start_date (cadence anchor), and template.end_date (hard stop).
export function expandOccurrences(template, { windowDays = 90, from } = {}) {
  if (!template.active) return [];

  const start = parseDateUTC(template.start_date);
  const fromDate = from ? parseDateUTC(from) : todayUTC();

  // Never generate before the template starts or before `from`.
  const windowStart = start > fromDate ? start : fromDate;
  let windowEnd = addDaysUTC(fromDate, windowDays);
  if (template.end_date) {
    const end = parseDateUTC(template.end_date);
    if (end < windowEnd) windowEnd = end;
  }
  if (windowStart > windowEnd) return [];

  const rule = new RRule({
    ...RRule.parseString(template.recurrence_rule),
    dtstart: start,
  });

  // between(after, before, inc=true) is inclusive of both bounds.
  return rule.between(windowStart, windowEnd, true).map(formatDateUTC);
}

// --- Pure: reconcile desired occurrences against existing rows -------------
// Returns { toInsert: [dateStr], toDelete: [row] }. Rows that are is_override
// or not 'todo' are NEVER deleted and mark their date occupied (no duplicate
// insert). Stale non-override 'todo' rows (date no longer desired) are deleted.
export function reconcile(desiredDates, existingInstances) {
  const desired = new Set(desiredDates);
  const occupied = new Set();
  const toDelete = [];

  for (const inst of existingInstances) {
    const isProtected = inst.is_override === true || inst.status !== 'todo';
    if (isProtected) {
      occupied.add(inst.scheduled_date); // keep; never touch
      continue;
    }
    // Regenerable 'todo' row previously created by us.
    if (desired.has(inst.scheduled_date)) {
      occupied.add(inst.scheduled_date); // already present — keep, don't dup
    } else {
      toDelete.push(inst); // stale — safe to recreate, remove it
    }
  }

  const toInsert = desiredDates.filter((date) => !occupied.has(date));
  return { toInsert, toDelete };
}

// --- Orchestration: expand -> load existing -> reconcile -> write ----------
// The only impure part. `client` and `from` are injectable for testing.
export async function generateInstances(
  template,
  windowDays = 90,
  { client = supabase, from } = {}
) {
  const desiredDates = expandOccurrences(template, { windowDays, from });

  const { data: existing, error } = await client
    .from('task_instances')
    .select('*')
    .eq('template_id', template.id);
  if (error) throw error;

  const { toInsert, toDelete } = reconcile(desiredDates, existing || []);

  if (toDelete.length) {
    const { error: delErr } = await client
      .from('task_instances')
      .delete()
      .in(
        'id',
        toDelete.map((r) => r.id)
      );
    if (delErr) throw delErr;
  }

  if (toInsert.length) {
    const rows = toInsert.map((date) => ({
      template_id: template.id,
      scheduled_date: date,
      status: 'todo',
      is_override: false,
    }));
    const { error: insErr } = await client.from('task_instances').insert(rows);
    if (insErr) throw insErr;
  }

  return {
    desired: desiredDates.length,
    inserted: toInsert.length,
    deleted: toDelete.length,
  };
}
