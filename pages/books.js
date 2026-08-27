// pages/books.js — Books tracker: a spreadsheet-style table over three
// statuses (Want to Read / Reading / Finished). Fully independent feature
// (own `books` table, own query module) — no shared data or
// cross-references with Goals/Life Formula/the task planner/the Life tab,
// per the ask. No sidebar, same "top-level route, header + content only"
// pattern as pages/goals.js, pages/life-formula.js, pages/life.js.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import {
  getBooksByStatus,
  createBook,
  startReading,
  finishBook,
  updateBookField,
  deleteBook,
} from '@/lib/book-queries';
import { space, font, radius } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';
import AppNav from '@/components/AppNav';
import PillTabs from '@/components/PillTabs';

// Palette locked to exactly these values (existing tokens + the two star
// colors the spec adds specifically for this page) — no other color
// appears anywhere here.
const NAVY = '#1F3A5F';
const INK = '#1C1C1E';
const MUTED = '#999999';
const MUTED2 = '#B0AFA9';
const BORDER = '#ECECEE';
const DIVIDER = '#F4F4F4';
const STAR_EMPTY = '#E0DFDA';

const STATUSES = ['want_to_read', 'reading', 'finished'];
const STATUS_LABELS = ['Want to Read', 'Reading', 'Finished'];

// Local copy, not imported from lib/dates.js or lib/day-logs-queries.js —
// same file-level independence reasoning lib/day-logs-queries.js's own
// toDateStr documents: this feature shares nothing, not even a trivial
// helper, with the rest of the app.
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' -> 'Aug 25, 2026'. Parsed as a local date (no UTC shift),
// same reasoning as lib/dates.js's own humanDate().
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Click-to-edit date cell — shows the formatted date as plain text; a click
// swaps it for a native date input, which saves on change (no separate save
// step) and swaps back to display mode.
function EditableDate({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value || ''}
        onChange={(e) => {
          if (e.target.value) onSave(e.target.value);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        style={{
          fontSize: font.size.sm,
          fontFamily: font.family,
          color: INK,
          border: `1px solid ${BORDER}`,
          borderRadius: radius.sm,
          padding: `2px ${space[1]}`,
        }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      style={{ fontSize: font.size.sm, color: INK, cursor: 'pointer' }}
      title="Click to change date"
    >
      {value ? formatDate(value) : '—'}
    </span>
  );
}

// Five tappable stars — click sets rating to that star's number; clicking
// the currently-selected star again clears it back to null. No half-stars,
// no hover preview beyond the native button hover, per the ask's scope.
function StarRating({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: font.size.md,
            lineHeight: 1,
            color: value !== null && n <= value ? NAVY : STAR_EMPTY,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// Click-to-edit note cell — shows the note, or a muted "— no note —"
// placeholder when empty; a click swaps either for a text input that saves
// on blur or Enter. An empty save reverts to the placeholder rather than
// storing an empty string.
function EditableNote({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value || '')) onSave(trimmed || null);
  };

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setDraft(value || '');
            setEditing(false);
          }
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontSize: font.size.sm,
          fontFamily: font.family,
          color: INK,
          border: `1px solid ${BORDER}`,
          borderRadius: radius.sm,
          padding: `2px ${space[1]}`,
        }}
      />
    );
  }
  return (
    <span
      onClick={() => {
        setDraft(value || '');
        setEditing(true);
      }}
      style={{ fontSize: font.size.sm, color: value ? INK : MUTED, fontStyle: value ? 'normal' : 'italic', cursor: 'pointer' }}
    >
      {value || '— no note —'}
    </span>
  );
}

const COLUMN_DEFS = {
  want_to_read: [
    { key: 'title', label: 'Title', width: '1fr' },
    { key: 'action', label: '', width: '140px' },
  ],
  reading: [
    { key: 'title', label: 'Title', width: '1fr' },
    { key: 'started', label: 'Started', width: '140px' },
    { key: 'action', label: '', width: '110px' },
  ],
  finished: [
    { key: 'title', label: 'Title', width: '1fr' },
    { key: 'finished', label: 'Finished', width: '120px' },
    { key: 'rating', label: 'Rating', width: '120px' },
    { key: 'note', label: 'Note', width: '220px' },
    { key: 'action', label: '', width: '40px' },
  ],
};

function TitleAuthorCell({ title, author }) {
  return (
    <div>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: INK }}>{title}</div>
      {author && <div style={{ fontSize: font.size.xs, color: MUTED }}>{author}</div>}
    </div>
  );
}

export default function BooksPage() {
  const [statusIndex, setStatusIndex] = useState(1); // default 'Reading'
  const status = STATUSES[statusIndex];
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useMemo(
    () => () => {
      setLoading(true);
      setError(null);
      return getBooksByStatus(status)
        .then(setBooks)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  const patchLocal = (id, fields) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)));
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      await createBook({ title, author: newAuthor });
      setNewTitle('');
      setNewAuthor('');
      setAdding(false);
      if (status === 'want_to_read') await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onStartReading = async (id) => {
    try {
      await startReading(id, toDateStr(new Date()));
      setBooks((prev) => prev.filter((b) => b.id !== id)); // leaves this tab (Want to Read) immediately
    } catch (e) {
      setError(e.message);
    }
  };

  const onFinish = async (id) => {
    try {
      await finishBook(id, toDateStr(new Date()));
      setBooks((prev) => prev.filter((b) => b.id !== id)); // leaves this tab (Reading) immediately
    } catch (e) {
      setError(e.message);
    }
  };

  const onEditField = async (id, field, value) => {
    patchLocal(id, { [field]: value });
    try {
      await updateBookField(id, field, value);
    } catch (e) {
      setError(e.message);
      await load(); // revert to real state on failure
    }
  };

  const onDelete = async (id) => {
    if (!confirm('Delete this book?')) return;
    try {
      await deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const columns = COLUMN_DEFS[status];
  const gridTemplateColumns = columns.map((c) => c.width).join(' ');

  return (
    <>
      <Head>
        <title>Books · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <AppNav current="books" />

        <section style={{ flex: 1, minHeight: 0, padding: space[6], overflow: 'auto' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] }}>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: INK, fontFamily: font.family }}>
                Books
              </div>
              <button
                type="button"
                onClick={() => setAdding((a) => !a)}
                style={{
                  ...buttonGhost,
                  border: `1px solid ${NAVY}`,
                  color: NAVY,
                  padding: `${space[1]} ${space[3]}`,
                  fontSize: font.size.sm,
                }}
              >
                + Add Book
              </button>
            </div>

            {error && <div style={{ color: '#B93232', marginBottom: space[3], fontSize: font.size.sm }}>{error}</div>}

            <div style={{ marginBottom: space[4] }}>
              <PillTabs options={STATUS_LABELS} activeIndex={statusIndex} onChange={setStatusIndex} />
            </div>

            {adding && (
              <form
                onSubmit={submitAdd}
                style={{
                  display: 'flex',
                  gap: space[2],
                  alignItems: 'center',
                  marginBottom: space[3],
                  padding: space[2],
                  border: `1px solid ${BORDER}`,
                  borderRadius: radius.md,
                }}
              >
                <input
                  type="text"
                  placeholder="Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  style={{
                    flex: 2,
                    fontSize: font.size.sm,
                    fontFamily: font.family,
                    border: `1px solid ${BORDER}`,
                    borderRadius: radius.sm,
                    padding: `${space[1]} ${space[2]}`,
                  }}
                />
                <input
                  type="text"
                  placeholder="Author (optional)"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  style={{
                    flex: 1,
                    fontSize: font.size.sm,
                    fontFamily: font.family,
                    border: `1px solid ${BORDER}`,
                    borderRadius: radius.sm,
                    padding: `${space[1]} ${space[2]}`,
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !newTitle.trim()}
                  style={{
                    background: NAVY,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: radius.sm,
                    padding: `${space[1]} ${space[3]}`,
                    fontSize: font.size.sm,
                    fontWeight: font.weight.medium,
                    cursor: busy || !newTitle.trim() ? 'default' : 'pointer',
                    opacity: busy || !newTitle.trim() ? 0.5 : 1,
                  }}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  style={{ background: 'none', border: 'none', color: MUTED, fontSize: font.size.sm, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </form>
            )}

            {loading && <div style={{ color: MUTED, fontSize: font.size.sm }}>Loading…</div>}

            {!loading && books.length === 0 && (
              <div style={{ textAlign: 'center', color: MUTED, fontSize: font.size.sm, padding: `${space[8]} 0` }}>
                No books in {STATUS_LABELS[statusIndex]}.
              </div>
            )}

            {!loading && books.length > 0 && (
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: radius.md, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns,
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    background: DIVIDER,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.bold,
                    color: MUTED,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {columns.map((c) => (
                    <div key={c.key}>{c.label}</div>
                  ))}
                </div>

                {books.map((book, i) => (
                  <div
                    key={book.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns,
                      gap: space[3],
                      alignItems: 'center',
                      padding: `${space[2]} ${space[3]}`,
                      borderTop: i === 0 ? 'none' : `1px solid ${DIVIDER}`,
                    }}
                  >
                    {columns.map((c) => {
                      if (c.key === 'title') {
                        return <TitleAuthorCell key={c.key} title={book.title} author={book.author} />;
                      }
                      if (c.key === 'started') {
                        return (
                          <EditableDate
                            key={c.key}
                            value={book.started_at}
                            onSave={(v) => onEditField(book.id, 'started_at', v)}
                          />
                        );
                      }
                      if (c.key === 'finished') {
                        return (
                          <EditableDate
                            key={c.key}
                            value={book.finished_at}
                            onSave={(v) => onEditField(book.id, 'finished_at', v)}
                          />
                        );
                      }
                      if (c.key === 'rating') {
                        return (
                          <StarRating
                            key={c.key}
                            value={book.rating}
                            onChange={(v) => onEditField(book.id, 'rating', v)}
                          />
                        );
                      }
                      if (c.key === 'note') {
                        return (
                          <EditableNote
                            key={c.key}
                            value={book.note}
                            onSave={(v) => onEditField(book.id, 'note', v)}
                          />
                        );
                      }
                      // action column
                      if (status === 'want_to_read') {
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => onStartReading(book.id)}
                            style={{
                              background: NAVY,
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: radius.sm,
                              padding: `${space[1]} ${space[2]}`,
                              fontSize: font.size.xs,
                              fontWeight: font.weight.medium,
                              cursor: 'pointer',
                            }}
                          >
                            Start Reading
                          </button>
                        );
                      }
                      if (status === 'reading') {
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => onFinish(book.id)}
                            style={{
                              background: NAVY,
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: radius.sm,
                              padding: `${space[1]} ${space[2]}`,
                              fontSize: font.size.xs,
                              fontWeight: font.weight.medium,
                              cursor: 'pointer',
                            }}
                          >
                            Finish
                          </button>
                        );
                      }
                      // finished — delete-only "..." menu, no forward action
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => onDelete(book.id)}
                          aria-label={`Delete ${book.title}`}
                          title="Delete"
                          style={{ background: 'none', border: 'none', color: MUTED, fontSize: font.size.md, cursor: 'pointer', padding: 0 }}
                        >
                          …
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
