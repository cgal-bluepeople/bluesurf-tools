---
name: bluesurf-sprint-review
description: Writes or rewrites the previous-sprint review note (pending and done tables of the user's assigned Surf tickets on Sprint N−1) in the Obsidian vault under RLand/Sprints/Sprint N.md. Use when the user wants a past sprint captured or reviewed, in any wording: "/bluesurf-sprint-review", "sprint review", "review last sprint", "previous sprint snapshot", or "how did last sprint go" (run the export, then summarize from the note). Optional sprint number when they name a specific sprint (e.g. sprint review for 13). Not the current sprint — that is bluesurf-sprint.
---

Repo: `~/Projects/bluesurf-tools`. Session is `.surf-cookies.json` there, loaded into headless Chromium.

**Expired session:** if a command fails with "session expired", sign in again yourself; don't just tell the user to. Run `npm run login` from the repo (allow up to 6 minutes). It opens a Chromium window and exits by itself once the user is signed in; no Enter needed. Tell the user to finish SSO in that window. When it prints `Signed in`, retry the original command once. If login exits non-zero (window closed or timed out), stop and tell the user.

1. If they name a sprint number (e.g. "sprint review for 13"), from the repo: `npm run sprint-review -- RLD 13` (project code defaults to `RLD`; omit `RLD` when `BLUESURF_PROJECT` is set).
2. Otherwise: `npm run sprint-review` (uses highest sprint on your assigned cards minus 1).
3. Done when `RLand/Sprints/Sprint N.md` exists with H1 `# Sprint N Review` (past sprint), **Pending Tickets** and **Done Tickets** tables (ticket, title, estimate, effort, type, status, priority, tags), or the command prints that there are no assigned tickets on that sprint (no file in that case). If you override to the **current** sprint number, the H1 is `# Sprint N` without Review.

Tickets are those assigned to you whose **current** Surf sprint name matches that sprint number (moved tickets won't appear under the old sprint).

For "how did last sprint go", after the note exists (or after a no-ticket message), read the file and answer from the tables. Stop there unless they ask to pull tickets.

Pull a single ticket only if they ask (`bluesurf-sprint` is for the **current** sprint only).
