// board-queries.js — read-only queries for the v2 week-board/inbox UI
// (inbox column with no date, Mon-Sun day columns, today's rollover of
// incomplete past-due items). No mutation logic here; see lib/data.js for
// writes. Kept self-contained (own SELECT/resolve) rather than importing
// private helpers out of data.js.
import { supabase } from './supabaseClient';

const INSTANCE_SELECT =
  '*, template:task_templates(id, title, description, recurrence_rule, start_date, end_date, active, tag)';

// Resolve inherited title/description/tag the same way lib/data.js does:
// one-off tasks and overrides carry their own values, otherwise inherit from
// the template.
function resolveInstance(row) {
  const inherits = row.template_id && !row.is_override;
  return {
    ...row,
    title: inherits ? row.template?.title ?? row.title : row.title,
    description: inherits
      ? row.template?.description ?? row.description
      : row.description,
    tag: inherits ? row.template?.tag ?? row.tag : row.tag,
  };
}

// Date -> 'YYYY-MM-DD' using LOCAL calendar fields (never UTC methods —
// toISOString() shifts by the local offset and can land on the wrong day).
function toDateStr(date) {
  if (typeof date === 'string') return date;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Pure: week grid -------------------------------------------------------

// Returns 7 Date objects (local midnight) for Mon-Sun of the week containing
// referenceDate. Pure, no DB call. Built entirely from local Y/M/D fields and
// setDate() day-stepping (never UTC math), so DST transitions can't shift a
// date by an hour into the wrong calendar day.
export function getWeekDates(referenceDate = new Date()) {
  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  // JS getDay(): Sun=0..Sat=6. Days since Monday: Mon=0, Tue=1, ..., Sun=6.
  const daysSinceMonday = (ref.getDay() + 6) % 7;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - daysSinceMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// --- Reads -------------------------------------------------------------

// Inbox: instances with no scheduled_date yet, in manual sort order.
export async function getInboxInstances(client = supabase) {
  const { data, error } = await client
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .is('scheduled_date', null)
    .order('position', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map(resolveInstance);
}

// One day column. isToday=false: just that date, any status. isToday=true:
// that date (any status) PLUS the rollover set — earlier dates still 'todo'
// (CLAUDE.md decision: rollover is a computed query, not a data mutation).
// Rolled-over rows get a computed is_overdue: true; same-day rows get false.
export async function getColumnInstances(date, isToday, client = supabase) {
  const dateStr = toDateStr(date);

  const { data: sameDay, error: sameDayErr } = await client
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .eq('scheduled_date', dateStr)
    .order('position', { ascending: true, nullsFirst: true });
  if (sameDayErr) throw sameDayErr;
  const sameDayRows = (sameDay ?? [])
    .map(resolveInstance)
    .map((i) => ({ ...i, is_overdue: false }));

  if (!isToday) return sameDayRows;

  const { data: rollover, error: rolloverErr } = await client
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .lt('scheduled_date', dateStr)
    .eq('status', 'todo')
    .order('scheduled_date', { ascending: true })
    .order('position', { ascending: true, nullsFirst: true });
  if (rolloverErr) throw rolloverErr;
  const rolloverRows = (rollover ?? [])
    .map(resolveInstance)
    .map((i) => ({ ...i, is_overdue: true }));

  return [...rolloverRows, ...sameDayRows];
}
