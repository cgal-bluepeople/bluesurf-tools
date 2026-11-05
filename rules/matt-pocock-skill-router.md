---
title: Matt Pocock skill router
---

Classify every coding request and follow the matching skill without waiting for a slash command. Read ~/.agents/skills/<name>/SKILL.md (same files also live under ~/.claude/skills/) and follow it. If I name or attach a skill, that wins.

Routing:

- /bluesurf-ticket, pull a Surf ticket, or PRY-XXX into Obsidian → bluesurf-ticket
- Mark a pulled Surf ticket done → bluesurf-ticket (complete branch). The implementation repo AGENTS.md **Ticket done** section is the gate list; commit and push is ordinary git unless that section lists it.
- /bluesurf-sprint, sprint note, or current sprint from Surf → bluesurf-sprint
- /bluesurf-sprint-review, sprint review, review last sprint, or how did last sprint go → bluesurf-sprint-review
- /bluesurf-mine, my tickets, or what's assigned to me in Surf → bluesurf-mine
- /bluesurf-daily-report, capture or log hours, daily report, or report time on Surf → bluesurf-daily-report
- New/fuzzy feature or idea in a repo → grill-with-docs
- Idea with no working repo → grill-me
- Too big or foggy for one session → wayfinder (decisions only; then to-spec)
- Inbox of bugs/requests I did not write → triage, then implement
- Something broken, flaky, throwing, or slow → diagnosing-bugs
- "just do this", "don't grill", or a one-file obvious fix → implement and use tdd
- Review this branch/PR/diff → code-review
- Functional or acceptance testing after implementation, or Surf ticket post-review → functional-test
- In-progress merge/rebase conflict → resolving-merge-conflicts
- Human-only setup (secrets, CI, dashboards) → wizard
- "that didn't land" / wait-what → wait-what
- Need facts from primary sources → research
- Need a throwaway answer to a design question → prototype (handoff out and back if it needs its own directory)

Main flow after grilling: if a question needs a runnable answer, prototype (with handoff). If multi-session, to-spec then to-tickets, then implement each ticket in a fresh chat. If single-session, implement here. implement drives tdd, then code-review, then commit only if I asked. Never push unless I explicitly asked to push.

Matt Pocock skills are immutable — do not edit them. On a pulled Surf ticket, bluesurf-ticket orchestrates after implement: in the **same turn**, chain functional-test (harness runner question, then run) before complete. Do not stop after code-review waiting for a new prompt.

Keep grill → spec → tickets in one chat. For bluesurf-ticket: one chat per ticket through functional-test; do not open a new chat between implement and functional-test.

Underneath: use domain-modeling when terminology, CONTEXT.md, or ADRs come up; use codebase-design when shaping a module, seam, or testable interface.

Do not run setup-matt-pocock-skills unless I name a repo and ask. If a skill needs a tracker and the repo has no docs/agents/issue-tracker.md, say so and default to local markdown under .scratch/ rather than inventing GitHub issues.
