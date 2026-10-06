// pages/books.js — Books tracker: a spreadsheet-style table over three
// statuses (Want to Read / Reading / Finished). Fully independent feature
// (own `books` table, own query module) — no shared data or
// cross-references with Goals/Life Formula/the task planner/the Life tab,
// per the ask. No sidebar, same "top-level route, header + content only"
// pattern as pages/goals.js, pages/life-formula.js, pages/life.js.
//
// TABLE VIEW (2026-10): previously a single list behind a three-way tab
// switcher (one status visible at a time, PillTabs). Replaced with all
// three statuses shown together as three side-by-side columns — the ask
// was "I don't want to toggle through individual pages... I want to see it
// all at the same time, kind of like a table structure." One shared query
// (getAllBooks) replaces the per-tab getBooksByStatus fetch; books are
// grouped into their three arrays client-side after the single fetch.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import {
  getAllBooks,
  createBook,
  startReading,
  finishBook,
  updateBookField,
  deleteBook,
} from '@/lib/book-queries';
import { space, font, radius } from '@/lib/tokens';
import { buttonGhost } from '@/lib/components';
import AppNav from '@/components/AppNav';

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
          fontSize: font.size.xs,
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
      style={{ fontSize: font.size.xs, color: INK, cursor: 'pointer' }}
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
    <div style={{ display: 'flex', gap: 1 }}>
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
            fontSize: font.size.sm,
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
          fontSize: font.size.xs,
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
      style={{ fontSize: font.size.xs, color: value ? INK : MUTED, fontStyle: value ? 'normal' : 'italic', cursor: 'pointer' }}
    >
      {value || '— no note —'}
    </span>
  );
}

function TitleAuthorCell({ title, author }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          color: INK,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={title}
      >
        {title}
      </div>
      {author && (
        <div
          style={{ fontSize: font.size.xs, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={author}
        >
          {author}
        </div>
      )}
    </div>
  );
}

// One column of the table — its own header (status label + count), its own
// rows, its own row shape (what extra fields show below title/author
// depends on status, same per-status shape the old tab view used). All
// three columns render from the SAME books array (filtered by status here),
// so a status transition (Start Reading / Finish) just moves a row from one
// column's filtered slice to another's on the next render — no column owns
// its own fetch.
function BookColumn({ status, label, books, onStartReading, onFinish, onEditField, onDelete }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${BORDER}`, borderRadius: radius.md, overflow: 'hidden' }}>
      <div
        style={{
          padding: `${space[2]} ${space[3]}`,
          background: DIVIDER,
          display: 'flex',
          alignItems: 'baseline',
          gap: space[1],
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: INK }}>{label}</span>
        <span style={{ fontSize: font.size.xs, color: MUTED }}>{books.length}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {books.length === 0 && (
          <div style={{ textAlign: 'center', color: MUTED, fontSize: font.size.xs, padding: `${space[6]} ${space[2]}` }}>
            Nothing here.
          </div>
        )}
        {books.map((book, i) => (
          <div
            key={book.id}
            style={{
              padding: `${space[2]} ${space[3]}`,
              borderTop: i === 0 ? 'none' : `1px solid ${DIVIDER}`,
              display: 'flex',
              flexDirection: 'column',
              gap: space[1],
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TitleAuthorCell title={book.title} author={book.author} />
              </div>
              {status === 'want_to_read' && (
                <button
                  type="button"
                  onClick={() => onStartReading(book.id)}
                  style={{
                    background: NAVY,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: radius.sm,
                    padding: `2px ${space[2]}`,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.medium,
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Start
                </button>
              )}
              {status === 'reading' && (
                <button
                  type="button"
                  onClick={() => onFinish(book.id)}
                  style={{
                    background: NAVY,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: radius.sm,
                    padding: `2px ${space[2]}`,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.medium,
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Finish
                </button>
              )}
              {status === 'finished' && (
                <button
                  type="button"
                  onClick={() => onDelete(book.id)}
                  aria-label={`Delete ${book.title}`}
                  title="Delete"
                  style={{ background: 'none', border: 'none', color: MUTED, fontSize: font.size.sm, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                >
                  …
                </button>
              )}
            </div>

            {status === 'reading' && (
              <div style={{ display: 'flex', gap: space[1], alignItems: 'baseline', fontSize: font.size.xs, color: MUTED2 }}>
                Started <EditableDate value={book.started_at} onSave={(v) => onEditField(book.id, 'started_at', v)} />
              </div>
            )}

            {status === 'finished' && (
              <>
                <div style={{ display: 'flex', gap: space[1], alignItems: 'baseline', fontSize: font.size.xs, color: MUTED2 }}>
                  Finished <EditableDate value={book.finished_at} onSave={(v) => onEditField(book.id, 'finished_at', v)} />
                </div>
                <StarRating value={book.rating} onChange={(v) => onEditField(book.id, 'rating', v)} />
                <EditableNote value={book.note} onSave={(v) => onEditField(book.id, 'note', v)} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BooksPage() {
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
      return getAllBooks()
        .then(setBooks)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = useMemo(() => {
    const grouped = { want_to_read: [], reading: [], finished: [] };
    for (const b of books) {
      (grouped[b.status] ?? grouped.want_to_read).push(b);
    }
    return grouped;
  }, [books]);

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
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onStartReading = async (id) => {
    patchLocal(id, { status: 'reading', started_at: toDateStr(new Date()) });
    try {
      await startReading(id, toDateStr(new Date()));
    } catch (e) {
      setError(e.message);
      await load();
    }
  };

  const onFinish = async (id) => {
    patchLocal(id, { status: 'finished', finished_at: toDateStr(new Date()) });
    try {
      await finishBook(id, toDateStr(new Date()));
    } catch (e) {
      setError(e.message);
      await load();
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

  return (
    <>
      <Head>
        <title>Books · Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <AppNav current="books" />

        <section style={{ flex: 1, minHeight: 0, padding: space[6], display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Capped width, centered — the three columns previously stretched
              edge-to-edge with the page, which read as too wide/sparse on a
              normal desktop window. 900px comfortably fits three columns at
              their own natural widths without forcing them as wide as a
              full ultrawide/maximized browser window. */}
          <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4], flexShrink: 0 }}>
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

          {error && <div style={{ color: '#B93232', marginBottom: space[3], fontSize: font.size.sm, flexShrink: 0 }}>{error}</div>}

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
                flexShrink: 0,
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

          {!loading && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: space[4], overflowX: 'auto' }}>
              {STATUSES.map((status, i) => (
                <BookColumn
                  key={status}
                  status={status}
                  label={STATUS_LABELS[i]}
                  books={byStatus[status]}
                  onStartReading={onStartReading}
                  onFinish={onFinish}
                  onEditField={onEditField}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
          </div>
        </section>
      </div>
    </>
  );
}
