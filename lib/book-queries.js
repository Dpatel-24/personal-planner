// book-queries.js — data access for the `books` table (Books tracker).
// Fully independent: no joins, no foreign keys, no references to
// task_templates/task_instances/goals/life_formula_entries/day_logs
// anywhere in this file or the table itself — same "no shared data, no
// cross-references" contract as lib/day-logs-queries.js. Same
// plain-functions-over-the-browser-client convention as every other
// lib/*.js module.
import { supabase } from './supabaseClient';

const BOOKS_SELECT = 'id, title, author, status, started_at, finished_at, rating, note, created_at, updated_at';

// All books, every status, most-recently-added first within each status —
// backs the table view (pages/books.js), which shows all three statuses at
// once instead of switching between them. Grouping into three arrays
// happens client-side (one small query, not three).
export async function getAllBooks(client = supabase) {
  const { data, error } = await client
    .from('books')
    .select(BOOKS_SELECT)
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

// Reading -> Want to Read: the reverse of startReading. Clears started_at
// in the SAME write as the status change (mirrors startReading's own
// pairing) — an "undo, I clicked Start by mistake" shouldn't leave a stale
// started_at behind for a book that's no longer marked as being read.
export async function revertToWantToRead(id, client = supabase) {
  const { data, error } = await client
    .from('books')
    .update({ status: 'want_to_read', started_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BOOKS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Finished -> Reading: the reverse of finishBook. Clears finished_at the
// same way; rating/note are left as-is (same reasoning finishBook's own
// comment gives for not touching them on the forward transition) so
// un-finishing a book doesn't throw away a rating/note already entered.
export async function revertToReading(id, client = supabase) {
  const { data, error } = await client
    .from('books')
    .update({ status: 'reading', finished_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BOOKS_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Edit modal save — writes whichever editable fields the form submitted
// in one update. Status is never part of this; it only changes through the
// drag transitions above.
export async function updateBook(id, fields, client = supabase) {
  const { data, error } = await client
    .from('books')
    .update({ ...fields, updated_at: new Date().toISOString() })
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
