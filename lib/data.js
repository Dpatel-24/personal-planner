// data.js — the single data-access layer. Every view reads/writes tasks
// through here (CLAUDE.md: task_instances is the one source of truth; no view
// owns its own fetch logic). Board groups by status, calendar by
// scheduled_date, sidebar filters scheduled_date = today — all from the same
// resolved instance shape returned here.
import { supabase } from './supabaseClient';
import { generateInstances } from './recurrence';
import { addDays, todayStr } from './dates';
import { stopTimerForInstance } from './timer-queries';
import { assignTodaySchedule } from './scheduling';

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

// Sidebar: today's instances PLUS carried-over todos from earlier days
// (same pattern as board's today column merge). All results get is_overdue flag.
export async function fetchInstancesForDateWithRollover(dateStr, client = supabase) {
  // Fetch today's instances
  const { data: todayData, error: todayErr } = await client
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .eq('scheduled_date', dateStr)
    .order('position', { ascending: true, nullsFirst: true });
  if (todayErr) throw todayErr;
  const todayInstances = (todayData ?? []).map((row) => ({
    ...resolveInstance(row),
    is_overdue: false,
  }));

  // Fetch rolled-over todos from earlier days
  const { data: rolloverData, error: rolloverErr } = await client
    .from('task_instances')
    .select(INSTANCE_SELECT)
    .lt('scheduled_date', dateStr)
    .eq('status', 'todo')
    .order('scheduled_date', { ascending: true })
    .order('position', { ascending: true, nullsFirst: true });
  if (rolloverErr) throw rolloverErr;
  const rolloverInstances = (rolloverData ?? []).map((row) => ({
    ...resolveInstance(row),
    is_overdue: true,
  }));

  // Schedule Rail auto-placement (V5): stacks any still-unscheduled instance
  // (native today's task OR rolled-over overdue task, per this feature's
  // decision — both go through the same auto-stack) back-to-back from
  // 8:00 AM in this exact list order. Idempotent — already-scheduled rows
  // are never rewritten, see lib/scheduling.js.
  return assignTodaySchedule([...rolloverInstances, ...todayInstances], dateStr, client);
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
// Completing a task also stops ITS timer if it's the one currently running
// (CLAUDE.md: timer stops on completion) — a no-op otherwise. Done first, so
// the select below picks up the just-ended session in this instance's
// embedded time_entries (card-face total-tracked-time stays correct
// immediately, not just after the next unrelated refresh).
// When marking done, also update scheduled_date to today (for carried-over tasks).
export async function setInstanceStatus(id, status, client = supabase) {
  if (status === 'done') {
    await stopTimerForInstance(id, client);
  }
  const { data, error } = await client
    .from('task_instances')
    .update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      scheduled_date: status === 'done' ? todayStr() : undefined,
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
  if ('scheduledDate' in fields) {
    patch.scheduled_date = fields.scheduledDate;
    // The rail (lib/scheduling.js) assumes scheduled_start's own calendar
    // day always matches scheduled_date — a block's vertical position is
    // computed as minutes-since-that-day's-6AM. Moving a task to a new day
    // without clearing its old scheduled_start leaves a timestamp still
    // anchored to the day it came from, which the rail then renders at a
    // wildly negative (or otherwise wrong-day) offset — effectively
    // invisible, not just misplaced. Nulling it here lets the rail's own
    // assignTodaySchedule auto-stack the task fresh on its new day next
    // load, the same as any other newly-unscheduled task.
    patch.scheduled_start = null;
  }
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
  if ('scheduledDate' in fields) {
    patch.scheduled_date = fields.scheduledDate;
    // Same reasoning as updateOneOff's own scheduledDate branch above —
    // clear a stale, wrong-day rail time whenever the day itself changes.
    patch.scheduled_start = null;
  }
  const { data, error } = await client
    .from('task_instances')
    .update(patch)
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}

// "All" — edit the template directly, THEN retroactively push tag_id and/or
// checklist onto every existing eligible sibling instance, full replace, not
// a merge (2026-08 redesign, see CLAUDE.md decisions log: "apply to all"
// now means "the current state of THIS occurrence becomes every eligible
// occurrence's state," not "only new occurrences generated from now on get
// it" — the old default_tag_id/checklist_templates copy-once-at-generation
// behavior was silently non-retroactive and read as a bug from the outside:
// setting a recurring task's tag or checklist never showed up on any
// already-materialized occurrence, which for a ~90-day generation window is
// effectively everything visible.
//
// "Eligible sibling" = same guard generateInstances' own reconcile() already
// uses: is_override = false AND status = 'todo'. An occurrence detached via
// "This occurrence only" (is_override = true) or already completed/skipped
// is exempt — that's the one guarantee that must hold in reverse, or "this
// occurrence only" would stop meaning anything the next time someone
// applies a change to the whole series.
//
// fields.tagId / fields.checklistItems are OPTIONAL — omit either to leave
// that part of the series untouched (title/description-only edits still
// work exactly as before). checklistItems is a plain [{ text }, ...] array,
// its own position implied by array order.
export async function updateTemplateAll(templateId, fields, client = supabase) {
  const patch = {};
  if ('title' in fields) patch.title = fields.title;
  if ('description' in fields) patch.description = fields.description;
  if ('recurrenceRule' in fields) patch.recurrence_rule = fields.recurrenceRule;
  if ('startDate' in fields) patch.start_date = fields.startDate;
  if ('endDate' in fields) patch.end_date = fields.endDate;
  if ('tagId' in fields) patch.default_tag_id = fields.tagId;

  const { data: template, error } = await client
    .from('task_templates')
    .update(patch)
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;

  if ('tagId' in fields || 'checklistItems' in fields) {
    const { data: siblings, error: sibErr } = await client
      .from('task_instances')
      .select('id')
      .eq('template_id', templateId)
      .eq('is_override', false)
      .eq('status', 'todo');
    if (sibErr) throw sibErr;
    const siblingIds = (siblings || []).map((s) => s.id);

    if ('tagId' in fields && siblingIds.length) {
      const { error: tagErr } = await client
        .from('task_instances')
        .update({ tag_id: fields.tagId })
        .in('id', siblingIds);
      if (tagErr) throw tagErr;
    }

    if ('checklistItems' in fields) {
      // The template's own checklist definition is what brand-new future
      // occurrences copy from (see generateInstances below) — replace it to
      // match what's being pushed everywhere else, so a new occurrence
      // generated tomorrow doesn't diverge from what "all occurrences"
      // means today.
      const { error: delTplErr } = await client
        .from('checklist_templates')
        .delete()
        .eq('template_id', templateId);
      if (delTplErr) throw delTplErr;
      if (fields.checklistItems.length) {
        const { error: insTplErr } = await client.from('checklist_templates').insert(
          fields.checklistItems.map((item, i) => ({ template_id: templateId, text: item.text, position: i }))
        );
        if (insTplErr) throw insTplErr;
      }

      if (siblingIds.length) {
        // Full replace on every eligible sibling — per the "current state
        // should reflect to all" decision, not a merge with whatever that
        // occurrence's checklist already had (which would leave stale items
        // behind or produce duplicates).
        const { error: delErr } = await client
          .from('checklist_items')
          .delete()
          .in('instance_id', siblingIds);
        if (delErr) throw delErr;
        if (fields.checklistItems.length) {
          const rows = siblingIds.flatMap((instanceId) =>
            fields.checklistItems.map((item, i) => ({
              instance_id: instanceId,
              text: item.text,
              position: i,
              is_done: false,
            }))
          );
          const { error: insErr } = await client.from('checklist_items').insert(rows);
          if (insErr) throw insErr;
        }
      }
    }
  }

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
  if (scheduledDate !== undefined) {
    patch.scheduled_date = scheduledDate;
    // Same reasoning as updateOneOff's own scheduledDate branch (lib/data.js)
    // — a Board/Calendar drag to a new day must not leave the task's rail
    // time (scheduled_start) anchored to the day it came from, or the rail
    // renders it at a wrong-day, effectively-invisible offset. Only fires
    // when scheduledDate is actually part of this call — a same-day
    // reorder (position-only drag, computeDragMove's sourceKey===destKey
    // branch) never includes it, so it never nulls a valid same-day time.
    patch.scheduled_start = null;
  }
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

// --- Writes: Schedule Rail (V5) ---------------------------------------------

// Direct duration update — no this/this+future/all scope choice, same
// reasoning as moveInstance() above: a task's estimated duration is a
// scheduling attribute, not editorial content (title/description), so it
// updates the instance row directly regardless of recurring status. Two
// entry points write here — the rail's own +/- stepper and its drag-resize
// handle (both live together in ScheduleRail.js's RailBlock) — both call
// this one function so there's a single place duration ever actually gets
// persisted.
export async function updateEstimatedDuration(id, minutes, client = supabase) {
  const { data, error } = await client
    .from('task_instances')
    .update({ estimated_duration_minutes: minutes })
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}

// Direct scheduled_start update — same reasoning and same shape as
// updateEstimatedDuration() immediately above: a scheduling attribute, not
// editorial content, updated directly regardless of recurring status, no
// this/this+future/all scope choice. Written by rail_drag_cascade_plan.md
// Step 3's whole-block move commit — always called once per task in a
// cascadeLater() result set (the moved task plus however many it displaced),
// batched via Promise.all in the caller since Supabase has no true bulk
// upsert-by-id-list for arbitrary per-row values without a temp table (same
// constraint already noted on lib/scheduling.js's assignTodaySchedule).
export async function updateScheduledStart(id, scheduledStart, client = supabase) {
  const { data, error } = await client
    .from('task_instances')
    .update({ scheduled_start: scheduledStart })
    .eq('id', id)
    .select(INSTANCE_SELECT)
    .single();
  if (error) throw error;
  return resolveInstance(data);
}
