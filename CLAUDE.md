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

## Anti-goals (v2 revision — superseded further by v3, see Decisions log)
Drag-and-drop was explicitly reversed for v2 (see Decisions log) — full
@dnd-kit drag-and-drop now exists on both Board and Calendar. The "no tag
management UI" line below was also explicitly reversed in v3 (`TagManagerModal.js`)
— tags are no longer a free-text field either, see the V3 Schema section.
Everything else from v1 still holds:
- No multi-user support, sharing, or team features
- No notifications/reminders/emails
- No mobile app
- No external calendar sync (Google Calendar import/export)
- No auth system (single user, see Auth section below)
- ~~No tag *management* UI~~ — reversed 2026-07-14, see Decisions log.

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

## V3 Schema

```sql
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text
);

alter table task_templates add column default_tag_id uuid references tags(id);
alter table task_instances add column tag_id uuid references tags(id);

create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  text text not null,
  position integer not null
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references task_instances(id) on delete cascade,
  text text not null,
  is_done boolean not null default false,
  position integer not null
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references task_instances(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index one_active_timer on time_entries ((true)) where ended_at is null;

create or replace function start_timer(p_instance_id uuid)
returns time_entries
language plpgsql
as $$
declare
  new_row time_entries;
begin
  update time_entries set ended_at = now() where ended_at is null;
  insert into time_entries (instance_id, started_at)
    values (p_instance_id, now())
    returning * into new_row;
  return new_row;
end;
$$;
```

Note on that index: superseded 2026-07-14 (see Decisions log) — the original
`create unique index one_active_timer on time_entries (ended_at) where ended_at
is null` did NOT work as a real constraint (partial unique indexes on a
nullable column allow multiple NULLs unless NULLS NOT DISTINCT is declared).
Fixed by indexing a constant expression `(true)` instead of the nullable
column itself, still scoped to the same `where ended_at is null` predicate —
every qualifying row indexes to the same non-null value, so a second one is a
genuine, DB-enforced uniqueness violation. `start_timer()` is the atomic
stop-then-insert operation the app calls via `supabase.rpc()`; see
`lib/timer-queries.js`.

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
- Tags are single-select per task, stored directly on task_instances.tag_id (not
  multi-tag). Reason: analytics needs every tracked minute attributable to exactly
  one category with no split/duplicate ambiguity.
- Tag default lives on task_templates.default_tag_id, copied to tag_id on each
  generated instance, same inheritance pattern as title/description.
- Checklists are template-defined (checklist_templates, keyed to task_templates)
  and copied fresh onto checklist_items (keyed to task_instances) at generation
  time. Editing a template's checklist later does NOT retroactively touch
  already-generated instances, they're detached the moment they're copied, same
  disposable-until-touched logic as the recurrence regenerator.
- Checklist completion is independent of task status. Completing all checklist
  items does not auto-mark the task done.
- Timer is a single global state, not per-task. At most one time_entries row
  with ended_at IS NULL at any time. Starting a new timer auto-stops whatever
  is currently running.
- Anti-goal (explicit): no time-blocked/hour-grid daily schedule view. Retrofit
  of time tracking data into a "when do I usually work on X" heatmap is an
  acceptable future analytics feature; an editable drag-to-block calendar is not
  in scope and should not be proposed as a solution to future feature requests
  without this being revisited.
- [2026-07-14] Migrated tags from the v2 free-text `tag` column to the V3
  `tags` table (`tag_id`/`default_tag_id`, single-select via `<select>` in
  `TagPicker.js`). The legacy `tag` text columns on `task_templates` and
  `task_instances` still physically exist but are no longer read or written
  by the app. Backfilled real user data (one tag, "Red Roof", carried over
  onto its two existing instances) via a one-time SQL backfill migration.
  Verified end-to-end: create-new-tag-inline flow inserts into `tags`,
  selects it, and persists `tag_id` on save.
- [2026-07-14] Built checklists (checklist_templates/checklist_items):
  `lib/recurrence.js`'s `generateInstances` now copies a template's
  checklist onto ONLY the brand-new instance rows it inserts in a given
  call (never onto rows that already existed) — verified live by adding
  template items after a series' 90-day window was already fully
  materialized: all 13 pre-existing occurrences stayed at 0 items, and only
  a freshly-regenerated occurrence (an old row deleted, then regenerated
  via an "All occurrences" save) picked up the 3 items, unchecked. Also
  verified two sibling occurrences' checklist_items are fully independent
  (checking one off does not affect another), and a one-off task can have
  checklist_items added directly with no template involved. Card-face
  "X/Y" progress does not touch task status (`status`/`completed_at`
  untouched by any checklist write), per the existing decision that
  checklist completion is independent of task status.
- [2026-07-14] Corrected tag inheritance to match the checklist pattern
  (superseding the "copied to tag_id on each generated instance" line above,
  which described the intent but wasn't actually implemented that way until
  now — the code had been doing a LIVE join instead). `tag_id` is now copied
  from the template's `default_tag_id` onto a new instance ONLY at
  generation time (`lib/recurrence.js`), same disposable-until-touched shape
  as `checklist_templates` -> `checklist_items`. `resolveInstance()` in
  `lib/data.js`/`lib/board-queries.js` no longer live-joins an instance's
  tag from its template — an instance's own `tagRow` is always authoritative
  (title/description inheritance is unchanged and still live-joined; only
  tag changed). Verified live: setting a template's default tag doesn't
  retroactively affect its 13 already-generated instances; changing one
  instance's tag_id doesn't affect the template default or any sibling
  instance; a one-off task can be tagged directly with `template_id` null.
- [2026-07-14] Reversed the v2 "no tag *management* UI" anti-goal: added
  `TagManagerModal.js` (a basic list + create-with-name/color form, reachable
  via a "Manage tags" header link). Reason: explicit ask, to seed the
  initial tag set (Admin, Career, Personal seeded this session, alongside
  the pre-existing "Red Roof") — still no rename/delete/merge, kept minimal.
- [2026-07-14] Fixed the `one_active_timer` index (see V3 Schema note above)
  and built the timer feature on top of it. Reason for the index fix: the
  original design was flagged at schema-creation time as not actually
  enforcing "only one active timer" — this session made the timer real, so
  the flaw had to be fixed first, not just documented. `start_timer(uuid)` is
  a Postgres function doing stop-then-insert as one atomic statement, called
  via `supabase.rpc()` from `lib/timer-queries.js`'s `startTimer()` — not two
  separate client calls the UI could interleave. Stress-tested with 20
  truly concurrent `start_timer` calls (a Node script hitting the DB
  directly, bypassing the UI's own serialization): some calls failed with a
  unique-violation error (expected — race losers), but the DB never held
  more than one row with `ended_at IS NULL` at any point, confirmed by
  querying immediately after all 20 settled.
- Timer UI is split deliberately: the persistent indicator (`TimerBar.js`,
  showing running task + live elapsed counter + Stop) lives in the app shell
  (`pages/index.js`, above the Board/Calendar tab switch) so it survives
  navigating between views — this is the one thing in the app that must be
  visible outside any single view. Start buttons live on the card face
  (`WeekBoardCard.js`, `CalendarChip.js`); Stop only lives on the bar, not
  per-card, since there's only ever one thing to stop.
- [2026-07-14] Added a per-instance total-tracked-time display on the card
  face (`WeekBoardCard.js`/`CalendarChip.js`), summing that instance's
  completed `time_entries` rows plus live elapsed time if it's the currently
  active timer. Caught and fixed a gap while verifying: stopping/starting a
  timer only bumped `TimerContext`'s version (for the bar and the ⏱/▶ icon),
  not `RefreshContext`'s (for the board/calendar's own instance fetch, which
  is what the summed total is read from) — so the total silently went stale
  until the next unrelated refresh. Fixed by having `TimerBar`'s stop and the
  cards' start also call `RefreshContext`'s `refresh()`, not just
  `refreshTimer()`. Verified: two separate start/stop sessions (17s + 27s)
  summed to the correct combined total (44s) on the card face, confirmed
  against a direct `sum(ended_at - started_at)` query.

## Current state
Update this section at the end of every working session — what works, what's
stubbed, what's a known gap. This is the handoff to the next session.

### v3 timer (2026-07-14) — COMPLETE
The one feature that must be visible outside any single view — touches the
app shell/layout, not just card components.
- Migration `fix_one_active_timer_constraint_and_add_start_timer_rpc`:
  replaced the broken `one_active_timer` index with one on a constant
  expression `((true))` (real DB-enforced single-active-row constraint now);
  added the `start_timer(uuid)` Postgres function (atomic stop-then-insert).
- New `lib/timer-queries.js`: `getActiveTimer()` (joined to the instance's
  resolved title — live-joined like title/description elsewhere, not frozen
  like tags), `startTimer(instanceId)` (calls the `start_timer` RPC),
  `stopTimer()` (idempotent `UPDATE ... WHERE ended_at IS NULL`, no-op if
  nothing active).
- New `components/TimerContext.js`: single polled source of truth for the
  active timer, provided in `pages/index.js` above both views, consumed by
  `TimerBar.js` and by the card components' start buttons so they always
  agree on what's running.
- New `components/TimerBar.js`: renders nothing when idle; otherwise the
  running task's title, a live elapsed counter (ticks locally off
  `started_at`, no polling needed for the tick), and Stop. Mounted in
  `pages/index.js` between the header and the Board/Calendar `section` —
  outside `WeekBoardView`/`CalendarView`, so it survives tab switches.
- `WeekBoardCard.js`/`CalendarChip.js`: a start button (▶, becomes a
  disabled ⏱ if that card's instance is the one currently running), plus a
  total-tracked-time display (sum of completed `time_entries` for that
  instance + live elapsed if it's the active timer) — see the follow-up
  Decisions log entry for the `RefreshContext` staleness bug this caught.
  `lib/timer-queries.js`'s `formatDuration()` is the one shared H:MM:SS
  formatter used by both the bar and the card total, extracted out of
  `TimerBar.js` rather than duplicated.
- Verified live: started a timer on Task A, navigated Board → Calendar, the
  bar kept counting and showing Task A the whole time; started Task B
  without stopping A first — A's `time_entries` row got `ended_at` set
  automatically, only B ended up active (confirmed via direct DB query,
  no confirmation prompt shown, per the ask). Stress test: 20 concurrent
  `start_timer` RPC calls via a standalone script — some failed with unique-
  violation errors as expected, but the DB never held two active rows at
  once at any point.

### v3 tags rework (2026-07-14) — COMPLETE
Independent of the checklist work — touches only templates/instances and
card UI. Fixes tag inheritance to actually match the disposable-until-touched
pattern the Decisions log already claimed (it wasn't; see that entry).
- New `lib/tag-queries.js`: `getTags`, `createTag(name, color)`,
  `setInstanceTag(instanceId, tagId)` (fully instance-scoped, never touches
  the template or siblings), `setTemplateDefaultTag(templateId, tagId)`
  (only affects instances generated after the call). `fetchTags`/`createTag`
  removed from `lib/data.js` — this is now the one place tag reads/writes
  live.
- `lib/recurrence.js` `generateInstances`: new instance rows now get
  `tag_id: template.default_tag_id` set directly at insert (no live join
  afterward, unlike title/description).
- `lib/data.js`/`lib/board-queries.js` `resolveInstance()`: tag resolution
  simplified to just the instance's own `tagRow` — no more
  `inherits ? template.defaultTagRow : tagRow` branching for tags
  specifically (title/description keep their existing live-join logic).
- New `components/TagAssignSection.js`: `InstanceTagSection` (every card,
  writes immediately via `setInstanceTag`, not gated behind Save) and
  `TemplateDefaultTagSection` (recurring cards only, writes immediately via
  `setTemplateDefaultTag`) — both wrap `TagPicker.js` (which now takes an
  optional `label` prop and reads from `lib/tag-queries.js`). Replaces the
  old single Save-gated `tagId` field in `EditModal.js`; `updateOneOff`/
  `overrideInstance`/`updateTemplateAll`/`splitTemplate` no longer accept a
  `tagId` field — tag writes go through tag-queries.js exclusively now.
- New `components/TagManagerModal.js`, reachable via a "Manage tags" link in
  the app header (`pages/index.js`) — lists all tags, creates new ones
  (name + optional `#hex` color). Seeded Admin/Career/Personal this session.
- `WeekBoardCard.js` gained a tag dot on the card face (previously only
  `CalendarChip.js` had one).
- Verified live: template default set → all new instances inherit it;
  changing one instance's tag_id leaves the template default and every
  sibling instance untouched; a one-off task (`template_id` null) tags
  directly with no template involved.

### v3 checklists (2026-07-14) — COMPLETE
Fully independent feature from tags/timer — no shared code touched beyond
embedding `checklist_items(id, is_done)` into the existing `INSTANCE_SELECT`
in `lib/data.js`/`lib/board-queries.js` for the card-face progress count.
- New `lib/checklist-queries.js`: `getChecklistTemplate`/`getChecklistItems`
  (reads), `addChecklistTemplateItem`/`removeChecklistTemplateItem` (mutate
  checklist_templates), `addChecklistItem`/`removeChecklistItem`/
  `toggleChecklistItem` (mutate checklist_items), and
  `swapChecklistItemPositions` (plain up/down reorder — lib/dragAndDrop.js
  is built around task_instances columns/days, not a generic ordered list,
  so reusing it here wasn't trivial per the ask).
- `lib/recurrence.js` `generateInstances`: insert now `.select('id')`s the
  newly-created rows, then copies that template's checklist_templates onto
  checklist_items for those new instance ids only — never onto rows that
  already existed (disposable-until-touched, same guard as title/description
  inheritance, verified live — see Decisions log).
- New `components/ChecklistSection.js` (instance-level, in every card's
  `EditModal` — one-off and recurring alike, add/toggle/delete/reorder,
  writes immediately, not gated behind Save) and
  `components/ChecklistTemplateSection.js` (template-level, shown only when
  `isRecurring` — defines what future occurrences will get).
- `WeekBoardCard.js` and `CalendarChip.js`: card-face "X/Y" badge, shown
  only when `checklist_total > 0`.
- Checklist completion never writes to `status`/`completed_at` — verified:
  checking off an item leaves the task checkbox untouched.

### v3 tags migration (2026-07-14) — COMPLETE
Migrated tags off the v2 free-text column onto the real `tags` table
(`tag_id` on `task_instances`, `default_tag_id` on `task_templates`,
single-select). Changes:
- `lib/data.js` / `lib/board-queries.js`: `INSTANCE_SELECT` now embeds
  `tagRow:tags(...)` and `template.defaultTagRow:tags(...)` (aliased away
  from `tag` to avoid colliding with the legacy physical column selected via
  `*`); `resolveInstance()` resolves the effective tag object the same way
  it resolves inherited title/description. `fetchDistinctTags()` removed;
  replaced by `fetchTags()`/`createTag()` against the real table.
- New `components/TagPicker.js`: `<select>` of existing tags + inline
  "+ New tag…" creation (text input, Add/Cancel). No color picker UI yet.
- `RecurringCreateModal.js`, `EditModal.js`: free-text tag input replaced
  with `TagPicker`; state is `tagId` not `tag` string.
- `CalendarChip.js`, `TagFilterDropdown.js`, `CalendarView.js`: updated to
  work with tag objects/ids instead of raw strings.
- Real user data preserved: existing "Red Roof" free-text tag backfilled
  into the `tags` table and re-linked to its two instances.
- Verified via `npm run build` (clean) and live browser test of the full
  create-tag-inline-then-save flow, confirmed by direct DB query.
- Legacy `tag` text columns still exist on both tables but are dead —
  candidate for a future `drop column` cleanup once nothing depends on them.
- Next up (not started): checklists (`checklist_templates`/`checklist_items`)
  and the timer (`time_entries`) — see V3 Schema and Decisions log above.

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
