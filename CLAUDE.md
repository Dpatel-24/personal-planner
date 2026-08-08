# Project: Personal Planner

## Done means (v3, current)
A single-user task app deployed on Vercel. Create one-off or recurring tasks
(weekly/biweekly/monthly/custom RRULE). Work across three views (Kanban-style
weekly board, month calendar, daily sidebar) all reading the same underlying
data. Drag and drop on both board and calendar. Recurring task edits (including
drags) prompt this-occurrence/this-and-future/all. Incomplete tasks roll into
today automatically via a computed query, not a data mutation. Checklists,
single-select tags, and manual time tracking are live. Analytics is the only
deferred piece (V4).

## Anti-goals (current)
- No multi-user support, sharing, or team features
- No notifications/reminders/emails
- No native mobile app. The web layout IS responsive down to phone width
  (`lib/useIsMobile.js`, consumed by `WeekBoardView`/`CalendarView`/
  `DailySidebar`) — that's a breakpoint-driven layout change, not a
  separate app, and doesn't reverse this anti-goal.
- No external calendar sync (Google Calendar import/export)
- No auth system (single user, deployed but not indexed/shared)
- No time-blocked/hour-grid daily schedule view (considered and explicitly
  rejected in V3 ideation, see Decisions log). A future "when do I usually
  work on X" heatmap built from time_entries is fine; an editable drag-to-block
  calendar is not in scope and should not be proposed again without revisiting
  this decision directly.
- No multi-tag per task (single tag per instance, locked for analytics clarity)

## Stack
- Next.js 14, Pages Router, Vercel hosting
- Supabase (Postgres), `@supabase/supabase-js`
- `rrule.js` for all recurrence logic, RFC 5545. Never hand-roll recurrence date math.
  `lib/rrulePresets.js` builds/describes RRULE strings from friendly presets
  (daily/weekly/biweekly/monthly) so the create/edit UI never hand-types RFC
  5545 — `rrule.js` still does all the actual date expansion.
- `@dnd-kit/core` + `@dnd-kit/sortable` for all drag-and-drop, board and calendar both.
- Styling: inline JS style objects. No Tailwind, no CSS modules, no external UI
  libraries. Two-layer token system: `lib/tokens.js` (primitives) composing into
  `lib/components.js` (semantic). No raw style values inside components.
- Shadow only on overlay/interactive elements (modals, dropdowns, hover states).
  Static containers use `border.default`, never shadow.

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
  tag_id uuid references tags(id)  -- added V3
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

**One data model, three views.** `task_instances` is the single source of truth.
Board groups by `scheduled_date` (current week) plus a null-date Inbox column.
Calendar groups by month grid. Sidebar filters to today. No view owns its own
data or duplicates another view's query logic.

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
default onto each newly created instance at generation time. Once copied, the
instance is independently editable and template edits made afterward do not
retroactively touch already-generated instances, they are disposable-until-touched,
same logic as the regenerator. This applies to:
- `default_tag_id` (template) → `tag_id` (instance)
- `checklist_templates` (template) → `checklist_items` (instance), copied fresh
- title/description (template) → instance fields, standard override behavior

**Checklist completion is independent of task status.** Completing every
checklist item does not auto-mark the task done.

**Timer is global, not per-task.** At most one `time_entries` row with
`ended_at IS NULL` at any time. Starting a new timer auto-stops whatever is
currently running, no confirmation prompt. The active timer must be visible
via a persistent layout-level element regardless of which view (board/calendar/
sidebar) is currently open, not just on the card that started it.

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
  Template edits do not retroactively touch already-generated instances.
- Timer is single global state with auto-stop-on-new-start. Reason: a timer is
  a property of the user's current focus, not a per-task independent clock.
- Time-blocked/hour-grid daily schedule view considered and rejected for V3.
  Reason: it solves prospective capacity planning, a different problem than
  the stated goal of retrospective time-usage understanding, which the timer
  already answers directly. Revisit only if the actual goal changes.

## Current state (v3 complete)
Board, calendar, sidebar, drag-and-drop (board and calendar, recurring-aware),
checklists, tags, and manual time tracking with persistent global indicator are
all built and verified. Analytics (V4) not started, no schema work pending for
it, it reads existing tag_id and time_entries data only.

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
