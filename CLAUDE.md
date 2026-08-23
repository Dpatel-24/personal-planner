# Project: Personal Planner

## Done means (v5, current)
A single-user task app deployed on Vercel. Create one-off or recurring tasks
(weekly/biweekly/monthly/custom RRULE). Four views over the same underlying
data: Kanban-style weekly board, month calendar, daily sidebar, and the
Schedule Rail (a fixed-hour vertical time-grid for today, V5's addition —
see its own section below). Drag and drop on board, calendar, and the rail.
Recurring task edits (including drags) prompt this-occurrence/this-and-
future/all; "All occurrences" retroactively pushes the edited occurrence's
tag and checklist onto the whole series, not just future ones (see Decisions
log). Incomplete tasks roll into today automatically via a computed query,
not a data mutation. Checklists, single-select tags, and manual time
tracking are live. Analytics (originally planned as V4) was never started
and remains deferred — no schema blockers, reads only existing tag_id/
time_entries data whenever it happens.

Two other features exist in this app (`goals`, `life_formula_entries`
tables; `/goals` and `/life-formula` pages) that this file has never
documented and is not the source of truth for — don't assume their absence
here means they're unbuilt.

## Schedule Rail (V5)
`components/ScheduleRail.js` — a fixed-hour vertical grid (6 AM to midnight,
`RAIL_START_HOUR`/`RAIL_END_HOUR`) showing today's tasks positioned by
`scheduled_start` (a real timestamptz, not derived) and
`estimated_duration_minutes`. Always "today" — no date navigation, unlike
board/calendar.

- **Drag-move**: grabbable zone spans checkbox → tag dot → title →
  tracked-time → up to (not including) the duration stepper. Checkbox itself
  stays click-only, deliberately not draggable — overriding a native
  checkbox's tap-to-toggle for drag support was judged not worth the risk
  for a control that already worked. A separate resize handle (bottom 6px
  strip) changes duration by dragging;
  the two hit areas are physically distinct so gestures never collide. Live
  preview during drag (including cascaded siblings) comes from
  `lib/scheduling.js`'s pure `cascadeLater()`/`detectOverlap()`; the actual
  write is a separate, optimistic-local-state-first commit on drop (see
  `onMoveCommit` in ScheduleRail.js) — mirrors `lib/dragAndDrop.js`'s own
  update-then-persist-then-refresh pattern so there's no revert-then-jump
  flash.
- **Cascade rule**: dropping a block onto an occupied slot pushes whatever
  it overlaps to start exactly where it ends, chaining through further
  overlaps — displaced tasks only ever move LATER, never earlier, regardless
  of drag direction. Never before 8 AM (see the RAIL_START_HOUR mismatch
  flagged below), never past midnight (`CascadeEndOfDayError`, thrown not
  silently truncated/wrapped).
- **Current-time line**: thin accent-colored line at `now`, ticking every
  60s, hidden (not clamped) outside the rendered grid.
- **Invariant every write path must maintain**: `scheduled_start`'s own
  local calendar day must always match `scheduled_date`. Any function that
  changes `scheduled_date` (`moveInstance`, `updateOneOff`,
  `overrideInstance` in `lib/data.js`) also nulls `scheduled_start` in the
  same write, so the rail's auto-stack (`assignTodaySchedule`) re-places it
  fresh on its new day. `assignTodaySchedule` itself also treats a
  wrong-day `scheduled_start` as unscheduled (not just a null one) — this
  covers plain overnight rollover too, not just drags. Breaking either half
  of this reproduces the "only one task shows, rest invisible" bug fixed
  2026-08 (see Decisions log) — a block with a `scheduled_start` on the
  wrong day renders at a wildly wrong (often negative) pixel offset, not an
  obvious error.

**Known open item, not yet resolved:** `ScheduleRail.js`'s own
`RAIL_START_HOUR` (grid start, 6 AM) and `lib/scheduling.js`'s
`RAIL_START_HOUR` (auto-stack cursor origin AND the drag floor clamp, 8 AM)
are two separate constants that don't match. Net effect: the grid visually
shows 6–8 AM but nothing can ever actually land there — auto-placed tasks
start stacking at 8 AM, and `cascadeLater`'s own floor clamp prevents a drag
from landing before 8 AM either. Not touched because it wasn't reported as a
problem and the fix depends on actual intent (align the floor to 6 AM, or
keep 8 AM as the real floor and shrink the grid's visible start to match) —
ask before changing either constant.

## Anti-goals (current)
- No multi-user support, sharing, or team features
- No notifications/reminders/emails
- No native mobile app. The web layout IS responsive down to phone width
  (`lib/useIsMobile.js`, consumed by `WeekBoardView`/`CalendarView`/
  `DailySidebar`; the Schedule Rail was also verified at 375px width —
  drag, tap-to-edit, and the grid all work unchanged) — that's a
  breakpoint-driven layout change, not a separate app, and doesn't reverse
  this anti-goal.
- No external calendar sync (Google Calendar import/export)
- No auth system (single user, deployed but not indexed/shared)
- No multi-tag per task (single tag per instance, locked for analytics clarity)

A time-blocked/hour-grid daily schedule view was rejected in V3 ideation,
then built anyway in V5 as the Schedule Rail above — see Decisions log for
why the original rejection reasoning stopped applying. Not an anti-goal
anymore; listed in the decisions log instead so the reversal itself isn't
lost.

## Stack
- Next.js 14, Pages Router, Vercel hosting
- Supabase (Postgres), `@supabase/supabase-js`
- `rrule.js` for all recurrence logic, RFC 5545. Never hand-roll recurrence date math.
  `lib/rrulePresets.js` builds/describes RRULE strings from friendly presets
  (daily/weekly/biweekly/monthly) so the create/edit UI never hand-types RFC
  5545 — `rrule.js` still does all the actual date expansion.
- `@dnd-kit/core` + `@dnd-kit/sortable` for board/calendar drag-and-drop. The
  Schedule Rail's own drag (whole-block move, resize) is hand-rolled on the
  Pointer Events API directly, not dnd-kit — a single absolutely-positioned
  block dragging within one column of hour-pixels didn't need a library.
- Styling: inline JS style objects. No Tailwind, no CSS modules, no external UI
  libraries. Two-layer token system: `lib/tokens.js` (primitives) composing into
  `lib/components.js` (semantic). No raw style values inside components.
- Shadow only on overlay/interactive elements (modals, dropdowns, hover states).
  Static containers use `border.default`, never shadow.
- `Modal.js` centers itself with `transform: translate(-50%,-50%)`. Never
  nest one modal inside another's JSX children — a `transform`d ancestor
  becomes the containing block for a `position: fixed` descendant per the
  CSS spec, breaking the inner modal's centering against the real viewport.
  Render nested modals as siblings (a fragment) instead — see
  `TagManagerModal.js` for the fixed shape.

## Auth
None. Single user. Supabase RLS permissive on all tables. Service key stays
server-side only regardless.

## Schema (current, full)

```sql
-- V1 core
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  recurrence_rule text not null,
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  default_tag_id uuid references tags(id)  -- added V3
);

create table task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null,
  scheduled_date date,  -- nullable as of V2, null = Inbox/unscheduled
  status text not null default 'todo' check (status in ('todo','done','skipped')),
  is_override boolean not null default false,
  title text,
  description text,
  position integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  tag_id uuid references tags(id),  -- added V3
  scheduled_start timestamptz,  -- added V5, nullable — null = not yet placed on the rail
  estimated_duration_minutes integer not null default 15  -- added V5
);

create index on task_instances (scheduled_date);
create index on task_instances (template_id);

-- V3 additions
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text
);

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
-- Indexes a constant expression, not the nullable ended_at column directly —
-- a partial unique index on ended_at itself would NOT work, since Postgres
-- treats every NULL as distinct for uniqueness purposes. Indexing (true)
-- means every open row collides on the same value, so a second one is a
-- real, DB-enforced violation. Enforcement lives here, not in application code.

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
-- startTimer() (lib/timer-queries.js) calls this via supabase.rpc(), never
-- two separate client round trips — stop-then-insert is one atomic statement,
-- so the UI can't interleave them into two active rows.
```

Both `task_templates` and `task_instances` also still physically carry a
legacy free-text `tag` column from the pre-V3 design. Dead: not read or
written anywhere in the app (superseded by `tags`/`tag_id`/`default_tag_id`
above). A `drop column` cleanup is a fine future step, just not done yet —
don't reuse or repurpose these columns without dropping them first.

## Core architectural rules (do not deviate without logging why)

**One data model, four views.** `task_instances` is the single source of
truth. Board groups by `scheduled_date` (current week) plus a null-date
Inbox column. Calendar groups by month grid. Sidebar filters to today. The
Schedule Rail also filters to today, positioned by `scheduled_start`
instead of grouped by date. No view owns its own data or duplicates
another view's query logic.

**Rollover is a computed query, not a mutation.** Today's column/query is
`scheduled_date = today` (any status) UNION `scheduled_date < today AND status
= 'todo'`, tagged `is_overdue: true` in the mapping layer. Nothing in the
database moves until the user acts on the card directly. This avoids destroying
the historical scheduled_date and avoids collision with a recurring series' own
next natural occurrence.

**Recurrence regeneration rule.** `generateInstances(template, windowDays=90)`
in `lib/recurrence.js` never touches any `task_instances` row where
`is_override = true` OR `status != 'todo'`. Everything else is disposable and
safely recreated from the template's RRULE on any edit.

**Recurring edit/drag semantics**, all routed through one modal
(`EditModal.js`, scope choice `single`/`future`/`all`), triggered identically
whether the edit originates from a click or a drag-and-drop:
- *This occurrence only* (`overrideInstance`): `is_override = true` on that
  row, edit directly, template untouched.
- *This and future* (`splitTemplate`): old template's `end_date` set to the
  day before this occurrence; a new template row created starting from this
  occurrence, carrying over the old rule/fields unless overridden; future
  generation re-points to it.
- *All* (`updateTemplateAll`): existing template updated directly, all
  non-override, non-completed future instances regenerated.

All three live in `lib/data.js`. There is no rule-shifting helper — a new or
edited template's `recurrence_rule` combined with its own `start_date` is
enough for `rrule.js` to expand correctly; the RRULE's own `dtstart` handles
the rest.

**Inheritance pattern, used identically for tag, checklist, and title/description.**
A template holds the default/source of truth. `generateInstances` copies that
default onto each newly created instance at generation time — a brand-new
occurrence always starts from the template's CURRENT state. This applies to:
- `default_tag_id` (template) → `tag_id` (instance)
- `checklist_templates` (template) → `checklist_items` (instance), copied fresh
- title/description (template) → instance fields, standard override behavior

Once copied, an instance is independently editable (`overrideInstance`,
`InstanceTagSection`, `ChecklistSection` all write directly to that one row).
What happens to *already-generated* sibling instances when the template
itself changes depends on how the edit is scoped, not on disposable-until-
touched by default (revised 2026-08, see decisions log):
- title/description are LIVE-joined at read time for any non-override
  instance (`lib/data.js`'s `resolveInstance`) — a template edit shows up
  everywhere immediately, no explicit push needed.
- tag and checklist are NOT live-joined (an instance's `tag_id`/
  `checklist_items` are real rows, not a view) — but choosing "All
  occurrences" in `EditModal` explicitly and retroactively pushes the edited
  occurrence's CURRENT tag_id and checklist onto the template's own defaults
  AND every eligible sibling instance, full replace (`updateTemplateAll`).
  "Eligible" = the same guard `generateInstances`' `reconcile()` already
  uses: `is_override = false AND status = 'todo'`. Choosing "This occurrence
  only" (`overrideInstance`, sets `is_override = true`) is the one thing
  that stays permanently exempt from that push, in either direction.

**Deleting a recurring task deletes its occurrences.** `deleteTaskTemplate`
(`lib/tag-queries.js`) explicitly deletes every `task_instance` for that
template BEFORE deleting the template row — does not rely on the schema's
own `on delete set null`, which would only detach them (title/description
are live-joined from the template, so a detached instance would render as
"(untitled)" the moment the template's gone). Checklist items/time entries
cascade off the instances on their own FKs.

**Checklist completion is independent of task status.** Completing every
checklist item does not auto-mark the task done.

**Timer is global, not per-task.** At most one `time_entries` row with
`ended_at IS NULL` at any time. Starting a new timer auto-stops whatever is
currently running, no confirmation prompt. The active timer must be visible
via a persistent layout-level element regardless of which view (board/calendar/
sidebar/rail) is currently open, not just on the card that started it.

## Decisions log (append only)
- Pre-materialized instances over on-the-fly RRULE computation. Reason:
  per-occurrence state (done/skip/override) needs a real row to attach to.
- rrule.js over hand-rolled recurrence math. Reason: DST and month-end edge
  cases are a known failure class for custom date logic.
- scheduled_date made nullable on task_instances. Reason: Inbox tasks have no
  date until dragged onto a day.
- Rollover implemented as a computed view, not a mutation or cron job. Reason:
  mutating scheduled_date would corrupt recurring instance history and could
  collide with that series' next natural occurrence.
- Dragging a recurring instance routes through the same modal as any other
  edit. Reason: one edit pathway, not two.
- Tags are single-select per task, stored on task_instances.tag_id. Reason:
  analytics needs every tracked minute attributable to exactly one category,
  multi-tag makes time attribution ambiguous.
- Checklists are template-defined, copied fresh onto each generated instance.
- (2026-08) "Apply to all occurrences" now retroactively pushes the edited
  occurrence's current tag and checklist onto the template's defaults and
  every eligible (non-override, `status='todo'`) sibling instance, full
  replace. Reason: the original copied-once-at-generation-time behavior for
  tag/checklist was silently non-retroactive — setting a recurring task's
  tag or checklist never appeared on any already-materialized occurrence,
  which for a ~90-day generation window is effectively everything visible.
  That read as a bug from the outside, twice, independently. Removed the
  old template-level pickers that only wrote the forward-only version of
  this (`TemplateDefaultTagSection`, `ChecklistTemplateSection`) —
  tag/checklist for a whole series are now only ever set by editing one
  real occurrence and choosing "All occurrences."
- Timer is single global state with auto-stop-on-new-start. Reason: a timer is
  a property of the user's current focus, not a per-task independent clock.
- (2026-08, V5) Time-blocked/hour-grid daily schedule view — rejected in V3,
  built anyway as the Schedule Rail. The V3 rejection reasoning ("solves
  prospective capacity planning, a different problem than retrospective
  time-usage understanding, which the timer already answers") held until it
  didn't: the actual want turned out to be a literal visual daily schedule,
  not a time-usage report, and the timer never addressed that. Cascade-push
  on drop (never earlier, only later, never before floor/past midnight) and
  auto-stack-from-unscheduled were both designed and shipped rather than a
  bare drag-anywhere grid, to keep the rail always internally consistent
  (no manual gap-filling, no possible overlaps).
- (2026-08) scheduled_start must be nulled whenever scheduled_date changes
  (moveInstance/updateOneOff/overrideInstance), and assignTodaySchedule
  treats a wrong-day scheduled_start as unscheduled, not just a null one.
  Reason: a task dragged to a new day (or just rolling over overnight, no
  drag needed) kept its OLD rail time, which the rail rendered at a
  wildly-wrong pixel offset relative to the NEW day's 6 AM origin —
  reported as "only one task shows up on the rail, the rest don't." 18
  existing rows were affected by ordinary rollover alone, not drags.
- Deleting a recurring task deletes its occurrences, not just the template.
  Reason: the schema's own on-delete=set-null behavior silently produced
  "(untitled)" orphans (title is live-joined from the template, never
  actually stored on the instance row) — reported as a bug after deleting a
  real recurring task and finding its old occurrences still on the board,
  blank.

## Current state (v5 complete)
Board, calendar, sidebar, and the Schedule Rail — all four views, full
drag-and-drop (board/calendar via dnd-kit, rail hand-rolled on Pointer
Events), checklists, tags, manual time tracking with a persistent global
indicator, and recurring-task edit/delete semantics (single/future/all,
including the all-occurrences retroactive tag/checklist push) are built and
verified, desktop and down to 375px mobile width alike. Analytics (V4) never
started, no schema work pending for it, it reads existing tag_id and
time_entries data only whenever it happens.

Tagged cards get a background tint at 12% opacity of the tag's color
(`lib/tag-styles.js`'s `getTagCardStyle()`, converts the tag's hex to rgba;
falls back to the `color.accent` token if the tag has no custom color).
Shared by `WeekBoardCard.js` and `CalendarChip.js` so both views render tags
identically. Settled on 12% after live testing found 40% too heavy against
the card's own text and status color.

## Execution discipline
- One atomic change per step, split anything with "and" in its description.
- Every step ends in a verification before moving to the next.
- Never batch multiple edits to the same large file in one pass.
- If ambiguous or a verification fails: stop and report, do not improvise
  silently and continue.
