---
name: bluesurf-ticket
description: Pulls one Blue Surf (Surf) work item such as PRY-XXX into the Obsidian vault (detail note plus attachments), then stops and asks grill vs implement. Use when the user wants a specific ticket brought down or worked on, in any wording: "surf PRY-XXX", "pull PRY-XXX", "grab ticket from Surf", "let's work on PRY-XXX", or /bluesurf-ticket. When the pulled note is tagged Bugs Detected, the comments are regressions to fix: follow diagnosing-bugs and implement, and do not recommend grill. Orchestrates Surf-only steps after Matt Pocock implement — same conversation, same turn handoff to functional-test (harness runner question) before complete. The complete branch marks a pulled ticket done only when that implementation repo's AGENTS.md Ticket done gates are all true. Commit and push is ordinary git unless that section lists it as a gate.
---

Repo: `~/Projects/bluesurf-tools`. Session is `.surf-cookies.json` there, loaded into headless Chromium.

**Matt Pocock skills are immutable.** Do not edit `implement`, `tdd`, `code-review`, or other skills from [mattpocock/skills](https://github.com/mattpocock/skills). Surf-specific sequencing lives in this skill and **functional-test**.

**Expired session:** if a command fails with "session expired", sign in again yourself; don't just tell the user to. Run `npm run login` from the repo (allow up to 6 minutes). It opens a Chromium window and exits by itself once the user is signed in; no Enter needed. Tell the user to finish SSO in that window. When it prints `Signed in`, retry the original command once. If login exits non-zero (window closed or timed out), stop and tell the user.

## Pull

1. Take the ticket key from the user (`PRY-XXX` — project code plus work item number).
2. From the repo: `npm run ticket -- PRY-XXX`.
3. Done when `Proyect/Tickets/PRY-XXX/detail.md` exists.

Then **stop**. Read the note's tags.

- If the tags include `Bugs Detected`, the `## Comments` section is the regression work. Follow `diagnosing-bugs`, then the **Work ticket** section below. Do not ask grill vs implement.
- Otherwise ask grill vs implement with the harness question tool (`AskQuestion` in Cursor, `AskUserQuestion` in Claude Code; recommended: grill). Do not start coding.

## Work ticket (grill or Bugs Detected)

When implementing a pulled ticket in the **implementation repo** (keep dev running; document URL and auth in that repo's **AGENTS.md**):

1. **Plan** — confirmed plan (from grill or regression scope) must include a **Functional checks** section (concrete pass/fail bullets for **functional-test**).
2. **implement** — run the **implement** skill to completion (it drives **tdd**, **code-review**, and **commit**). For this Surf ticket, the commit subject ends with `({code})`, e.g. `(PRY-123)`.
3. **functional-test** — **same conversation, do not wait for a new user message.** As soon as step 2 finishes with code-review clear of blockers, read and follow **functional-test** immediately. Do not end your turn with only an implement/code-review summary. The developer chooses the UI runner via the **harness question tool** inside **functional-test** (not a plain-chat “which do you prefer?”). Hard gate; artifacts in `Proyect/Tickets/{code}/validation/` (`report.md`, `manual-reproduction.md`, screenshots). On fail, follow **functional-test** failure loop (max 3 cycles), then repeat from step 2 as needed.
4. **Complete** — after step 3 passes, follow **Complete**. Run ticket-done only when **AGENTS.md** **Ticket done** says every gate is true.

Do not delete the vault folder until **functional-test** has passed and every **Ticket done** gate is true.

**One chat for this ticket:** pull → grill → implement → functional-test → complete. Do not start a new chat after code-review; the harness runner question is part of this session.

## Complete

Ticket-done deletes the vault folder. It runs only for a ticket pulled with this skill earlier in this conversation, and only when the implementation repo **AGENTS.md** **Ticket done** section says every gate is already true. Commit and push follow **Agent git rules** in that file. They mark the ticket done only when **Ticket done** lists them as a gate.

When functional-test has just passed, the human asks to mark the ticket done, or the human says to commit and push:

1. Take the ticket key (the one just pulled, or the one they name).
2. If they said commit and push: commit any uncommitted fixes with `({code})` on the subject, then push the implementation repo branch. That phrase is push permission for this ticket. It does not by itself run ticket-done.
3. If **functional-test** has not passed, run it before ticket-done. A push they already asked for in step 2 stays a push.
4. Read **Ticket done** in the implementation repo **AGENTS.md**. If the file, the section, or any cell is still `FILL`, stop and ask the human to fill it from `bluesurf-tools/templates/AGENTS.md.template`. Leave the vault folder in place.
5. When functional-test has passed and every gate in that section is true, from bluesurf-tools: `npm run ticket-done -- PRY-XXX`.
6. Done when `Proyect/Tickets/PRY-XXX/` is gone (including `validation/`). If a gate is still false, name that gate and leave the vault folder in place.
