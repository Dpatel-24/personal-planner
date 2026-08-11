// dragAndDrop.js — the ONE place drag-and-drop decision logic lives, shared
// by WeekBoardView (columns keyed by 'inbox' or a date) and CalendarView
// (day cells keyed by date). CLAUDE.md's "no view owns its own data" rule
// extended to interaction logic: if a view needs its own copy of this, that's
// a sign this module is wrong, not a reason to fork it.
//
// Both views group task_instances into a map of key -> item[] (an "Inbox" key
// for the board, plain date-string keys for both). A drag event either
// reorders within one key (position only) or moves an item to a different
// key (scheduled_date + position for the moved item, position for everyone
// else whose index shifted). Recurring, non-override instances render as
// draggable in both views but any drop on them is a no-op — that case needs
// the this/this+future/all modal, not wired to drag yet.
import { useCallback, useState } from 'react';
import { useSensor, useSensors, PointerSensor, pointerWithin, rectIntersection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { moveInstance } from './data';

// Same activation distance in both views, so a plain click (no pointer
// movement) never starts a drag and can still trigger the view's own
// click behavior (WeekBoardCard opens EditModal; CalendarView toggles status).
// On mobile, increase activation distance to prevent accidental drags while scrolling.
export function useDragSensors(isMobile = false) {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: isMobile ? 16 : 8 } }));
}

export function isRecurringNonOverride(instance) {
  return !!instance?.template_id && !instance?.is_override;
}

// Collision detection shared by both DndContexts. Plain closestCorners picks
// whichever droppable has a corner numerically nearest the dragged item's
// corner — for an EMPTY column/cell, its only corners sit at its own edges,
// so anywhere except right near the top can end up numerically closer to a
// neighboring column's cards (each card is its own smaller droppable) than
// to the empty column itself, registering the wrong day. pointerWithin fixes
// this by matching whichever droppable literally contains the pointer
// (nested droppables — a card inside its column — resolve to the smallest/
// innermost one, exactly what's needed for both cross-column drops and
// within-column reordering). rectIntersection is the fallback for the rare
// case for a fast drag where the pointer briefly lands outside every
// droppable (e.g. over a gap or scrollbar) and pointerWithin finds nothing.
export function dragCollisionDetection(args) {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
}

// Tracks the instance currently being dragged so a view can render it in a
// <DragOverlay> — a floating copy that follows the cursor freely above
// everything else, the Trello-style "the card stays visible" behavior.
// Without this, useSortable's own transform only moves the ORIGINAL element,
// which stays confined to its column's DOM position and gets visually
// clipped the moment it crosses a scrolling/overflow boundary (exactly what
// both board columns and calendar cells are). Both views wire the same
// onDragStart/onDragEnd/onDragCancel into their DndContext; only the actual
// preview markup differs (a card vs. a chip), so that part stays view-local.
export function useDragOverlayState() {
  const [activeInstance, setActiveInstance] = useState(null);
  const onDragStart = useCallback((event) => {
    setActiveInstance(event.active?.data?.current?.instance ?? null);
  }, []);
  const clearActiveInstance = useCallback(() => setActiveInstance(null), []);
  return { activeInstance, onDragStart, clearActiveInstance };
}

// Reindex a list's items to sequential 0..n-1 positions.
export function reindexPositions(list) {
  return list.map((item, idx) => ({ ...item, position: idx }));
}

// Pure: given the current key->items map and a dnd-kit drag event's
// active/over, compute the resulting map + the DB writes needed. Returns
// null for a no-op (dropped on itself, or an unresolvable event).
//
// keyToScheduledDate(key) maps a group key to the scheduled_date to write
// when an item moves INTO that key's group — the board passes null for its
// Inbox key and the key itself otherwise; the calendar just passes the key
// straight through (every key is already a date string).
export function computeDragMove({ itemsByKey, active, over, keyToScheduledDate }) {
  const activeInstance = active.data.current?.instance;
  const sourceKey = active.data.current?.columnKey;
  const destKey = over.data.current?.columnKey ?? String(over.id);
  if (!activeInstance || !sourceKey) return null;

  const sourceList = [...(itemsByKey[sourceKey] || [])];
  const sourceIndex = sourceList.findIndex((i) => i.id === active.id);
  if (sourceIndex === -1) return null;

  if (sourceKey === destKey) {
    if (active.id === over.id) return null; // dropped on itself, no-op
    const overIndex = sourceList.findIndex((i) => i.id === over.id);
    const targetIndex = overIndex === -1 ? sourceList.length - 1 : overIndex;
    const reordered = reindexPositions(arrayMove(sourceList, sourceIndex, targetIndex));
    const writes = reordered.map((item) => ({ id: item.id, patch: { position: item.position } }));
    return { nextItemsByKey: { ...itemsByKey, [sourceKey]: reordered }, writes };
  }

  const moved = sourceList[sourceIndex];
  const remainingSource = reindexPositions(sourceList.filter((i) => i.id !== active.id));

  const destList = [...(itemsByKey[destKey] || [])];
  const overIndex = destList.findIndex((i) => i.id === over.id);
  const insertAt = overIndex === -1 ? destList.length : overIndex;
  const movedScheduledDate = keyToScheduledDate(destKey);
  const movedItem = { ...moved, scheduled_date: movedScheduledDate, is_overdue: false };
  const newDest = [...destList];
  newDest.splice(insertAt, 0, movedItem);
  const reindexedDest = reindexPositions(newDest);

  const writes = [
    ...remainingSource.map((item) => ({ id: item.id, patch: { position: item.position } })),
    ...reindexedDest.map((item) => ({
      id: item.id,
      patch:
        item.id === movedItem.id
          ? { position: item.position, scheduledDate: movedScheduledDate }
          : { position: item.position },
    })),
  ];

  return {
    nextItemsByKey: { ...itemsByKey, [sourceKey]: remainingSource, [destKey]: reindexedDest },
    writes,
  };
}

async function persistDragWrites(writes) {
  await Promise.all(writes.map((w) => moveInstance(w.id, w.patch)));
}

// The full onDragEnd both views call directly as their DndContext handler.
// Optimistic local update, then persist, then refresh() — refresh() only
// fires after every write has actually completed (success: re-syncs to the
// true persisted state; failure: discards the bad optimistic state and
// re-syncs to what's really in the DB).
export async function handleSharedDragEnd({
  event,
  itemsByKey,
  keyToScheduledDate,
  setItemsByKey,
  refresh,
  setError,
}) {
  const { active, over } = event;
  if (!over) return;

  const activeInstance = active.data.current?.instance;
  if (isRecurringNonOverride(activeInstance)) {
    console.log('recurring drag: needs modal, wiring next step');
    return;
  }

  const result = computeDragMove({ itemsByKey, active, over, keyToScheduledDate });
  if (!result) return;

  setItemsByKey(result.nextItemsByKey);
  try {
    await persistDragWrites(result.writes);
    refresh();
  } catch (e) {
    setError(e.message);
    refresh();
  }
}
