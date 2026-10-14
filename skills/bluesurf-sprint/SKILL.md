---
name: bluesurf-sprint
description: Writes or rewrites the current-sprint note (pending and done tables of the user's assigned Surf tickets) in the Obsidian vault under RLand/Sprints/Sprint N.md. Use when the user wants their sprint captured, written, or refreshed in the vault, in any wording: "surf my sprint", "sprint note", "snapshot the sprint", "update my sprint in Obsidian", or /bluesurf-sprint. To just list or ask about tickets without writing a note, use bluesurf-mine instead. For the previous sprint, use bluesurf-sprint-review.
---

Repo: `~/Projects/bluesurf-tools`. Session is `.surf-cookies.json` there, loaded into headless Chromium.

**Expired session:** if a command fails with "session expired", sign in again yourself; don't just tell the user to. Run `npm run login` from the repo (allow up to 6 minutes). It opens a Chromium window and exits by itself once the user is signed in; no Enter needed. Tell the user to finish SSO in that window. When it prints `Signed in`, retry the original command once. If login exits non-zero (window closed or timed out), stop and tell the user.

1. From the repo: `npm run sprint`.
2. Done when `RLand/Sprints/Sprint N.md` exists with H1 `# Sprint N` (current sprint only — no Review suffix), **Pending Tickets** and **Done Tickets** tables (ticket, title, estimate, effort, type, status, priority, tags). If that sprint was already captured, the same file is rewritten.

Stop after the note is written. Pull a single ticket only if they ask.
