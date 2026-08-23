// tag-queries.js — data access for the V3 `tags` table and tag assignment.
// Independent of checklists/timer. `tag_id` on task_instances is copied from
// the template's `default_tag_id` at generation time (lib/recurrence.js) —
// never live-joined at read time, so changing one instance's tag_id
// (setInstanceTag) never affects the template's default or any sibling
// instance on its own. The one deliberate exception: lib/data.js's
// updateTemplateAll (EditModal's "All occurrences" scope) explicitly pushes
// a chosen tag_id onto the template's default AND every eligible sibling
// instance in one retroactive step (2026-08 redesign — see CLAUDE.md
// decisions log). There is no standalone "set the template's default tag"
// write path anymore; that's what updateTemplateAll replaced.
import { supabase } from './supabaseClient';

export async function getTags(client = supabase) {
  const { data, error } = await client.from('tags').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createTag(name, color = null, client = supabase) {
  const { data, error } = await client
    .from('tags')
    .insert({ name: name.trim(), color })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Assign (or clear, tagId = null) the tag on one specific instance directly.
// Never touches the parent template or any other instance.
export async function setInstanceTag(instanceId, tagId, client = supabase) {
  const { data, error } = await client
    .from('task_instances')
    .update({ tag_id: tagId })
    .eq('id', instanceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update an existing tag (name and/or color).
export async function updateTag(tagId, updates, client = supabase) {
  const { data, error } = await client
    .from('tags')
    .update(updates)
    .eq('id', tagId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Delete a tag. Does NOT clear tag_id from instances — instances keep
// the deleted tag_id (orphaned reference), but getTags will return fewer rows.
export async function deleteTag(tagId, client = supabase) {
  const { error } = await client.from('tags').delete().eq('id', tagId);
  if (error) throw error;
}

// Get all recurring task templates with their default tags and active status.
// Used for the "all recurring tasks" overview in tag management.
export async function getRecurringTasks(client = supabase) {
  const { data, error } = await client
    .from('task_templates')
    .select('id, title, description, recurrence_rule, start_date, end_date, active, defaultTagRow:tags(id, name, color)')
    .order('title');
  if (error) throw error;
  return data ?? [];
}

// Get a single task template by ID (for editing).
export async function getTaskTemplate(templateId, client = supabase) {
  const { data, error } = await client
    .from('task_templates')
    .select('*')
    .eq('id', templateId)
    .single();
  if (error) throw error;
  return data;
}

// Delete a recurring task's template. Does NOT delete its already-generated
// task_instances — the schema's own `template_id ... on delete set null`
// detaches them instead (checklist_templates rows DO cascade-delete, per
// `on delete cascade` — but each instance's own already-copied
// checklist_items is untouched, same as any other disposable-until-touched
// template field). Every existing occurrence quietly becomes a plain
// one-off task, keeping whatever title/description/tag/checklist it
// already had, exactly like deleteTag's own "orphaned reference, not a
// cascade delete" behavior right above.
export async function deleteTaskTemplate(templateId, client = supabase) {
  const { error } = await client.from('task_templates').delete().eq('id', templateId);
  if (error) throw error;
}

// Update a task template (title, description, etc.). Does NOT modify the
// recurrence rule or other structural fields.
export async function updateTaskTemplate(templateId, updates, client = supabase) {
  const { data, error } = await client
    .from('task_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
