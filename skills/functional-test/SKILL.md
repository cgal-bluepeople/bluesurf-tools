---
name: functional-test
description: Run functional acceptance checks after implementation — Playwright subagent for UI, smoke matrix for CLI/API — and write results under the Surf ticket validation folder. Use when bluesurf-ticket requires post-implement verification, when the user asks for functional or acceptance testing on a Surf ticket, or after implement and code-review on pulled ticket work.
---

Blue Surf acceptance layer after Matt Pocock **implement** (which already ran **tdd**, **code-review**, and **commit**). Hard gate for **bluesurf-ticket** complete.

Do not edit Matt Pocock skills; this skill only adds Surf verification.

## Prerequisites

Settled before you start:

1. **Spec** — pulled ticket `detail.md` plus the confirmed plan from the chat, including a **Functional checks** section.
2. **Implement done** — **implement** finished for this ticket (including its commit). **code-review** had no blocking/high findings (nits may remain).
3. **Dev server** — the human already runs the app. Read the implementation repo **AGENTS.md** (or **CONTEXT.md**) for base URL, health endpoint, and auth. Fail fast if health check fails; tell the human to start dev per AGENTS.md.
4. **Ticket key** — e.g. `PRY-XXX` (project code + number) for vault paths.

## Process

### 1. Choose the runner path

| Signal | Path |
| --- | --- |
| Functional checks or ticket imply browser/UI | **Playwright against the running app** (below) |
| Otherwise | **Smoke matrix** (below) |

Always run one path; non-UI work still gets a smoke matrix pass.

### 2. Smoke matrix (non-UI or before UI when both apply)

In the implementation workspace (current cwd):

1. If `package.json` defines `test:smoke`, run it.
2. Else if the plan names a CLI entry, run `--help` or the documented smoke command.
3. Else if AGENTS.md names a health URL, `curl -sf` it (or equivalent).
4. Else run the repo’s full test script (`npm test` / documented equivalent).

Done when the chosen command exits 0. On failure, go to **Failure loop**.

### 3. Playwright against the running app

This is the ticket test. Do not run `pnpm test:e2e`. That suite mocks the API.

1. Translate every **Functional checks** bullet into executable lines and write them to `RLand/Tickets/{code}/validation/checks.md` before the command:

   ```markdown
   ## Functional checks
   - open /agreements
   - see "Agreements"
   - url /agreements
   ```

   `open` loads a path on the running app. `see` requires that text. `url` requires the address to contain the fragment. Any other bullet fails the run.
2. From bluesurf-tools: `npm run verify -- --json --playwright --ticket {code}`. Stdout is one JSON object. `playwright.canRun` must be true. If the app URL is down, say so and stop. Do not start Docker unless the human asks.
3. Run `npm run verify -- --yes --playwright --ticket {code}`.
4. Exit 0 and `validation/report.md` with `Result: pass` means the ticket checks passed. Screenshots are next to the report. On fail, read the report and go to **Failure loop**.

### 4. Validation folder (vault)

The command writes `RLand/Tickets/{code}/validation/report.md` and the screenshots. Do not rewrite that report by hand.

Give the human a **brief summary in chat**. Done when `validation/report.md` exists and its result is `pass`.

## Failure loop

On fail:

1. Summarize failures (chat + update `validation/report.md`).
2. Call **implement** with **tdd** to fix, then **code-review** again (must reach no blockers). **implement** commits when it finishes.
3. Re-run this skill from step 1.

Stop after **3** full implement → functional cycles. Then stop and ask the human how to proceed.

## Out of scope

- Replacing unit/integration tests (**tdd** still owns those).
- Git commit ( **implement** owns commit unless follow-up fixes need a new commit before push).
- Pushing or running **ticket-done** (human says ticket complete / commit and push for that).
