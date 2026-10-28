---
name: functional-test
description: Run functional acceptance checks after implementation — Playwright subagent for UI, smoke matrix for CLI/API — and write results under the Surf ticket validation folder. Use when a Surf ticket implementation passed code-review, when the user asks for functional or acceptance testing, or when bluesurf-ticket / the router chains this step after code-review.
---

Functional layer after **tdd** and **code-review**. Hard gate for Surf tickets: do not run **bluesurf-ticket** complete (or treat the ticket as done) until this skill passes.

## Prerequisites

Settled before you start:

1. **Spec** — pulled ticket `detail.md` plus the confirmed plan from the chat, including a **Functional checks** section (required before implement on ticket work).
2. **Code review** — **code-review** finished with no blocking/high findings on Standards or Spec (nits may remain).
3. **Dev server** — the human already runs the app. Read the implementation repo **AGENTS.md** (or **CONTEXT.md**) for base URL, health endpoint, and auth. Fail fast if health check fails; tell the human to start dev per AGENTS.md.
4. **Ticket key** — e.g. `PRY-XXX` (project code + number) for vault paths and commit subject.

## Process

### 1. Choose the runner path

| Signal | Path |
| --- | --- |
| Functional checks or ticket imply browser/UI | **Playwright subagent** (below) |
| Otherwise | **Smoke matrix** (below) |

Always run one path; non-UI work still gets a smoke matrix pass.

### 2. Smoke matrix (non-UI or before UI when both apply)

In the implementation workspace (current cwd):

1. If `package.json` defines `test:smoke`, run it.
2. Else if the plan names a CLI entry, run `--help` or the documented smoke command.
3. Else if AGENTS.md names a health URL, `curl -sf` it (or equivalent).
4. Else run the repo’s full test script (`npm test` / documented equivalent).

Done when the chosen command exits 0. On failure, go to **Failure loop**.

### 3. Playwright subagent

Spawn a **Task** subagent (generalPurpose or equivalent) with a single job:

- Work in the **implementation repo** cwd.
- Do **not** start or stop the dev server; use the base URL from AGENTS.md.
- Reuse **storageState** or env test credentials when AGENTS.md documents them; otherwise call **wizard** once to capture auth, then reuse storageState for reruns in the same ticket.
- If the repo has no Playwright dependency, use **`npx playwright`** with an ephemeral script (do not add `@playwright/test` to the repo unless the human asks).
- Execute every bullet under **Functional checks** from the confirmed plan against the running app.
- On failure: save trace/screenshot; on pass: screenshot key states.
- Return a short structured result: pass/fail, commands run, paths to artifacts.

Parent agent: wait for the subagent, then write artifacts (step 4).

### 4. Validation folder (vault)

Under the BluePeople vault (see **bluesurf-ticket** / `OBSIDIAN_VAULT`):

`RLand/Tickets/{code}/validation/`

Write:

- `report.md` — what ran, pass/fail, links to screenshots, subagent notes (redact secrets).
- Screenshots (and trace zip on failure) alongside the report.

Give the human a **brief summary in chat**. Done when `validation/report.md` exists and reflects the latest run.

### 5. Pass → commit (Surf ticket)

When all required checks pass for ticket `{code}`:

Commit the implementation repo with `{code}` in parentheses at the end of the subject (`… (PRY-XXX)`), same convention as **bluesurf-ticket** complete. Do not push unless the human explicitly asked to push.

Done when the commit exists on the current branch.

## Failure loop

On fail:

1. Summarize failures (chat + update `validation/report.md`).
2. Call **implement** with **tdd** to fix, then **code-review** again (must reach no blockers).
3. Re-run this skill from step 1.

Stop after **3** full implement → review → functional cycles. Then stop and ask the human how to proceed.

## Out of scope

- Replacing unit/integration tests (**tdd** still owns those).
- Pushing or running **ticket-done** (human says ticket complete / commit and push for that).
