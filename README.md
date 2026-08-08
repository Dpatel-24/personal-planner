# Personal Planner

A self-hosted task planner that combines the parts of Trello, Blitzit, and
Sunsama I actually wanted, without paying for three subscriptions or living
with the one missing feature that made each of them fall short on its own.

## Why this exists

Trello has the best card and board mechanics of the three, but no concept of
recurring tasks and no daily planning view.

Sunsama has the daily planning ritual right, real dates on a weekly board,
a backlog to pull from, unfinished work rolling into today, but it's a paid
SaaS product and heavier than I needed.

Blitzit has a genuinely satisfying checklist and quick-capture flow, and its
users had been asking for scheduling and time-tracking improvements for over
a year without them shipping.

So I built the combination I wanted: Trello's card and drag mechanics,
Sunsama's weekly board and rollover behavior, Blitzit's checklist feel, plus
tagging and time tracking underneath so I can see where my time actually
goes instead of guessing.

## What it does

- **Weekly board.** Seven day columns with real dates, plus an Inbox for
  anything not yet scheduled. Drag cards between days, drag within a day to
  reorder.
- **Recurring tasks.** Weekly, biweekly, monthly, or custom recurrence rules.
  Edit or drag one occurrence, this week and every week after, or the whole
  series, your choice, every time.
- **Automatic rollover.** Anything left unfinished shows up in today's column
  automatically. Nothing is silently rewritten, the original schedule stays
  intact.
- **Calendar view.** Month-level overview, same data as the board, drag to
  reschedule from here too.
- **Checklists.** Per-card subtask lists. Recurring tasks carry a template
  checklist that resets fresh on every new occurrence.
- **Tags.** Single tag per task (Admin, Personal, Career, whatever categories
  make sense to you) so time and task data can actually be grouped later.
- **Time tracking.** Start/stop a timer on any task, visible everywhere in
  the app while it's running. One timer at a time, on purpose.

## What it doesn't do

No multi-user support, no notifications, no mobile app, no calendar sync with
Google or anyone else. This was built for one person's workflow, mine, not
as a general-purpose product. Analytics on top of the tag and time-tracking
data is planned but not built.

## Stack

Next.js 14 (Pages Router), Supabase (Postgres), deployed on Vercel.
Recurrence handled via `rrule.js` (RFC 5545) rather than custom date logic.
Drag-and-drop via `@dnd-kit`. No CSS framework, hand-built design tokens.

## Status

Actively used daily. Built iteratively in phases, each one shipped and used
before the next started, rather than planned end-to-end up front.
