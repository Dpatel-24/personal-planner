// data.js — the single data-access layer. Every view reads/writes tasks
// through here (CLAUDE.md: task_instances is the one source of truth; no view
// owns its own fetch logic). Board groups by status, calendar by
// scheduled_date, sidebar filters scheduled_date = today — all from the same
// resolved instance shape returned here.
import { supabase } from './supabaseClient';
import { generateInstances } from './recurrence';
import { addDays } from './dates';

// Embed the parent template (for title/description inheritance, and the
// template's OWN default tag — shown in the UI's template-level tag picker,
// never used to resolve an instance's displayed tag) and the tag row via
// tag_id (V3 — supersedes the old free-text `tag` column, which still
// physically exists on both tables but is no longer read or written by app
// code; see the V3 decisions log). Aliased to tagRow / defaultTagRow, not
// `tag`, so there's no ambiguity with the legacy text column of the same
// name that `*` also selects.
// checklist_items(id, is_done) embedded purely for the card-face "X/Y"
// progress count — a fully independent feature from tags, added alongside
// the existing tag embeds, not touching them. time_entries(started_at,
// ended_at) embedded the same way, purely for the card-face total-tracked-
// time display — only completed sessions are summed here; the live elapsed
// portion of a currently-running session is added client-side (see
// lib/timer-queries.js's formatDuration + TimerContext), same split as
// TimerBar's own counter.
const INSTANCE_SELECT =
  '*, tagRow:tags(id, name, color), checklist_items(id, is_done), time_entries(started_at, ended_at), template:task_templates(id, title, description, recurrence_rule, start_date, end_date, active, defaultTagRow:tags(id, name, color))';

// Resolve the effective title/description for an instance. One-off tasks (no
// template) and overrides carry their own values; otherwise inherit from the
// template (LIVE join — a template edit shows up immediately on every
// non-override instance). Tag is different: tag_id is copied onto the
// instance once, at generation time (lib/recurrence.js), and is NEVER
// live-joined from the template here — an instance's own tag_id (via
// tagRow) is always authoritative, exactly like checklist_items. Keeps
// `template` attached for views that need recurrence info / the template's
// own default tag.
function resolveInstance(row) {
  const inherits = row.template_id && !row.is_override;
  const checklist = row.checklist_items ?? [];
  const timeEntries = row.time_entries ?? [];
  const trackedSeconds = timeEntries.reduce((sum, e) => {
    if (!e.ended_at) return sum; // still-open session — excluded here, added live in the UI
    return sum + (new Date(e.ended_at) - new Date(e.started_at)) / 1000;
  }, 0);
  return {
    ...row,
    title: inherits ? row.template?.title ?? row.title : row.title,
    description: inherits
      ? row.template?.description ?? row.description
      : row.description,
    tag: row.tagRow ?? null,
    tag_id: row.tag_id ?? null,
    checklist_total: checklist.length,
    checklist_done: checklist.filter((c) => c.is_done).length,
    tracked_seconds: trackedSeconds,
  };
}

// --- Reads -----------------------------------------------------------------

// Fetch resolved instances in an inclusive date range. Omit bounds for all.
export async function fetchInstances({ from, to } = {}, client = supabase) {
  let q = client.from('task_instances').select(INSTANCE_SELECT);
  if (from) q = q.gte('scheduled_date', from);
  if (to) q = q.lte('scheduled_date', to);
  const { data, error } = await q
    .order('scheduled_date', { ascending: true })
    .order('position', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map(resolveInstance);
}

// Convenience for the daily sidebar: a single day's instances.
export async function fetchInstancesForDate(dateStr, client = supabase) {
  return fetchInstances({ from: dateStr, to: dateStr }, client);
}

// Tag reads/writes (getTags, createTag, setInstanceTag, setTemplateDefaultTag)
// live in lib/tag-queries.js, not here — see that module's header comment
// for why tag assignment is fully instance-scoped (never live-joined).

// --- Writes: instances -----------------------------------------------------

// A task with no recurrence — lives entirely on the instance (template_id null).
export async function createOneOffTask(
  { title, description = '', scheduledDate, tagId = null },
  client = supabase
) {
  const { data, error } = await client
    .from('task_instances')
    .insert({
      template_id: null,
      scheduled_date: scheduledDate,
      title,
      description,
      tag_id: tagId,
      is_override: false,
      status: 'todo',
    })
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}

// Mark a single occurrence todo/done/skipped. Sets completed_at on done.
export async function setInstanceStatus(id, status, client = supabase) {
  const { data, error } = await client
    .from('task_instances')
    .update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}

export async function deleteInstance(id, client = supabase) {
  const { error } = await client.from('task_instances').delete().eq('id', id);
  if (error) throw error;
}

// --- Writes: recurring templates ------------------------------------------

// Create a recurring template and materialize its instances in the window.
export async function createRecurringTask(
  { title, description = '', recurrenceRule, startDate, endDate = null, tagId = null },
  client = supabase
) {
  const { data: template, error } = await client
    .from('task_templates')
    .insert({
      title,
      description,
      recurrence_rule: recurrenceRule,
      start_date: startDate,
      end_date: endDate,
      default_tag_id: tagId,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;
  const result = await generateInstances(template, 90, { client });
  return { template, ...result };
}

// --- Edit semantics (CLAUDE.md "Edit semantics for recurring tasks") --------

// Update a one-off task (no template) in place. Tag changes go through
// lib/tag-queries.js's setInstanceTag directly, not through here — see that
// module's header comment.
export async function updateOneOff(id, fields, client = supabase) {
  const patch = {};
  if ('title' in fields) patch.title = fields.title;
  if ('description' in fields) patch.description = fields.description;
  if ('scheduledDate' in fields) patch.scheduled_date = fields.scheduledDate;
  const { data, error } = await client
    .from('task_instances')
    .update(patch)
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}

// "This occurrence only" — detach the row from its template (is_override=true)
// and edit its fields directly. The regenerator will never touch it again.
export async function overrideInstance(id, fields, client = supabase) {
  const patch = { is_override: true };
  if ('title' in fields) patch.title = fields.title;
  if ('description' in fields) patch.description = fields.description;
  if ('scheduledDate' in fields) patch.scheduled_date = fields.scheduledDate;
  const { data, error } = await client
    .from('task_instances')
    .update(patch)
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}

// "All" — edit the template directly and regenerate all non-override,
// non-completed future instances (generateInstances honors the guard).
export async function updateTemplateAll(templateId, fields, client = supabase) {
  const patch = {};
  if ('title' in fields) patch.title = fields.title;
  if ('description' in fields) patch.description = fields.description;
  if ('recurrenceRule' in fields) patch.recurrence_rule = fields.recurrenceRule;
  if ('startDate' in fields) patch.start_date = fields.startDate;
  if ('endDate' in fields) patch.end_date = fields.endDate;
  const { data: template, error } = await client
    .from('task_templates')
    .update(patch)
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;
  const result = await generateInstances(template, 90, { client });
  return { template, ...result };
}

// "This and future" — end the old template the day before `fromDate`, drop its
// regenerable future rows (overrides/completed are preserved), then create a new
// template starting at fromDate and materialize it. Past occurrences stay with
// the old template.
export async function splitTemplate(oldTemplate, fromDate, fields, client = supabase) {
  const dayBefore = addDays(fromDate, -1);

  const { error: endErr } = await client
    .from('task_templates')
    .update({ end_date: dayBefore })
    .eq('id', oldTemplate.id);
  if (endErr) throw endErr;

  // Remove old template's future regenerable rows so they don't linger; keep
  // any override/completed/skipped rows as historical record.
  const { error: delErr } = await client
    .from('task_instances')
    .delete()
    .eq('template_id', oldTemplate.id)
    .eq('is_override', false)
    .eq('status', 'todo')
    .gte('scheduled_date', fromDate);
  if (delErr) throw delErr;

  const { data: newTemplate, error: insErr } = await client
    .from('task_templates')
    .insert({
      title: fields.title ?? oldTemplate.title,
      description: fields.description ?? oldTemplate.description,
      recurrence_rule: fields.recurrenceRule ?? oldTemplate.recurrence_rule,
      default_tag_id: oldTemplate.default_tag_id,
      start_date: fromDate,
      end_date: oldTemplate.end_date ?? null,
      active: true,
    })
    .select()
    .single();
  if (insErr) throw insErr;

  const result = await generateInstances(newTemplate, 90, { client });
  return { oldTemplateId: oldTemplate.id, newTemplate, ...result };
}

// --- Writes: drag-and-drop (v2) --------------------------------------------

// Direct position/date update for drag-and-drop. Only for tasks eligible to
// move freely — one-off (template_id null) or already-overridden recurring
// instances (is_override true). Recurring, non-override drags must NOT call
// this; per the v2 decision log, that case routes through the existing
// this/this+future/all modal (not wired to drag yet).
export async function moveInstance(id, { scheduledDate, position }, client = supabase) {
  const patch = {};
  if (scheduledDate !== undefined) patch.scheduled_date = scheduledDate;
  if (position !== undefined) patch.position = position;
  const { data, error } = await client
    .from('task_instances')
    .update(patch)
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}
