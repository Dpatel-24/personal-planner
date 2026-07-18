# Personal Planner V3 Context Handoff

**Date:** 2026-07-16  
**Status:** Complete and deployed  
**Branch:** main (all changes committed and pushed)

---

## Overview

Three independent features were added to the Personal Planner app using the **disposable-until-touched pattern**: data is copied at generation time and frozen, never live-joined afterward. This prevents template edits from retroactively affecting already-generated instances.

---

## Features Implemented

### 1. Checklists

**Tables:** `checklist_templates` (on task_templates) → `checklist_items` (on task_instances)

- Template-level UI (EditModal, recurring tasks only): `ChecklistTemplateSection.js`
  - Add/remove template items (affects future instances only)
  - Includes disclaimer: "Editing this never changes already-generated occurrences"
  - Immediate writes, not gated by Save button

- Instance-level UI (EditModal, all tasks): `ChecklistSection.js`
  - Add/remove/toggle/reorder checklist items for one specific instance
  - Shows progress label: `X/Y`
  - Immediate writes, calls refresh() on all mutations
  - Drag handles for up/down reordering

- Data layer: `lib/checklist-queries.js`
  - Template functions: `getChecklistTemplate()`, `addChecklistTemplateItem()`, `removeChecklistTemplateItem()`
  - Instance functions: `getChecklistItems()`, `addChecklistItem()`, `toggleChecklistItem()`, `removeChecklistItem()`, `swapChecklistItemPositions()`

- Card display: `WeekBoardCard.js`, `CalendarChip.js`
  - Embedded via `checklist_items(id, is_done)` in INSTANCE_SELECT
  - Shows progress on card face

---

### 2. Tags

**Tables:** `tags`, `task_instances.tag_id`, `task_templates.default_tag_id`

- Tag manager modal: `TagManagerModal.js`
  - List all tags with colored dots
  - Create new tags (name + optional #hex color)
  - Opened from app header via button

- Instance assignment (EditModal): `TagAssignSection.js` exports `InstanceTagSection`
  - Single-select dropdown per task
  - Immediate write on change (no Save button gate)
  - Can clear tag (set to null)

- Template default tag (EditModal, recurring tasks): `TagAssignSection.js` exports `TemplateDefaultTagSection`
  - Sets default_tag_id on task_templates
  - Only affects instances generated AFTER the change

- Data layer: `lib/tag-queries.js`
  - `getTags()` — fetch all tags ordered by name
  - `createTag(name, color)` — create new tag
  - `setInstanceTag(instanceId, tagId)` — assign tag to one instance
  - `setTemplateDefaultTag(templateId, tagId)` — set template default (for future instances)

- Card display: `WeekBoardCard.js`, `CalendarChip.js`
  - Colored dot showing assigned tag
  - Tag data embedded via `INSTANCE_SELECT` (tag_id from task_instances)

---

### 3. Timer

**Table:** `time_entries` (single-active invariant enforced via unique index)

- Global state: `TimerContext.js`
  - Provides `useTimer()` hook returning `{ activeTimer, startTimer(), stopTimer() }`
  - Fetches via `getActiveTimer()` (max one row with ended_at IS NULL)
  - Refetches on own `refreshTimer()` AND on RefreshContext version bump
  - Wrapped at app root (pages/index.js)

- Persistent UI: `TimerBar.js`
  - Positioned in app shell (pages/index.js, between header and sections)
  - Shows running task title + live elapsed counter (H:MM:SS via `formatDuration()`)
  - Stop button; auto-hides when no active timer

- Task controls: `TaskRow.js` (sidebar)
  - Play (▶) button to start timer on that task
  - Starting timer on Task B auto-stops Task A (via `start_timer()` RPC)
  - Draggable via @dnd-kit/sortable (made reorderable per subsequent request)

- Card display: `WeekBoardCard.js`, `CalendarChip.js`
  - Live elapsed-time counter ticking while active
  - Initially had start button, removed (moved to sidebar)
  - Tracked_seconds calculated from time_entries

- Data layer: `lib/timer-queries.js`
  - `getActiveTimer()` — fetch at-most-one active entry
  - `startTimer(instanceId)` — Postgres RPC (atomic, auto-stops previous)
  - `stopTimer()` — stop the active timer
  - `stopTimerForInstance(instanceId)` — stop only if that instance is active
  - `formatDuration(totalSeconds)` — H:MM:SS formatting

- Auto-stop on completion: `lib/data.js` `setInstanceStatus()`
  - Calls `stopTimerForInstance()` when status === 'done'

---

## Key Design Patterns

### Disposable-Until-Touched
- `checklist_templates` → `checklist_items` copied at instance generation (lib/recurrence.js)
- `task_templates.default_tag_id` → `task_instances.tag_id` copied at generation (lib/recurrence.js)
- Template edits never retroactively modify already-generated instances
- Instance edits are fully scoped to that instance

### Embedded Data (PostgREST Relational)
- INSTANCE_SELECT in both lib/data.js and lib/board-queries.js includes:
  - `checklist_items(id, is_done)` 
  - `time_entries(started_at, ended_at)`
  - Tag info via direct `tag_id` field (not live-joined)
- Resolved in `resolveInstance()` before component rendering
- Cards display progress, timer state, tags from resolved data

### Immediate Writes
- All tag/checklist operations write directly to DB, no Save button gate
- Components call `refresh()` (RefreshContext) to bump card totals after mutations
- Same pattern as native checklist apps

### Single-Active Timer Constraint
- Unique index: `CREATE UNIQUE INDEX one_active_timer ON time_entries ((true)) WHERE ended_at IS NULL`
- Forces at most one NULL ended_at row (every matching row indexes to same constant)
- Postgres RPC `start_timer()` ensures atomicity

### Drag & Drop Reordering
- Sidebar tasks: `DailySidebar.js` wraps task list in DndContext + SortableContext
- Uses single-key group pattern `{ [today]: tasks }` to work with shared lib/dragAndDrop.js
- `TaskRow.js` made draggable via @dnd-kit/sortable with `touch-action: none` and pointer-down stop on interactive controls
- Same pattern as pre-existing board drag (no new module needed)

---

## Files Created

- `lib/checklist-queries.js` — Checklist data access
- `lib/tag-queries.js` — Tag and tag assignment data access
- `lib/timer-queries.js` — Timer data access (not exported by default; used in components/context)
- `components/ChecklistSection.js` — Instance-level checklist UI
- `components/ChecklistTemplateSection.js` — Template-level checklist UI
- `components/TagAssignSection.js` — Both instance and template tag assignment UIs
- `components/TagManagerModal.js` — Tag create/list modal
- `components/TagPicker.js` — Select component for tags with inline creation
- `components/TimerContext.js` — Global timer state provider
- `components/TimerBar.js` — Persistent timer display in app shell

---

## Files Modified

### Data/Query Layer
- **lib/data.js**
  - INSTANCE_SELECT now embeds checklist_items and time_entries
  - resolveInstance() fixed tag live-join bug (was retroactively applying template defaults)
  - setInstanceStatus() calls stopTimerForInstance() when status === 'done'
  - Imports stopTimerForInstance from lib/timer-queries

- **lib/board-queries.js**
  - Same changes as lib/data.js for consistency

- **lib/recurrence.js**
  - After inserting task_instances, queries template's checklist_templates and flatmaps items onto checklist_items
  - Copies tag_id: template.default_tag_id ?? null to instances

### Components
- **pages/index.js**
  - Wrapped app in TimerProvider
  - Added TimerBar (positioned between header and sections for persistence)
  - Added TagManagerModal component with "Manage tags" button in header

- **components/EditModal.js**
  - Added ChecklistSection unconditionally
  - Added ChecklistTemplateSection for recurring tasks only
  - Replaced bundled tag state with InstanceTagSection + TemplateDefaultTagSection (immediate writes)

- **components/WeekBoardCard.js**
  - Shows tag dot + tracked-time display with live ticking
  - Removed timer start button (moved to sidebar)

- **components/CalendarChip.js**
  - Same as WeekBoardCard (tag dot, tracked-time display, no timer button)

- **components/TaskRow.js**
  - Added timer play (▶) button
  - Made draggable via @dnd-kit/sortable with touch-action: none
  - Propagation stops on interactive controls (checkbox, button)

- **components/DailySidebar.js**
  - Wrapped task list in DndContext + SortableContext
  - Single-key group pattern: { [today]: tasks }

---

## Bugs Fixed During Implementation

1. **Tag retroactivity bug** (pre-existing, discovered during implementation)
   - resolveInstance() was live-joining template.defaultTagRow instead of using frozen tag_id
   - Impact: Template tag changes appeared retroactively on instances
   - Fix: Changed to `row.tagRow ?? null` (no live-join)

2. **Timer uniqueness constraint bug** (pre-existing, discovered during timer implementation)
   - Original index on nullable (ended_at) WHERE ended_at IS NULL allowed multiple NULLs
   - Impact: Two concurrent start_timer() calls could both succeed
   - Fix: Replaced with `CREATE UNIQUE INDEX one_active_timer ON time_entries ((true)) WHERE ended_at IS NULL`

3. **Timer data staleness** (discovered during sidebar reorder work)
   - Stopping/starting timer only bumped TimerContext version, not RefreshContext
   - Impact: Card totals silently went stale
   - Fix: TimerContext now also refetches on RefreshContext version changes

---

## Known Limitations

- Browser automation (e.g., dnd-kit drag gesture end-to-end verification) doesn't work in sandbox environment
- Sidebar and board drag logic verified at function level, confirmed working in pre-existing board drag
- Tag manager has minimal UI (create/list only; no rename/delete/merge yet) per CLAUDE.md

---

## Current State

✅ All three features implemented and tested  
✅ Database constraints in place (timer uniqueness)  
✅ RefreshContext synchronization working  
✅ All code committed to main branch  
✅ Pushed to origin/main  

**Next action:** Full end-to-end testing by user.
