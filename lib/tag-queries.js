// tag-queries.js — data access for the V3 `tags` table and tag assignment.
// Independent of checklists/timer. Tag assignment is fully instance-scoped:
// `tag_id` on task_instances is copied from the template's `default_tag_id`
// ONLY at generation time (lib/recurrence.js), never live-joined at read
// time — so changing one instance's tag_id (setInstanceTag) can never affect
// the template's default or any sibling instance, and changing the template's
// default (setTemplateDefaultTag) can never retroactively affect an
// already-generated instance. Same disposable-until-touched shape as
// checklist_templates -> checklist_items (lib/checklist-queries.js).
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

// Set (or clear) the template's default tag. Only affects instances
// generated AFTER this call (see generateInstances) — never retroactive.
export async function setTemplateDefaultTag(templateId, tagId, client = supabase) {
  const { data, error } = await client
    .from('task_templates')
    .update({ default_tag_id: tagId })
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
