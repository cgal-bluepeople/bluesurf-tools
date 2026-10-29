---
name: bluesurf-ticket
description: Pulls one Blue Surf (Surf) work item such as PRY-XXX into the Obsidian vault (detail note plus attachments), then stops and asks grill vs implement. Use when the user wants a specific ticket brought down or worked on, in any wording: "surf PRY-XXX", "pull PRY-XXX", "grab ticket from Surf", "let's work on PRY-XXX", or /bluesurf-ticket. When the pulled note is tagged Bugs Detected, the comments are regressions to fix: follow diagnosing-bugs and implement, and do not recommend grill. Orchestrates Surf-only steps after Matt Pocock implement (functional-test before complete). The complete branch ("the ticket is complete", "commit and push") applies only to a ticket pulled with this skill earlier in the same conversation; otherwise "commit and push" is ordinary git work, not this skill.
---

Repo: `~/Projects/bluesurf-tools`. Session is `.surf-cookies.json` there, loaded into headless Chromium.

**Matt Pocock skills are immutable.** Do not edit `implement`, `tdd`, `code-review`, or other skills from [mattpocock/skills](https://github.com/mattpocock/skills). Surf-specific sequencing lives in this skill and **functional-test**.

**Expired session:** if a command fails with "session expired", sign in again yourself; don't just tell the user to. Run `npm run login` from the repo (allow up to 6 minutes). It opens a Chromium window and exits by itself once the user is signed in; no Enter needed. Tell the user to finish SSO in that window. When it prints `Signed in`, retry the original command once. If login exits non-zero (window closed or timed out), stop and tell the user.

## Pull

1. Take the ticket key from the user (`PRY-XXX` — project code plus work item number).
2. Name this conversation `(PRY-XXX) - short description` as soon as the key is known. Several tickets go in one parenthesis: `(PRY-XXX, PRY-YYY) - short description`. Do not invent a ticket. Update the parenthesis if another ticket joins the same chat.
3. From the repo: `npm run ticket -- PRY-XXX`.
4. Done when `RLand/Tickets/PRY-XXX/detail.md` exists.

Then **stop**. Read the note's tags.

- If the tags include `Bugs Detected`, the `## Comments` section is the regression work. Follow `diagnosing-bugs`, then the **Work ticket** section below. Do not ask grill vs implement.
- Otherwise ask grill vs implement with the harness question tool (`AskQuestion` in Cursor, `AskUserQuestion` in Claude Code; recommended: grill). Do not start coding.

## Work ticket (grill or Bugs Detected)

When implementing a pulled ticket in the **implementation repo** (keep dev running; document URL and auth in that repo's **AGENTS.md**):

1. **Plan** — confirmed plan (from grill or regression scope) must include a **Functional checks** section (concrete pass/fail bullets for **functional-test**).
2. **implement** — run the **implement** skill to completion (it drives **tdd**, **code-review**, and **commit**). For this Surf ticket, the commit subject ends with `({code})`, e.g. `(PRY-123)`.
3. **functional-test** — hard gate; artifacts in `RLand/Tickets/{code}/validation/` (`report.md` + screenshots). On fail, follow **functional-test** failure loop (max 3 cycles), then repeat from step 2 as needed.
4. **Complete** — only after step 3 passes: human says ticket complete or commit and push (see below).

Do not run **bluesurf-ticket** complete or delete the vault folder until **functional-test** has passed.

## Complete

When the user says the ticket is complete, or says to commit and push:

1. Take the ticket key (the one just pulled, or the one they name).
2. If **functional-test** has not passed for this ticket, run **functional-test** first; do not complete until it passes.
3. If they said commit and push: push the implementation repo branch (**implement** should already have committed). That phrase is push permission for this ticket. If there are uncommitted fixes after functional-test, commit with `({code})` on the subject, then push.
4. From bluesurf-tools: `npm run ticket-done -- PRY-XXX`.
5. Done when `RLand/Tickets/PRY-XXX/` is gone (including `validation/`). If they asked to push, the branch is also on the remote.
