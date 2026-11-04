---
name: functional-test
description: Run functional acceptance checks after implementation — harness-aware browser (Cursor integrated browser, Claude in Chrome, Codex browser MCP) or Playwright fallback for UI; smoke matrix for CLI/API — write report, screenshots, and manual-reproduction steps under the Surf ticket validation folder. Use when bluesurf-ticket requires post-implement verification, when the user asks for functional or acceptance testing on a Surf ticket, or after implement and code-review on pulled ticket work.
---

Blue Surf acceptance layer after Matt Pocock **implement** (which already ran **tdd**, **code-review**, and **commit**). Hard gate for **bluesurf-ticket** complete.

Do not edit Matt Pocock skills; this skill only adds Surf verification.

## Prerequisites

Settled before you start:

1. **Spec** — pulled ticket `detail.md` plus the confirmed plan from the chat, including a **Functional checks** section.
2. **Implement done** — **implement** finished for this ticket (including its commit). **code-review** had no blocking/high findings (nits may remain).
3. **Verify** — the implementation repo **AGENTS.md** **Verify (CI and local gates)** commands were run and passed (same bar as CI/actions). If that section is missing, ask the human to add it from `bluesurf-tools/templates/AGENTS.md.template`.
4. **Dev server** — the human already runs the app. Read the implementation repo **AGENTS.md** (from `bluesurf-tools/templates/AGENTS.md.template` if missing, ask the human to add it). Use base URL, health endpoint, and auth from the **Functional testing** section. Fail fast if health check fails; tell the human to start dev per AGENTS.md.
5. **Ticket key** — e.g. `PRY-XXX` (project code + number) for vault paths.
6. **Validation folder** — know the write path: `Proyect/Tickets/{code}/validation/` (create when saving artifacts).

## Process

### 1. Smoke matrix (CLI/API)

Run first when **Functional checks** include non-browser work, or when there is no UI path. Skip to step 2 when every check is browser-only.

In the implementation workspace (current cwd):

1. If `package.json` defines `test:smoke`, run it.
2. Else if the plan names a CLI entry, run `--help` or the documented smoke command.
3. Else if AGENTS.md names a health URL, `curl -sf` it (or equivalent).
4. Else run the repo’s full test script (`npm test` / documented equivalent).

Done when the chosen command exits 0. On failure, go to **Failure loop**.

### 2. Detect harness and browser capabilities

Before UI testing, determine **where this session runs** and **which agent-driven browser paths are actually available**. Do not offer “integrated browser” on Codex or Claude Code — those harnesses use different first-party tools.

| Harness | How to recognize | Agent-driven browser (if available) | Never call it |
| --- | --- | --- | --- |
| **Cursor** | `AskQuestion` tool; **cursor-ide-browser** MCP in the tool catalog | **Cursor integrated browser** — `browser_navigate`, `browser_take_screenshot`, etc. | N/A here |
| **Claude Code** | `AskUserQuestion` tool; Claude Code docs / `--chrome` | **Claude in Chrome** — extension drives Chrome/Edge when connected (`claude --chrome`) | “Integrated browser” |
| **Codex** | Codex CLI session; `~/.codex/config.toml` | **Browser MCP** — e.g. Playwright MCP, `browser-automation-skill`, or other `mcp_servers.*` browser tools present in the session | “Integrated browser” |

**Detection (your job — do not ask the user which harness):**

1. **Cursor:** Inspect dynamic tools (e.g. `GetDynamicTools` for `cursor-ide-browser` or `browser_navigate`). If browser MCP tools exist → Cursor integrated browser is **available**.
2. **Claude Code:** If Chrome integration tools are available, or the human already launched with `--chrome` and `/chrome` (or equivalent) shows connected → **Claude in Chrome** is **available**. If not, browser automation is **not** available until they reconnect; do not offer Claude in Chrome in the question.
3. **Codex:** Read `~/.codex/config.toml` for browser-related MCP servers and confirm matching tools appear in the session. If yes → **Codex browser MCP** is **available** (record the server name in `report.md`). If no MCP browser tools → agent-driven browser is **not** available.

**Computer use** (Cursor only): available when **cursor-computer-use** tools exist — for desktop/SSO outside the integrated browser tab.

**Playwright subagent:** always available as fallback (step 6).

Record in `report.md`: harness, detection result, and tools checked.

### 3. Choose UI runner (harness question)

When **Functional checks** need a browser or interactive UI:

- Build the **option list only from step 2** — never offer a dead path.
- Use the harness question tool (`AskQuestion` in Cursor, `AskUserQuestion` in Claude Code). In Codex, if only one UI path exists, state it and proceed; if two or more, ask in chat with the same option discipline.

**Options to include (when available):**

| Option label | Include when |
| --- | --- |
| **Cursor integrated browser** (Recommended) | Cursor + browser MCP detected |
| **Claude in Chrome** (Recommended) | Claude Code + Chrome integration detected |
| **Codex browser MCP** (Recommended) | Codex + browser MCP tools detected — use the configured name in the label, e.g. “Playwright MCP” |
| **Computer use** | Cursor + computer-use MCP detected |
| **Playwright subagent** | Always — label as fallback when a first-party browser option exists |

Rules:

- On **Codex** or **Claude Code**, if agent-driven browser was **not** detected, **do not** show integrated browser or Claude in Chrome / MCP browser — offer **Playwright subagent** (and **Computer use** on Cursor only). Tell the human how to enable browser support (e.g. `claude --chrome` + extension, or add browser MCP to `~/.codex/config.toml`) if they expected a browser option.
- If **only Playwright** is available, skip the question and run Playwright; say why in chat.
- Record the chosen method in `report.md`.

### 4. Cursor integrated browser

Cursor only. Use **cursor-ide-browser** tools:

- `browser_navigate` to AGENTS.md base URL (and login route if needed).
- `browser_lock` during a multi-step flow; `browser_unlock` when done.
- `browser_snapshot` / interactions for each **Functional checks** bullet.
- **`browser_take_screenshot`** at key steps (pass and fail).

Copy screenshots into `validation/` (e.g. `01-login.png`, `02-feature.png`).

On MCP errors, ask once via harness: **Computer use** or **Playwright**, then continue.

### 5. Claude in Chrome

Claude Code only, when Chrome integration is connected. Use the session’s **Chrome / browser tools** (extension-driven Chrome or Edge — visible window, shared login).

- Drive the same **Functional checks** as the plan.
- Capture **screenshots** at key steps into `validation/` (use whatever screenshot or capture tool the integration exposes).

If connection drops, tell the human to fix `/chrome` / extension, or fall back to **Playwright** via harness.

### 6. Codex browser MCP

Codex only. Use the **browser tools from the configured MCP** (discovered in step 2 — e.g. `browser_open`, `browser_snapshot`, Playwright MCP equivalents).

- Same **Functional checks**; save screenshots into `validation/`.
- Name the MCP server and commands in `report.md`.

If MCP fails, fall back to **Playwright subagent** (step 7).

### 7. Computer use

Cursor only when **cursor-computer-use** is available and selected (or as fallback from step 4).

- `computer_apps` / `computer_resolve_app`, then drive checks with **`computer_screenshot`** into `validation/`.

Human may need SSO or permissions; use **wizard** if blocked. On failure, offer **Playwright** via harness.

### 8. Playwright subagent (fallback)

When the human chose Playwright, no first-party browser was available, or steps 4–7 failed:

Spawn a **Task** subagent (generalPurpose or equivalent):

- Work in the **implementation repo** cwd.
- Do **not** start or stop the dev server; use the base URL from AGENTS.md.
- Reuse **storageState** or env test credentials when AGENTS.md documents them; otherwise call **wizard** once to capture auth.
- Use **`npx playwright`** with an ephemeral script if the repo has no Playwright dependency (do not add `@playwright/test` unless the human asks).
- Execute every UI **Functional checks** bullet; copy screenshots (and trace zip on failure) into `validation/`.

Return pass/fail, commands run, screenshot paths, and detail for **Manual reproduction**.

### 9. Validation folder (vault)

Under the BluePeople vault (`OBSIDIAN_VAULT`):

`Proyect/Tickets/{code}/validation/`

Write regardless of runner:

- `report.md` — harness, detection notes, pass/fail, chosen runner, smoke commands, links to **local screenshot files** (redact secrets).
- **Screenshots** in this folder (not chat-only).

### 10. Manual reproduction (last step)

Write `manual-reproduction.md` in the same `validation/` folder — human-runnable steps mirroring the run (prerequisites, numbered steps, expected results). Name the runner accurately (Cursor integrated browser, Claude in Chrome, Codex MCP name, computer use, or Playwright).

Give a **brief summary in chat** and point to `manual-reproduction.md`.

Done when `validation/report.md`, `validation/manual-reproduction.md`, and screenshots for the latest run exist in `validation/`.

## Failure loop

On fail:

1. Summarize failures (chat + update `validation/report.md`; keep or mark stale `manual-reproduction.md` until a passing rerun completes step 10).
2. Call **implement** with **tdd** to fix, then **code-review** again (must reach no blockers). **implement** commits when it finishes.
3. Re-run from step 1 (re-detect harness and browser in step 2 before asking in step 3).

Stop after **3** full implement → functional cycles. Then stop and ask the human how to proceed.

## Out of scope

- Replacing unit/integration tests (**tdd** still owns those).
- Git commit (**implement** owns commit unless follow-up fixes need a new commit before push).
- Pushing or running **ticket-done** (human says ticket complete / commit and push for that).
