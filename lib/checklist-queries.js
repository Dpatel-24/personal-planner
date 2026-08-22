// checklist-queries.js — data access for the V3 checklist tables. Kept
// separate from lib/data.js (which owns task_instances/task_templates)
// because checklists are a fully independent feature grafted onto both:
// checklist_templates (keyed to task_templates) is the source new instances
// copy from at generation time — see lib/recurrence.js. There is no direct
// UI write path onto checklist_templates anymore (2026-08 redesign); it's
// only ever written as a side effect of lib/data.js's updateTemplateAll
// ("All occurrences" scope), which also retroactively pushes the same
// checklist onto every already-generated eligible instance in the same
// call — see that function's own comment for the full reasoning.
import { supabase } from './supabaseClient';

// --- Instance checklist (actual, per-occurrence, lives on task_instances) --

export async function getChecklistItems(instanceId, client = supabase) {
  const { data, error } = await client
    .from('checklist_items')
    .select('*')
    .eq('instance_id', instanceId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addChecklistItem(instanceId, text, client = supabase) {
  const existing = await getChecklistItems(instanceId, client);
  const { data, error } = await client
    .from('checklist_items')
    .insert({ instance_id: instanceId, text: text.trim(), position: existing.length, is_done: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeChecklistItem(itemId, client = supabase) {
  const { error } = await client.from('checklist_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function toggleChecklistItem(itemId, isDone, client = supabase) {
  const { data, error } = await client
    .from('checklist_items')
    .update({ is_done: isDone })
    .eq('id', itemId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Plain up/down reorder (not the board/calendar drag pattern — that module,
// lib/dragAndDrop.js, is built around task_instances columns/days, not
// generic ordered lists, so reusing it here would not be trivial). Swaps
// the `position` of two adjacent items and writes both.
export async function swapChecklistItemPositions(itemA, itemB, client = supabase) {
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    client.from('checklist_items').update({ position: itemB.position }).eq('id', itemA.id),
    client.from('checklist_items').update({ position: itemA.position }).eq('id', itemB.id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
}
