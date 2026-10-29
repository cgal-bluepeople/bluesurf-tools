---
name: bluesurf-verify
description: Plans which RLand repos to validate and whether that validation can run. Use when the user wants Playwright against the changes, a check that the local system is up, or to know which repos or commands to run before validating, in any wording: "/bluesurf-verify", "test this in playwright", "which repos should be running", "is the stack up", "validate the flow", or "corre la prueba de los cambios". Preview first. Run only after they pick the repos.
---

Run from the bluesurf-tools checkout: the directory that contains `scripts/verify.mjs`. This file is `skills/bluesurf-verify/SKILL.md` in that repo. If the loaded file is a symlink, use its real path; do not assume `~/Projects/bluesurf-tools`. This does not use the Surf session.

`RLAND_ROOT` in `.env` is the workspace. A sibling `rland-new`, `RLand`, or `rland` with `rland-ui` or `rland-infra` is the default. Another project sets `RLAND_ROOT`, or an empty `.bluesurf-workspace` file in that directory. It does not need `rland-ui`.

Playwright here opens the running app. Use it to test a change, or to validate a ticket. `pnpm test:e2e` is a separate mocked suite. This is not the RLand code-review gate (`pnpm quality`, `gofmt`, `go vet`, `schema-check`).

## Preview

1. From the repo: `npm run verify -- --json`. Add repo names when they already named them (`npm run verify -- --json rland-ui`). Stdout is one JSON object. Parse that only. Notices (`Nothing ran`, `Saved`) go to stderr.
2. Read `run`. The command searched the workspace for a compose repo that starts sibling repos, and for each repo's own `make run`, `make dev`, or `pnpm dev`.
   - If `run.needsChoice` is true, stop and ask with the harness question tool how the repos run. One question. Recommended: `stack` via `run.discovery.runners[0]` when that runner serves the other repos (this workspace: `rland-infra`, `make local-up-detached`). The other option is `individual`, each repo's own command from `run.discovery.individual`.
   - After they answer, re-run `npm run verify -- --json --save --mode stack --runner rland-infra` (or `--mode individual`). `--save` writes `RLAND_RUN_MODE` and `RLAND_RUNNER` into `.env`. Do not ask again while those are set. Do not pass `--yes` in this turn.
3. Read `stack.ready` and each check's `canRun` / `reason`. If `reason` says Node is below 22, re-run this preview in the same shell after `source ~/.nvm/nvm.sh && nvm use 22`. Do not install Node. Use that shell for `--yes` too.
4. Ask which repos to run. One question, multi-select. Recommended: every check with `canRun: true` or `flow.canRun: true`. Include each planned repo. If the plan is empty, offer `catalog` (`rland-ui`, `rland-core`, `rland-auth`, `rland-collab`, `rland-commons`, `rland-ngam`, `rland-mcp`, plus `RLAND_CHECKS`). A name that exists under the workspace and is not in the catalog is inferred from `package.json` or the Makefile. Stop after the answer unless they pick some.
5. Tell them, in the same turn as the question, only what the JSON already decided:
   - `run.mode` `stack`: `flow.via` is the runner and `flow.services` are the probes that repo needs. One service being down does not block another repo. `rland-ngam` has no host port.
   - `run.mode` `individual`: `flow.command` is that repo's own process. The infra stack is not the gate.
   - `command` / `canRun` is the repo suite (`pnpm test:e2e` or `make test`). `pnpm test:e2e` mocks the API. It is not the change or ticket browser test.
   - `playwright` is present when they asked to test a change in the browser or to validate a ticket. `playwright.baseUrl` is the running app (`RLAND_APP_URL`, else the proxy, else rland-web). Do not start Docker or a repo process unless they ask. If `flow.canRun` or `playwright.canRun` is false, say the `reason`.

Do not pass `--yes` in the preview turn.

## Run

When they want Playwright for a change, or a ticket validation:

1. Preview with `npm run verify -- --json --playwright`. For a ticket, add `--ticket PRY-XXX`. The ticket's checks live in `validation/checks.md` (or `## Functional checks` in `detail.md`) as `open`, `see`, and `url` lines. **functional-test** writes that file.
2. `npm run verify -- --yes --playwright` opens the running app and writes `.scratch/playwright/report.md`. `npm run verify -- --yes --playwright --ticket PRY-XXX` writes `RLand/Tickets/PRY-XXX/validation/report.md` and screenshots. Exit 0 means every browser check passed.
3. A named repo suite is separate: `npm run verify -- --yes rland-core` runs `make test`. `--playwright` does not run `pnpm test:e2e`.

When they pick repo suites and did not ask for the browser:

1. `npm run verify -- --yes rland-core` (one argument per repo they picked).
2. Exit 0 means every selected suite ran and passed. `rland-infra` has no suite: exit 0 means its flow services were up.
3. Exit non-zero means a command failed, a selected suite could not run, or they named nothing. A repo flow that is down does not by itself fail a suite run; it is already in the preview. Report the skipped `reason` and the command exit codes. Do not retry a blocked check by installing toolchains or bringing the stack up unless they ask.
