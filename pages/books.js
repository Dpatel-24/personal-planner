// pages/books.js — Books tracker: three status columns (Want to Read /
// Reading / Finished) shown side by side. Cards are draggable between
// columns, the same way Board cards are — a drop is the only way a book's
// status changes, and it stamps/clears the matching date for you. Clicking a
// card opens an edit modal (title, author, dates, rating, note, delete).
// Fully independent feature (own `books` table, own query module) — no shared
// data with the rest of the app.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  getAllBooks,
  createBook,
  startReading,
  finishBook,
  revertToWantToRead,
  revertToReading,
  updateBook,
  deleteBook,
} from '@/lib/book-queries';
import { useDragSensors } from '@/lib/dragAndDrop';
import { useIsMobile } from '@/lib/useIsMobile';
import { space, font, radius } from '@/lib/tokens';
import { buttonGhost, buttonPrimary, buttonSecondary, input as inputStyle } from '@/lib/components';
import AppNav from '@/components/AppNav';
import Modal from '@/components/Modal';

const NAVY = '#1F3A5F';
const INK = '#1C1C1E';
const MUTED = '#999999';
const BORDER = '#ECECEE';
const DIVIDER = '#F4F4F4';
const STAR_EMPTY = '#E0DFDA';

const STATUSES = ['want_to_read', 'reading', 'finished'];
const STATUS_LABELS = ['Want to Read', 'Reading', 'Finished'];

// Local copy, not imported from lib/dates.js — this feature shares nothing,
// not even a trivial helper, with the rest of the app.
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Moves a book between statuses using the matching transition query, so the
// date stamped (or cleared) on each move comes from one place, not the UI.
async function moveBookTo(book, target) {
  const today = toDateStr(new Date());
  const from = book.status;
  if (from === 'want_to_read' && target === 'reading') return startReading(book.id, today);
  if (from === 'reading' && target === 'finished') return finishBook(book.id, today);
  if (from === 'reading' && target === 'want_to_read') return revertToWantToRead(book.id);
  if (from === 'finished' && target === 'reading') return revertToReading(book.id);
  if (from === 'want_to_read' && target === 'finished') {
    await startReading(book.id, today);
    return finishBook(book.id, today);
  }
  if (from === 'finished' && target === 'want_to_read') {
    await revertToReading(book.id);
    return revertToWantToRead(book.id);
  }
}

function BookCard({ book, onOpen, onDelete, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: book.id });
  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      {...(isOverlay ? {} : listeners)}
      {...(isOverlay ? {} : attributes)}
      onClick={isOverlay ? undefined : () => onOpen(book)}
      style={{
        position: 'relative',
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: radius.sm,
        padding: `${space[2]} ${space[6]} ${space[2]} ${space[3]}`,
        cursor: isOverlay ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: isDragging ? 'none' : 'pan-y',
        userSelect: 'none',
        boxShadow: isOverlay ? '0 4px 12px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      <div
        style={{
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          color: INK,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {book.title}
      </div>
      {book.author && (
        <div style={{ fontSize: font.size.xs, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.author}
        </div>
      )}
      {!isOverlay && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(book.id);
          }}
          aria-label={`Delete ${book.title}`}
          title="Delete"
          style={{
            position: 'absolute',
            top: space[1],
            right: space[1],
            background: 'none',
            border: 'none',
            color: MUTED,
            fontSize: font.size.md,
            lineHeight: 1,
            padding: `0 ${space[1]}`,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function BookColumn({ status, label, books, onOpen, onDelete }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${BORDER}`,
        borderRadius: radius.md,
        overflow: 'hidden',
        background: isOver ? DIVIDER : '#FFFFFF',
        transition: 'background 120ms ease',
      }}
    >
      <div style={{ padding: `${space[2]} ${space[3]}`, background: DIVIDER, display: 'flex', alignItems: 'baseline', gap: space[1], flexShrink: 0 }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: INK }}>{label}</span>
        <span style={{ fontSize: font.size.xs, color: MUTED }}>{books.length}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: space[2], display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {books.length === 0 && (
          <div style={{ textAlign: 'center', color: MUTED, fontSize: font.size.xs, padding: `${space[6]} ${space[2]}` }}>
            Nothing here.
          </div>
        )}
        {books.map((book) => (
          <BookCard key={book.id} book={book} onOpen={onOpen} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// Five tappable stars — clicking the currently-selected star clears it.
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
            fontSize: font.size.lg,
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

function BookEditModal({ book, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author || '');
  const [startedAt, setStartedAt] = useState(book.started_at || '');
  const [finishedAt, setFinishedAt] = useState(book.finished_at || '');
  const [rating, setRating] = useState(book.rating);
  const [note, setNote] = useState(book.note || '');

  const fieldLabel = { fontSize: font.size.xs, color: MUTED, marginBottom: space[1], display: 'block' };

  const submit = (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onSave(book.id, {
      title: t,
      author: author.trim() || null,
      started_at: startedAt || null,
      finished_at: finishedAt || null,
      rating,
      note: note.trim() || null,
    });
  };

  return (
    <Modal onClose={onClose} width={420}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div>
          <label style={fieldLabel}>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <label style={fieldLabel}>Author</label>
          <input style={inputStyle} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" />
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Started</label>
            <input type="date" style={inputStyle} value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Finished</label>
            <input type="date" style={inputStyle} value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={fieldLabel}>Rating</label>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <div>
          <label style={fieldLabel}>Note</label>
          <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: space[2] }}>
          <button type="button" onClick={() => onDelete(book.id)} style={{ ...buttonSecondary, color: '#B93232' }}>
            Delete
          </button>
          <div style={{ display: 'flex', gap: space[2] }}>
            <button type="button" onClick={onClose} style={buttonSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} style={buttonPrimary}>
              Save
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function BooksPage() {
  const isMobile = useIsMobile();
  const sensors = useDragSensors(isMobile);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [busy, setBusy] = useState(false);

  // Background refetch never flips `loading`, so the columns (and the
  // DndContext wrapping them) stay mounted through every drop/save.
  const refresh = () =>
    getAllBooks()
      .then(setBooks)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const byStatus = useMemo(() => {
    const grouped = { want_to_read: [], reading: [], finished: [] };
    for (const b of books) (grouped[b.status] ?? grouped.want_to_read).push(b);
    return grouped;
  }, [books]);

  const patchLocal = (id, fields) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)));
  };

  const activeBook = activeId ? books.find((b) => b.id === activeId) : null;
  const editingBook = editingId ? books.find((b) => b.id === editingId) : null;

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const book = books.find((b) => b.id === active.id);
    if (!book || book.status === over.id) return;
    try {
      await moveBookTo(book, over.id);
      await refresh();
    } catch (e) {
      setError(e.message);
      await refresh();
    }
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
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (id, fields) => {
    setEditingId(null);
    patchLocal(id, fields);
    try {
      await updateBook(id, fields);
      await refresh();
    } catch (e) {
      setError(e.message);
      await refresh();
    }
  };

  const onDelete = async (id) => {
    if (!confirm('Delete this book?')) return;
    setEditingId(null);
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
          <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4], flexShrink: 0 }}>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: INK, fontFamily: font.family }}>Books</div>
              <button
                type="button"
                onClick={() => setAdding((a) => !a)}
                style={{ ...buttonGhost, border: `1px solid ${NAVY}`, color: NAVY, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm }}
              >
                + Add Book
              </button>
            </div>

            {error && <div style={{ color: '#B93232', marginBottom: space[3], fontSize: font.size.sm, flexShrink: 0 }}>{error}</div>}

            {adding && (
              <form
                onSubmit={submitAdd}
                style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[3], padding: space[2], border: `1px solid ${BORDER}`, borderRadius: radius.md, flexShrink: 0 }}
              >
                <input
                  type="text"
                  placeholder="Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  style={{ ...inputStyle, flex: 2, width: 'auto', fontSize: font.size.sm, padding: `${space[1]} ${space[2]}` }}
                />
                <input
                  type="text"
                  placeholder="Author (optional)"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  style={{ ...inputStyle, flex: 1, width: 'auto', fontSize: font.size.sm, padding: `${space[1]} ${space[2]}` }}
                />
                <button type="submit" disabled={busy || !newTitle.trim()} style={{ ...buttonPrimary, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm }}>
                  Add
                </button>
                <button type="button" onClick={() => setAdding(false)} style={{ ...buttonSecondary, padding: `${space[1]} ${space[3]}`, fontSize: font.size.sm }}>
                  Cancel
                </button>
              </form>
            )}

            {loading && <div style={{ color: MUTED, fontSize: font.size.sm }}>Loading…</div>}

            {!loading && (
              <DndContext
                sensors={sensors}
                onDragStart={({ active }) => setActiveId(active.id)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: space[4], overflowX: 'auto' }}>
                  {STATUSES.map((status, i) => (
                    <BookColumn
                      key={status}
                      status={status}
                      label={STATUS_LABELS[i]}
                      books={byStatus[status]}
                      onOpen={(book) => setEditingId(book.id)}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
                <DragOverlay>{activeBook ? <BookCard book={activeBook} onOpen={() => {}} onDelete={() => {}} isOverlay /> : null}</DragOverlay>
              </DndContext>
            )}
          </div>
        </section>
      </div>

      {editingBook && (
        <BookEditModal book={editingBook} onSave={onSave} onDelete={onDelete} onClose={() => setEditingId(null)} />
      )}
    </>
  );
}
