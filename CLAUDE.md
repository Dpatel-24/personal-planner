# Project: Personal Planner (working name, rename if desired)

## Done means
A single-user task app deployed on Vercel where I can create one-off or recurring
tasks (weekly/biweekly/monthly/custom), see them correctly across three views
(Trello-style board, calendar, daily sidebar list), mark/skip/reschedule any single
occurrence, and get prompted "this occurrence / this and future / all" when editing
a recurring task.

## Anti-goals (v1) — historical record, do not edit; see v2 revision below
- No multi-user support, sharing, or team features
- No notifications/reminders/emails
- No mobile app
- No drag-and-drop between views (click-to-move/reschedule only)
- No external calendar sync (Google Calendar import/export)
- No auth system (single user, see Auth section below)

## Anti-goals (v2 revision — current)
Drag-and-drop was explicitly reversed for v2 (see Decisions log) — full
@dnd-kit drag-and-drop now exists on both Board and Calendar. Everything else
from v1 still holds:
- No multi-user support, sharing, or team features
- No notifications/reminders/emails
- No mobile app
- No external calendar sync (Google Calendar import/export)
- No auth system (single user, see Auth section below)
- No tag *management* UI (colors, multi-select, a tag list/admin screen) —
  tags are a single free-text field, set via the create/edit modals only

## Stack
- Next.js 16 (Pages Router) — Vercel hosting. Note: CLAUDE.md originally said
  "Next.js 14"; the actual build used `create-next-app@latest`, which resolved
  to 16. Never corrected in the doc until now — treat "16" as ground truth.
- Supabase (Postgres) — database, accessed via `@supabase/supabase-js`
- `rrule.js` — recurrence rule engine (RFC 5545 standard). Do not hand-roll
  weekly/biweekly/monthly date math — DST and month-end edge cases will break it.
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (v2) —
  drag-and-drop on Board and Calendar. All decision logic (eligibility guard,
  reorder/move computation, the shared onDragEnd handler) lives in
  `lib/dragAndDrop.js` — both views import it, neither duplicates it.
- Styling: inline JS style objects, no Tailwind, no CSS modules, no external UI
  libraries. Two-layer token system: `lib/tokens.js` (primitives: spacing, radius,
  border, elevation) composing into `lib/components.js` (semantic: `card`, `panel`,
  `input`, `buttonPrimary`). No raw style values inside components — if a value
  isn't in the token file, that's a conversation about extending tokens, not a
  one-off inline style. (One exception logged below: hiding a scrollbar needs a
  real CSS class in `styles/globals.css`, since `::-webkit-scrollbar` can't be
  expressed as an inline style.)
- Rule: shadow only on overlay/interactive elements (modals, dropdowns, hover
  states). Static containers get `border.default`, never shadow.

## Auth
None. Single user, deployed but not indexed/shared. Supabase RLS can stay
permissive on all tables. Supabase service key must still stay server-side only
(never exposed to the client), regardless of the lack of auth.

## Schema (current — v2. Locked otherwise: do not alter without logging a
## decision below. This block reflects the live DB, not the original v1 DDL —
## see Decisions log for every delta and why.)

```sql
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  recurrence_rule text not null, -- RRULE string, e.g. FREQ=WEEKLY;INTERVAL=2;BYDAY=MO
  start_date date not null,
  end_date date,                 -- nullable; set when a series is split or ended
  active boolean not null default true,
  created_at timestamptz not null default now(),
  tag text                       -- v2: free-text, inherited by non-override instances
);

create table task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null, -- null = one-off task
  scheduled_date date,           -- v2: nullable — null = Inbox (no date yet)
  status text not null default 'todo' check (status in ('todo','done','skipped')),
  is_override boolean not null default false, -- true = detached from template, regenerator must skip it
  title text,        -- only populated when is_override = true, otherwise inherit from template
  description text,  -- same
  position integer,  -- v2: manual sort order within a column/day; reindexed to 0..n-1 on drag
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  tag text            -- v2: free-text; overrides/one-offs carry their own, else inherit from template
);

create index on task_instances (scheduled_date);
create index on task_instances (template_id);
```

## Recurrence regeneration rule (do not deviate without logging why)
The instance generator (`lib/recurrence.js`, function `generateInstances(template, windowDays=90)`)
must NEVER touch or overwrite any `task_instances` row where `is_override = true`
OR `status != 'todo'`. Everything else is disposable and safely recreated from
the template's RRULE on any edit.

Edit semantics for recurring tasks:
- **This occurrence only** → set `is_override = true` on that row, edit fields directly.
- **This and future** → set old template's `end_date` to the day before this
  occurrence, create a NEW `task_templates` row starting from this occurrence's
  date with the new rule/fields, re-point future generation to the new template.
- **All** → edit the template directly, regenerate all non-override, non-completed
  future instances.

## One data model, three views
`task_instances` is the single source of truth. No view owns its own data — if
you find yourself writing view-specific fetch logic that duplicates another
view's query, stop, that's a sign the shared layer is wrong. Same rule now
extends to *interaction* logic, not just fetching: drag-and-drop decision
logic lives once in `lib/dragAndDrop.js`, imported by both Board and Calendar.

- **Sidebar** = filter `scheduled_date = today`.
- **Board** (v2, `WeekBoardView.js`) = group by key: a static "Inbox" column
  (`scheduled_date is null`) plus 7 scrollable day columns (Mon-Sun via
  `lib/board-queries.js`'s `getWeekDates`). No longer grouped by status (that
  was v1) — today's column additionally merges in the rollover set (earlier,
  still-`todo` instances) via `getColumnInstances(date, isToday)`.
- **Calendar** (v2, `CalendarView.js`) = group by `scheduled_date`, month grid.
  Same click-to-edit and drag-and-drop as the Board (second DndContext, same
  `lib/dragAndDrop.js`), plus a "Tagged only" filter toggle.

## Decisions log (append only, never delete)
- [date] Chose pre-materialized instances over on-the-fly RRULE computation.
  Reason: per-occurrence state (done/skip/override) needs a real row to attach to.
- [date] Chose rrule.js over hand-rolled recurrence math. Reason: DST and
  month-end edge cases are a known failure class for custom date logic.
- [2026-07-12] scheduled_date made nullable on task_instances. Reason: Inbox
  tasks have no date until dragged onto a day.
- [2026-07-12] Rollover for incomplete tasks implemented as a computed view
  (today's query includes scheduled_date < today AND status='todo'), not a
  data mutation or cron job. Reason: mutating scheduled_date would corrupt
  recurring instance history and could collide with that series' next
  natural occurrence.
- [2026-07-12] Dragging a recurring instance to a new day routes through the
  existing this/this+future/all modal, same as any other edit. Reason: one
  edit pathway, not two.
- [2026-07-12] Card model stays minimal: title + description only. No labels,
  checklists, or time estimates in this pass.
- [2026-07-13] Reversed the v1 "no drag-and-drop" anti-goal: added full
  @dnd-kit drag-and-drop on Board and Calendar. Reason: explicit ask; the
  layout/scroll work already made both views feel like real Trello/calendar
  surfaces, and static-only interaction was the biggest remaining gap against
  that feel.
- [2026-07-13] All drag decision logic (eligibility guard, reorder/move
  computation, the shared onDragEnd) was extracted into lib/dragAndDrop.js
  the same session the Calendar got drag-and-drop, rather than writing a
  second inline copy. Reason: explicit instruction — a second view
  reimplementing the same interaction is exactly the "view owns its own
  data" anti-pattern this doc already warns against, extended to logic.
- [2026-07-13] Recurring-instance drag (any view) is STILL a no-op past the
  eligibility guard — console.log only, no modal, no DB write. Superseds
  nothing; this is the same v2-07-12 decision, now also true on Calendar
  since it shares the same guard function.
- [2026-07-13] Added a free-text `tag` column to both task_templates and
  task_instances (nullable), settable from RecurringCreateModal and
  EditModal only (not the quick-add flows). Partially supersedes the
  2026-07-12 "card model stays minimal" decision — a tag is arguably a
  label. Reason: explicit ask, kept deliberately minimal (one free-text
  field, no tag-management UI, no color/multi-select) specifically so it
  wouldn't reopen that door further than necessary.

## Current state
Update this section at the end of every working session — what works, what's
stubbed, what's a known gap. This is the handoff to the next session.

### v1 archive (2026-07-12, Steps 1-2) — superseded by v2 below
Scaffold (Next.js, Supabase project + locked schema, deployed to Vercel) and
the full v1 app (recurrence engine, data layer, edit semantics, three views —
Board grouped by status, Calendar, sidebar) were built and verified. Kept here
only for history; the Board's status-column design and Calendar's read-only
click-to-toggle are both gone in v2 — see below for what replaced them.

### v2 (2026-07-13) — COMPLETE: layout, drag-and-drop, quick-add, tags
**Layout fix:**
- `pages/index.js`: the shell now fits exactly one viewport at a standard
  laptop size (1366x768 verified — `document.body.scrollHeight/Width` exactly
  match `window.innerHeight/Width`, zero page-level scroll). Root cause of the
  old bug: `main` had `flex:1` with no `minWidth:0`, so it expanded to fit the
  board's full content width and pushed the sidebar off-screen. Sidebar is a
  normal flex sibling on the right, always visible, never needs resizing.

**Board (`WeekBoardView.js`, rebuilt from scratch, `BoardView`/`BoardCard`
deleted):**
- 8 columns: a static, pinned "Inbox" (`scheduled_date is null`) + 7
  horizontally-scrollable day columns (Mon-Sun, `lib/board-queries.js`).
  Scrollbar hidden via `.scrollbar-hidden` (`styles/globals.css`) but still
  fully scrollable (drag/trackpad/buttons).
- "‹ Week ›" buttons page the day-strip by one column; separate
  Prev/This week/Next buttons jump to a different week's data entirely (two
  different granularities, not the same control).
- Today's column merges same-day instances with the rollover set (earlier,
  still-`todo`) via `getColumnInstances(date, isToday)`; rollover cards show
  a computed `is_overdue` badge (not a DB column).
- Full drag-and-drop (see below) and a Trello-style "+ Add a task" quick-add
  (`QuickAddCard.js`) under every column, inline input, stays open after add.

**Calendar (`CalendarView.js`, `CalendarDayCell.js`, `CalendarChip.js`):**
- Month grid grouped by `scheduled_date`, unchanged nav.
- Click-to-edit now matches the Board exactly: a chip's checkbox toggles
  done/todo (stops propagation); clicking the rest of the chip opens the same
  `EditModal`. Drag-and-drop too — a second `DndContext` over the identical
  shared logic the Board uses (see `lib/dragAndDrop.js`).
- "Tagged only" checkbox toggle in the header: filters what's RENDERED per
  day; the underlying `itemsByDate` state stays the full, untagged-inclusive
  set so drag-and-drop never loses hidden items while filtering. Tagged chips
  also show a small dot badge even when the filter is off.

**Drag-and-drop (`lib/dragAndDrop.js`) — the single shared module both views
import, not duplicated:**
- Scoped to one-off tasks (`template_id` null) and already-overridden
  recurring instances (`is_override` true) — those persist directly on drop
  (position within a column/day; `scheduled_date` + position across
  columns/days, null `scheduled_date` for the Board's Inbox).
- Recurring, non-override instances render as draggable in both views (per
  spec) but any drop on them is a no-op: `console.log('recurring drag: needs
  modal, wiring next step')`, no state or DB change. That modal routing is
  still not wired — same gap as before, now true in both views since they
  share the guard.
- Optimistic local update, then awaited DB write(s), then `refresh()` —
  refresh only fires after every write actually completes, so the "true"
  state always wins over a stale optimistic guess (verified: drops persist
  after a hard page reload, and errors correctly revert).

**Tags:** free-text `tag` column on both `task_templates` and
`task_instances` (nullable). Inherits the same way title/description do
(override/one-off carries its own, else inherits from the template). Settable
from `RecurringCreateModal` and `EditModal` only — not the quick-add flows.

**Known gaps / next:**
- Editing the recurrence RULE (frequency/days) from `EditModal` still isn't
  wired — only title/description/tag/scope. Data layer already supports it
  (`updateTemplateAll`/`splitTemplate` accept `recurrenceRule`).
- Recurring, non-override drag needs the this/this+future/all modal — still
  just a console.log in both views (see above).
- No delete/end for a whole recurring series (only per-occurrence skip/
  override, or per-occurrence delete for one-offs).
- No tag-management UI (autocomplete of existing tag values, colors, a tag
  list) — deliberately out of scope per the v2 tag decision.
- RLS disabled on both tables (intentional per Auth section; anon key = full
  DB access — revisit before any sharing).
- Vercel needs the two `NEXT_PUBLIC_SUPABASE_*` env vars (or the
  integration's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the client accepts
  either) set in project settings; `.env.local` is gitignored.
- Stray `AGENTS.md` from create-next-app is still committed; remove if unwanted.

## Execution discipline
- One atomic change per step. If a step description has "and" in it, split it.
- Every step ends in a verification (a command, a query, a page load) before
  moving to the next step.
- Never batch multiple edits to the same large file in one pass.
- If something is ambiguous or a verification fails: STOP and report. Do not
  improvise a fix and continue silently.
