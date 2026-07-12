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

## Current state
Not started. Update this section at the end of every working session — what
works, what's stubbed, what's a known gap. This is the handoff to the next session.

## Execution discipline
- One atomic change per step. If a step description has "and" in it, split it.
- Every step ends in a verification (a command, a query, a page load) before
  moving to the next step.
- Never batch multiple edits to the same large file in one pass.
- If something is ambiguous or a verification fails: STOP and report. Do not
  improvise a fix and continue silently.
