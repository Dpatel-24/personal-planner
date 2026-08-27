// book-queries.js — data access for the `books` table (Books tracker).
// Fully independent: no joins, no foreign keys, no references to
// task_templates/task_instances/goals/life_formula_entries/day_logs
// anywhere in this file or the table itself — same "no shared data, no
// cross-references" contract as lib/day-logs-queries.js. Same
// plain-functions-over-the-browser-client convention as every other
// lib/*.js module.
import { supabase } from './supabaseClient';

const BOOKS_SELECT = 'id, title, author, status, started_at, finished_at, rating, note, created_at, updated_at';

// All books with a given status, most-recently-added first — one query per
// active tab, matching the ask's "data always pulled from the full books
// table filtered by status" (not a single fetch-everything-then-filter-
// client-side; a status switch is a fresh, small, targeted query).
export async function getBooksByStatus(status, client = supabase) {
  const { data, error } = await client
    .from('books')
    .select(BOOKS_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Add Book — always inserts into Want to Read regardless of which tab is
// active, per the ask ("no status picker on add"). Author is optional;
// `null` (not '') for an empty author so the DB's own nullable column
// reflects "not provided" cleanly.
export async function createBook({ title, author }, client = supabase) {
  const { data, error } = await client
    .from('books')
    .insert({ title: title.trim(), author: author?.trim() || null })
    .select(BOOKS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Want to Read -> Reading: sets started_at to today in the SAME write as
// the status change, not a separate call — a book can never end up
// "reading" with no start date from this path.
export async function startReading(id, todayDateStr, client = supabase) {
  const { data, error } = await client
    .from('books')
    .update({ status: 'reading', started_at: todayDateStr, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BOOKS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Reading -> Finished: same pairing for finished_at. Rating/note are left
// untouched (null unless the row already had them, which it won't on a
// fresh transition) — the user fills those in afterward via the inline
// editors, per the ask.
export async function finishBook(id, todayDateStr, client = supabase) {
  const { data, error } = await client
    .from('books')
    .update({ status: 'finished', finished_at: todayDateStr, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BOOKS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Generic single-field patch — backs every inline editor (started_at,
// finished_at, rating, note). One shared function rather than four
// near-identical ones, since they're all "write this one column, bump
// updated_at" with no other logic.
export async function updateBookField(id, field, value, client = supabase) {
  const { data, error } = await client
    .from('books')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BOOKS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBook(id, client = supabase) {
  const { error } = await client.from('books').delete().eq('id', id);
  if (error) throw error;
}
