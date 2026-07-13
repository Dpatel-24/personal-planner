# Project: Personal Planner (working name, rename if desired)

## Done means
A single-user task app deployed on Vercel where I can create one-off or recurring
tasks (weekly/biweekly/monthly/custom), see them correctly across three views
(Trello-style board, calendar, daily sidebar list), mark/skip/reschedule any single
occurrence, and get prompted "this occurrence / this and future / all" when editing
a recurring task.

## Anti-goals (v1) — do not build these unless explicitly asked
- No multi-user support, sharing, or team features
- No notifications/reminders/emails
- No mobile app
- No drag-and-drop between views (click-to-move/reschedule only)
- No external calendar sync (Google Calendar import/export)
- No auth system (single user, see Auth section below)

## Stack
- Next.js 14, Pages Router — Vercel hosting
- Supabase (Postgres) — database, accessed via `@supabase/supabase-js`
- `rrule.js` — recurrence rule engine (RFC 5545 standard). Do not hand-roll
  weekly/biweekly/monthly date math — DST and month-end edge cases will break it.
- Styling: inline JS style objects, no Tailwind, no CSS modules, no external UI
  libraries. Two-layer token system: `lib/tokens.js` (primitives: spacing, radius,
  border, elevation) composing into `lib/components.js` (semantic: `card`, `panel`,
  `input`, `buttonPrimary`). No raw style values inside components — if a value
  isn't in the token file, that's a conversation about extending tokens, not a
  one-off inline style.
- Rule: shadow only on overlay/interactive elements (modals, dropdowns, hover
  states). Static containers get `border.default`, never shadow.

## Auth
None. Single user, deployed but not indexed/shared. Supabase RLS can stay
permissive on all tables. Supabase service key must still stay server-side only
(never exposed to the client), regardless of the lack of auth.

## Schema (locked — do not alter without logging a decision below)

```sql
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  recurrence_rule text not null, -- RRULE string, e.g. FREQ=WEEKLY;INTERVAL=2;BYDAY=MO
  start_date date not null,
  end_date date,                 -- nullable; set when a series is split or ended
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null, -- null = one-off task
  scheduled_date date not null,
  status text not null default 'todo' check (status in ('todo','done','skipped')),
  is_override boolean not null default false, -- true = detached from template, regenerator must skip it
  title text,        -- only populated when is_override = true, otherwise inherit from template
  description text,  -- same
  position integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
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
`task_instances` is the single source of truth. Board = group by status. Calendar
= group by `scheduled_date`. Sidebar = filter `scheduled_date = today`. No view
owns its own data — if you find yourself writing view-specific fetch logic that
duplicates another view's query, stop, that's a sign the shared layer is wrong.

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

## Current state
Update this section at the end of every working session — what works, what's
stubbed, what's a known gap. This is the handoff to the next session.

### 2026-07-12 — Scaffold complete (Step 1 of build plan)
**Works:**
- Repo live at github.com/Dpatel-24/personal-planner, connected to Vercel.
- Next.js 16.2.10 Pages Router (JS, no Tailwind/ESLint/src, `@/*` alias). Note:
  used `create-next-app@latest` (Next 16), not the "14" originally in Stack.
- Deps installed: `@supabase/supabase-js` ^2.110.2, `rrule` ^2.8.1.
- Supabase project `personal-planner` (ref `cohmqwgjgrqfbqpocopn`, us-east-2).
  Locked schema migration applied — `task_templates` + `task_instances` with
  indexes, FK, status check. Verified empty with correct columns.
- `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (gitignored; anon/public key only — no service_role anywhere in the tree).
- `npm run dev` boots clean (HTTP 200 on /).

### 2026-07-12 — Step 2 COMPLETE (all three views + recurrence + edit semantics)
**Works — full lib layer:**
- `lib/tokens.js` + `lib/components.js` (clean/minimal, light-only v1).
- `lib/recurrence.js` — `expandOccurrences` + `reconcile` (guard-rule honored) +
  `generateInstances(template, windowDays=90)`. 8/8 logic tests pass.
- `lib/supabaseClient.js` — shared anon client.
- `lib/data.js` — single data-access layer: fetch(ForDate), createOneOffTask,
  setInstanceStatus, deleteInstance, createRecurringTask, and the edit semantics
  updateOneOff / overrideInstance / updateTemplateAll / splitTemplate. All
  verified live with cleanup.
- `lib/dates.js` (todayStr, humanDate, addDays) + `lib/rrulePresets.js`
  (buildRRule/describeRRule for daily/weekly/biweekly/monthly).

**Works — full UI (all verified end-to-end in a browser):**
- App shell `pages/index.js`: tabs (Board/Calendar) + persistent daily sidebar,
  wrapped in `RefreshContext` so any mutation refreshes all views live.
- Daily sidebar: quick one-off add, complete/skip/undo, "New recurring task"
  button, and click-a-title to open the edit modal.
- Board (`BoardView`/`BoardCard`): group by status, 28-day window, click-to-move.
- Calendar (`CalendarView`): month grid, prev/today/next, click-to-toggle done.
- `RecurringCreateModal`: preset recurrence + weekday picker + live RRULE preview.
- `EditModal`: one-off (edit fields/date + delete); recurring three-way scope
  (this occurrence = override, this+future = split, all = update template).

**Known gaps / next:**
- Editing the recurrence RULE (frequency/days) from the EditModal isn't wired yet
  — only title/description/scope. The data layer already supports it
  (updateTemplateAll/splitTemplate accept `recurrenceRule`).
- Edit modal opens from the SIDEBAR only (per chosen scope). Board/Calendar cards
  quick-toggle status but don't open edit yet.
- No delete/end for a whole recurring series (only per-occurrence skip/override).
- RLS disabled on both tables (intentional per Auth section; anon key = full DB
  access — revisit before any sharing).
- Vercel needs the two `NEXT_PUBLIC_SUPABASE_*` env vars set in project settings
  (`.env.local` is gitignored, so they are NOT deployed from the repo).
- Stray `AGENTS.md` from create-next-app is committed; remove if unwanted.

## Execution discipline
- One atomic change per step. If a step description has "and" in it, split it.
- Every step ends in a verification (a command, a query, a page load) before
  moving to the next step.
- Never batch multiple edits to the same large file in one pass.
- If something is ambiguous or a verification fails: STOP and report. Do not
  improvise a fix and continue silently.
