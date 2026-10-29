---
name: bluesurf-verify
description: Plans which RLand repos to validate and whether that validation can run. Use when the user wants Playwright against the changes, a check that the local system is up, or to know which repos or commands to run before validating, in any wording: "/bluesurf-verify", "test this in playwright", "which repos should be running", "is the stack up", "validate the flow", or "corre la prueba de los cambios". Preview first. Run only after they pick the repos.
---

Repo: `~/Projects/bluesurf-tools`. This does not use the Surf session. `RLAND_ROOT` in `.env` overrides workspace discovery (sibling `rland-new`, `RLand`, or `rland`).

## Preview

1. From the repo: `npm run verify -- --json`. Add repo names when they already named them (`npm run verify -- --json rland-ui`).
2. Read `run`. The command searched the workspace for a compose repo that starts sibling repos, and for each repo's own `make run`, `make dev`, or `pnpm dev`.
   - If `run.needsChoice` is true, stop and ask with the harness question tool how the repos run. One question. Recommended: `stack` via `run.discovery.runners[0]` when that runner serves the other repos (this workspace: `rland-infra`, `make local-up-detached`). The other option is `individual`, each repo's own command from `run.discovery.individual`.
   - After they answer, re-run `npm run verify -- --json --save --mode stack --runner rland-infra` (or `--mode individual`). `--save` writes `RLAND_RUN_MODE` and `RLAND_RUNNER` into `.env`. Do not ask again while those are set. Do not pass `--yes` in this turn.
3. Read `stack.ready` and each check's `canRun` / `reason`. If `reason` says Node is below 22, re-run this preview in the same shell after `source ~/.nvm/nvm.sh && nvm use 22`. Do not install Node. Use that shell for `--yes` too.
4. Ask which repos to run. One question, multi-select. Recommended: every check with `canRun: true` or `flow.canRun: true`. Include each planned repo. If the plan is empty, offer the catalog (`rland-ui`, `rland-core`, `rland-auth`, `rland-collab`, `rland-commons`, `rland-ngam`) and stop after the answer unless they pick some.
5. Tell them, in the same turn as the question, only what the JSON already decided:
   - `run.mode` `stack`: `flow.via` is the runner and `flow.services` are the probes that repo needs. One service being down does not block another repo. `rland-ngam` has no host port. Playwright e2e does not use the stack.
   - `run.mode` `individual`: `flow.command` is that repo's own process. The infra stack is not the gate.
   - `command` / `canRun` is the suite (`pnpm test:e2e` or `make test`).
   - Do not start Docker or a repo process unless they ask. If `flow.canRun` is false, say `flow.reason`.

Do not pass `--yes` in the preview turn.

## Run

When they pick repos, or they already said to run a named repo:

1. `npm run verify -- --yes rland-ui` (one argument per repo they picked).
2. Exit 0 means every selected suite ran and passed. `rland-infra` has no suite: exit 0 means its flow services were up.
3. Exit non-zero means a command failed, a selected suite could not run, or they named nothing. A repo flow that is down does not by itself fail a suite run; it is already in the preview. Report the skipped `reason` and the command exit codes. Do not retry a blocked check by installing toolchains or bringing the stack up unless they ask.
