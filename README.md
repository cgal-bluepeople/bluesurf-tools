# bluesurf-tools

Local Blue Surf client and agent skills (Cursor, Codex, Claude Code). They replay **your** SSO session in a dedicated Chromium profile. There is no public API and no password handling.

This workflow is **opinionated to me (Pato Piña / patopiña)**. After a ticket is pulled, agents follow [Matt Pocock’s engineering skills](https://github.com/mattpocock/skills) — grill → spec → tickets → implement with TDD → review → functional-test — plus the Blue Surf skills below. That routing is mine; it is not a generic Surf or Blue People process.

Cursor, Codex, and Claude Code load the rules in [`rules/`](rules/) and the skills in [`skills/`](skills/). `npm run setup` links those skills into the harnesses you pick, including `~/.agents/skills`. Use them in a **new chat**. If the session is dead, run `npm run login` here first.

Design notes: [docs/design.md](docs/design.md). Full install: [docs/setup.md](docs/setup.md).

## Setup

On a new machine, follow **[docs/setup.md](docs/setup.md)** — clone, then `npm run setup`. That installs the Matt Pocock skills, the Blue Surf skill links, and the rules for the harnesses you pick, then opens Surf login when you have no saved session.

If this machine is already set up and you only need the Surf session:

```bash
cd ~/Projects/bluesurf-tools
npm run login
```

Complete SSO in the window that opens. It saves the session to `.surf-cookies.json` and closes by itself once you are signed in. After that, every command runs headless — no window.

When the session expires, the skills run `npm run login` for you: a window opens, you sign in, and the agent retries the command.

`.env` points at `https://surf.bluepeople.com` and the BluePeople Obsidian vault (`RLand/Tickets`, `RLand/Sprints`).

## `/bluesurf-ticket`

Pull one Surf work item into Obsidian, then stop. A ticket tagged Bugs Detected carries regression comments to fix. Any other ticket waits until you choose grill or implement.

**Say:** `/bluesurf-ticket PRY-XXX`, or “pull PRY-XXX”.

**Does:**

1. Reuses the saved session in headless Chromium.
2. Writes `RLand/Tickets/PRY-XXX/detail.md` (title, priority, type, status, sprint, estimate, tags, attachment names, HTML description). A `Bugs Detected` tag also writes the comments.
3. Downloads files into `RLand/Tickets/PRY-XXX/attachments/`.
4. Stops. On `Bugs Detected`, the comments are the regressions to fix. Otherwise asks **grill vs implement**.

**Work ticket** (implementation repo; keep dev running and document URL/auth in **AGENTS.md**): grill (plan includes **Functional checks**) → Matt **implement** (TDD, code-review, commit with `(PRY-XXX)`) → **functional-test** (Playwright subagent or smoke matrix; report under `RLand/Tickets/PRY-XXX/validation/`). Sequencing is in **bluesurf-ticket**; Matt Pocock skills stay unchanged.

**Complete the ticket** only after functional-test passes:

| You say | What happens |
| --- | --- |
| “The ticket is complete” | Deletes `RLand/Tickets/PRY-XXX/` from the vault (including `validation/`). |
| “Commit and push” | Commits if needed, pushes the **implementation repo**, then deletes the vault folder. That phrase is push permission for this ticket. |

Same as the CLIs:

```bash
npm run ticket -- PRY-XXX
npm run ticket-done -- PRY-XXX
```

## `/bluesurf-sprint`

Snapshot your assigned tickets on the current Surf sprint into Obsidian.

**Say:** `/bluesurf-sprint`, “sprint note”, or “current sprint”.

**Does:**

1. Opens Chromium briefly to reuse the saved session.
2. Loads tickets assigned to you on the latest sprint (highest-numbered `currentSprintName` on your cards; falls back to the most common `currentSprintId` if names have no number).
3. For each ticket, reads reported hours from the work item (`totalExecuted`), not the board’s inflated `totalHours`.
4. Writes or **rewrites** the note for that sprint (`RLand/Sprints/Sprint N.md`).

**Vault file:** `RLand/Sprints/Sprint N.md` (e.g. `Sprint 14.md`); later runs update the same file.

**Tables:**

- **Pending Tickets** — `Development (IN PROGRESS)`, `Analysis (IN PROGRESS)`, `Analysis (DONE)`, and any `BLOCKED` status
- **Done Tickets** — everything else

Each table is ordered by priority. Columns: ticket (wiki link to `<OBSIDIAN_TICKETS_DIR>/PRY-XXX/detail`), title, estimate, effort (hours already reported), type, status, priority, tags.

Does not pull a single ticket unless you ask.

```bash
npm run sprint
npm run sprint -- RLD
```

## `/bluesurf-sprint-review`

Snapshot your assigned tickets on the **previous** Surf sprint (or a sprint number you name) into Obsidian.

**Say:** `/bluesurf-sprint-review`, “sprint review”, “review last sprint”, or “how did last sprint go” (export, then summarize from the note).

**Does:** same tables as the current-sprint snapshot, but for Sprint N−1 by default (highest sprint on your cards minus one). Only tickets whose **current** Surf sprint name still matches that sprint.

```bash
npm run sprint-review              # previous sprint
npm run sprint-review -- RLD 13    # explicit sprint number
```

If you have no assigned tickets on that sprint, nothing is written to the vault.

## `/bluesurf-move`

Move a ticket to another status on the board. The team sees the change, so the skill always previews and asks first.

**Say:** “move RLD-388 to dev done”, “I finished 388”, “mark 387 as blocked”.

**Does:** looks up the ticket's type (each type has its own board and status ids), matches the status name loosely, and prints the planned move. With `--yes` it moves the card to the top of that column (`POST /api/WorkItem/{id}/moveOnBoard/{statusId}/0`), checks Surf's answer, and sends the `ProjectUpdated` hub message the board UI sends so teammates' open boards refresh.

```bash
npm run move -- RLD-388 "dev done"         # preview only, changes nothing
npm run move -- RLD-388 "dev done" --yes   # move it
```

## `/bluesurf-mine`

List the tickets assigned to you across **every** sprint. Read-only; nothing is written to the vault.

**Say:** `/bluesurf-mine`, “my tickets”, or “what’s assigned to me”.

**Does:** loads your assigned cards, hides any `DONE` status, and groups the rest by sprint (newest first, no sprint last), ordered by priority. Agents call it with `--json`.

```bash
npm run mine            # open tickets
npm run mine -- --all   # include DONE
npm run mine -- --json  # machine-readable, for agents
```

## `/bluesurf-verify`

Plan which RLand repos can be validated, and whether the local stack is up. Does not use the Surf session.

**Say:** `/bluesurf-verify`, “test this in playwright”, “which repos should be running”, or “is the stack up”.

**Does:**

1. Finds the workspace (`RLAND_ROOT`, a sibling `rland-new` / `RLand` / `rland` with `rland-ui` or `rland-infra`, or a directory that contains `.bluesurf-workspace`). Another project does not need `rland-ui`.
2. Searches how the repos run. A compose file that builds sibling repos is a stack runner (`rland-infra` → `make local-up-detached`). A `make run`, `make dev`, or `pnpm dev` is that repo on its own. If both exist and `RLAND_RUN_MODE` is unset, the plan asks which one to use. `--save` writes the choice to `.env`.
3. Probes the local stack (proxy, rland-web, loader-web, auth, core, collab, mock-oidc, mcp on `:8082`). `RLAND_PROBES` replaces that list. In stack mode each repo's flow is its own services on that runner. In individual mode the flow is the repo's own command and the stack is not the gate. Playwright e2e does not use the stack either way.
4. Prints whether each check can run. Built-in suites: `rland-ui` `pnpm test:e2e`, Go repos `make test`, `rland-mcp` `pnpm test`. `RLAND_CHECKS` overrides or adds repos (`repo|command|services`). A named directory that is not in the catalog is inferred from `package.json` or a Makefile `test` target. Nothing runs until the mode is chosen and `--yes` is passed.

`--json` writes one JSON object to stdout. Notices go to stderr.

Playwright in this command opens the running app. It tests a change, or it runs a ticket's functional checks.

```bash
npm run verify -- --playwright                 # preview: open the app
npm run verify -- --yes --playwright           # browser check, report in .scratch/playwright/
npm run verify -- --yes --playwright --ticket PRY-12
```

Ticket lines in `validation/checks.md` are `open /path`, `see "text"`, and `url /path`. The report is `RLand/Tickets/PRY-12/validation/report.md`. `RLAND_APP_URL` overrides the base address. `pnpm test:e2e` stays the mocked UI suite and is not this browser test. The RLand code-review gate (`pnpm quality`, `gofmt`, `go vet`, `schema-check`) is separate.

```bash
npm run verify                         # preview dirty repos
npm run verify -- rland-ui             # preview one repo
npm run verify -- --json               # for agents
npm run verify -- --yes rland-ui       # run Playwright
npm run verify -- --mode stack --runner rland-infra --save
```

## `/bluesurf-sync`

Update every saved repo from its base branch before creating a feature branch.

**Say:** `/bluesurf-sync`, “update dev”, “baja los cambios de dev”, or before “crea una rama”.

**Does:**

1. Uses `RLAND_REPOS` and `RLAND_BASE` when they are set, and does not scan the workspace. The first run discovers repos that have `origin/<base>` (default `dev`). `--save` stores that list. Another project sets `RLAND_ROOT`, `RLAND_BASE`, and `RLAND_REPOS`.

`--json` writes one JSON object to stdout. Notices go to stderr.
2. Fetches `origin/<base>`. A clean repo on that branch fast-forwards, or merges when both sides have commits. A dirty tree is stashed and restored. Another checked-out branch only fast-forwards the local base ref.
3. A content conflict aborts that repo's merge and is reported. Nothing is reset and no side is picked. Do not create the new branch until that repo is clean.

```bash
npm run sync                         # preview
npm run sync -- --save               # store the repo list
npm run sync -- --yes                # fetch and update
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install skills and rules for Cursor, Codex, and/or Claude Code, then sign in if needed |
| `npm run login` | Sign in once; saves the session to `.surf-cookies.json` |
| `npm run ticket -- PRY-XXX` | Write ticket note + attachments |
| `npm run ticket-done -- PRY-XXX` | Delete that ticket folder from the vault |
| `npm run sprint` | Write or rewrite the current-sprint note |
| `npm run sprint-review` | Write or rewrite a past-sprint review note (default: previous sprint) |
| `npm run move -- RLD-388 "dev done"` | Preview a status move; add `--yes` to move |
| `npm run mine` | List your open tickets across all sprints (`--all`, `--json`) |
| `npm run verify` | Plan repo checks and probe the local stack; add `--yes` to run |
| `npm run sync` | Update saved repos from `dev`; add `--yes` to apply |
| `npm test` | Unit tests |
| `npm run spike` | Record Surf XHR (only if the API map in `docs/design.md` is stale) |

## Safety

- Do not commit `.chrome-profile/`, `.surf-cookies.json`, `.scratch/`, or `.env` (`.surf-cookies.json` is your live Surf session; it is written with mode 600)
- Share this repo by **git clone**, not by copying the whole checkout folder (that folder can hold your session and spike captures)
- `BLUESURF_HEADED=1` shows the browser window, for debugging
- Do not put passwords in this repo
- Never `POST /api/login` from our code
- Never push unless you explicitly ask (or say **commit and push** on a pulled ticket)
- Prefer the **skills** for move and ticket completion: `bluesurf-move` previews and asks before changing the board; raw `npm run move … --yes` skips that guardrail

### For colleagues

Each person clones the repo and runs `npm run setup`, which writes `.env` when it is missing, asks for `OBSIDIAN_VAULT`, and keeps the Surf session on their machine. Rules for the harnesses they pick live in [`rules/`](rules/).

- **Bugs Detected** tickets skip the grill question: the agent implements from the ticket’s **Comments** (copied from Surf). Treat pulled tickets like Surf content you already trust.
- **Attachments** download into the vault under `RLand/Tickets/<code>/attachments/` (your vault may sync via iCloud or similar).
- **Commit and push** on a pulled ticket is explicit permission to push the implementation repo for that ticket.
