# Global agent rules

Copies of the Cursor user rules in this directory, in the order Codex should load them. Install as `~/.codex/AGENTS.md`.

## No push until I say so

Never push code to a remote until the developer explicitly asks to push.

This includes `git push`, force-push, pushing tags, `git push --set-upstream`, and any command that publishes local commits (including `gh pr create` or similar flows that would push first).

Commits are allowed when asked. Opening a PR is allowed only if the branch is already on the remote, or the developer also explicitly asked to push.

Do not treat "create a PR", "share this", "I'm done", "ship it", or similar as permission to push.

## Ask questions via the harness

When you need a decision from the developer, ask through the harness question UI — never as a list of questions left in the chat transcript.

In Cursor, use the AskQuestion tool; in Claude Code, use AskUserQuestion. Put the whole current frontier in one call (multiple questions allowed). Lead each question with your recommended option, and include Other so they can type a custom answer. Do not also paste the same questions as markdown in your message (no Q1/Q2 blocks, no "which do you prefer?" lists).

This overrides grilling's in-chat question format. Keep grilling's rounds and recommended answers; only the delivery changes: harness form, then wait.

Do not ask the user for facts you can look up. If the harness question tool is unavailable on this platform, say so in one sentence and then ask in chat.

## Matt Pocock skill router

Classify every coding request and follow the matching skill without waiting for a slash command. Read `~/.agents/skills/<name>/SKILL.md` (same files also live under `~/.claude/skills/`) and follow it. If I name or attach a skill, that wins.

Routing:

- `/bluesurf-ticket`, pull a Surf ticket, or `PRY-XXX` (project key + number) into Obsidian → `bluesurf-ticket`
- "ticket is complete" or "commit and push" on a pulled Surf ticket → `bluesurf-ticket` (complete branch)
- `/bluesurf-sprint`, sprint note, or current sprint from Surf → `bluesurf-sprint`
- `/bluesurf-sprint-review`, sprint review, review last sprint, or how did last sprint go → `bluesurf-sprint-review`
- `/bluesurf-mine`, my tickets, or what's assigned to me in Surf → `bluesurf-mine`
- New/fuzzy feature or idea in a repo → `grill-with-docs`
- Idea with no working repo → `grill-me`
- Too big or foggy for one session → `wayfinder` (decisions only; then `to-spec`)
- Inbox of bugs/requests I did not write → `triage`, then `implement`
- Something broken, flaky, throwing, or slow → `diagnosing-bugs`
- "just do this", "don't grill", or a one-file obvious fix → `implement` and use `tdd`
- Review this branch/PR/diff → `code-review`
- Functional or acceptance testing after implementation, or Surf ticket post-review → `functional-test`
- In-progress merge/rebase conflict → `resolving-merge-conflicts`
- Human-only setup (secrets, CI, dashboards) → `wizard`
- "that didn't land" / wait-what → `wait-what`
- Need facts from primary sources → `research`
- Need a throwaway answer to a design question → `prototype` (handoff out and back if it needs its own directory)

Main flow after grilling: if a question needs a runnable answer, `prototype` (with `handoff`). If multi-session, `to-spec` then `to-tickets`, then `implement` each ticket in a fresh chat. If single-session, `implement` here. `implement` drives `tdd`, then `code-review`, then commit only if I asked. Never push unless I explicitly asked to push.

Matt Pocock skills are immutable — do not edit them. On a pulled Surf ticket, `bluesurf-ticket` orchestrates after `implement`: `functional-test` (hard gate) before complete.

Keep grill → spec → tickets in one chat. Start a fresh chat per `implement` ticket.

Underneath: use `domain-modeling` when terminology, `CONTEXT.md`, or ADRs come up; use `codebase-design` when shaping a module, seam, or testable interface.

Do not run `setup-matt-pocock-skills` unless I name a repo and ask. If a skill needs a tracker and the repo has no `docs/agents/issue-tracker.md`, say so and default to local markdown under `.scratch/` rather than inventing GitHub issues.
