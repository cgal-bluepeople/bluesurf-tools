# Blue Surf tools — design

Local client and agent skills for **your** Blue Surf session. No public API. No SSO bypass.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Data access | Persistent Chrome profile + replay the SPA’s private JSON APIs. DOM scrape is fallback only. |
| After `/bluesurf-ticket` | Write Obsidian note + attachments, then **stop**. If the note is tagged Bugs Detected, the comments are the regressions to fix. Otherwise ask grill vs implement. |
| After the ticket is complete | Delete `RLand/Tickets/RLD-xxx/` entirely. "The ticket is complete" or "commit and push" both complete it. Commit and push also commits the implementation repo with `(RLD-xxx)` on the subject and pushes. |
| Client home | This repo: `~/Projects/bluesurf-tools` |
| Skills | `npm run setup` symlinks the Blue Surf skills into `~/.agents/skills` and into each selected harness (`~/.cursor/skills`, `~/.codex/skills`, `~/.claude/skills`) |
| Obsidian | Vault `BluePeople` → `RLand/Tickets/RLD-100/detail.md`, files in `RLand/Tickets/RLD-100/attachments/`, sprint notes in `RLand/Sprints/Sprint N.md` |
| Chrome | Dedicated Playwright profile at `.chrome-profile/` (gitignored). Equivalent to “Blue Surf agent”; not your daily Chrome (Chrome locks a profile while it is open). |

## Layers

1. **Session** — Playwright persistent context plus a cookie jar. You complete SSO once in a headed window; `npm run login` saves the cookies to `.surf-cookies.json`, and every later run loads them into a headless context. Surf's auth cookie (`.AspNetCore.Identity.Application`) is a browser-session cookie, so Chromium drops it on exit and the profile alone never stays signed in.
2. **Client** — call the same JSON URLs the Blue Surf SPA already uses. File names and bytes are authenticated GETs from `workItem.files[]`.
3. **Skills** — thin wrappers. They never store passwords. If the session is dead, they fail with “run `npm run login`”.

## Skills (target)

### `/bluesurf-ticket RLD-100`

1. Fetch ticket body, comments, metadata, attachment list.
2. Write `RLand/Tickets/RLD-100/detail.md` in the BluePeople vault.
3. Download attachments into `RLand/Tickets/RLD-100/attachments/`.
4. Stop. If the note is tagged Bugs Detected, the `## Comments` section is the regression work: follow diagnosing-bugs, then implement. Otherwise ask grill vs implement via the harness.
5. When you say the ticket is complete, or say to commit and push, delete `RLand/Tickets/RLD-100/` entirely. Commit and push also commits the implementation repo with `(RLD-100)` on the subject and pushes.

### `/bluesurf-sprint`

1. Fetch tickets assigned to you on the current sprint.
2. Sort by priority.
3. Write `RLand/Sprints/Sprint N.md` with title, estimated hours, type, tags, and ticket links.

## Spike result (2026-09-10)

Origin in production is **`https://surf.bluepeople.com`**, not `bluesurf.bluepeople.com`.

Auth is a cookie session after `POST /api/login` (the SPA does this; **we do not replay email/password**). Early calls return 401 until that session exists. The client must reuse the Playwright profile’s cookies via `page.request` / `context.request`.

### Endpoints we will call

| Function | Call | Notes |
| --- | --- | --- |
| `getCurrentUser()` | `GET /api/instance/currentUser` | `id` is the assignee filter (your user id from this response). |
| `getWorkItem(code)` | `GET /api/workItem/{code}` | Confirmed with `RLD-336` and `RLD-339`. Includes `files[]`. |
| `getWorkItemVideos(code)` | `GET /api/WorkItem/{code}/videos` | Empty array on RLD-336 and RLD-339. |
| `getWorkItemFileName(workItemId, fileId)` | `GET /api/workItem/{workItemId}/fileName/{fileId}` | Plain text filename. Confirmed on RLD-339. |
| `downloadWorkItemFile(workItemId, fileId)` | `GET /api/workItem/{workItemId}/file/{fileId}` | Bytes. From SPA `downloadFile`. |
| image preview | `GET /api/workItem/{workItemId}/image/{fileId}` | When `file.isImage`. |
| `listMyProjects()` | `GET /api/user/current/project` | `smallCode` is `RLD`. |
| `getKanban(projectCode, filters)` | `POST /api/project/{code}/kanban?skipWorkItems=false` | Board + work items. |
| `listPriorities()` | `GET /api/Enums/WorkItemPriority` | 5=Highest … 1=Lowest. |
| `listTypes()` | `GET /api/Enums/WorkItemType` | userStory, bug, issue, task, … |
| `getBoards(projectCode)` | `POST /api/project/{code}/kanban?skipWorkItems=true` | Statuses only. One board per work item `type` (0 user story, 1, 3 task seen), each with its **own** status ids. `destinations` is empty: no transition rules. |
| `moveWorkItemOnBoard(id, statusId, position)` | `POST /api/WorkItem/{workItemId}/moveOnBoard/{statusId}/{position}` | No body. `position` is the slot in the target column (UI drops sent 2 and 3; we send 0 = top). Returns the updated work item. Captured 2026-09-28 moving RLD-387 and RLD-388. |
| project hub | SignalR `wss://…/api/hub/projectHub` | After a move the UI invokes `JoinGroup [code]` then `ProjectUpdated [code, workItemId]` so other open boards refresh. |

Kanban filter body (empty arrays mean “all”):

```json
{
  "statuses": [],
  "tags": [],
  "sprints": [],
  "priorities": [],
  "assignedTo": ["<currentUser.id>"],
  "reportedBy": [],
  "colors": [],
  "defectsOrigins": [],
  "tagCondition": "and",
  "search": "",
  "quantityPerStatus": []
}
```

The UI’s “assigned to me” view is exactly that POST with `assignedTo: [currentUser.id]`.

### Ticket fields (`GET /api/workItem/{code}`)

`code`, `id`, `name`, `description` (HTML), `typeDisplayName`, `priority` (int) + `priorityName`, `statusName`, `currentSprintId`, `currentSprintName` (e.g. `Sprint 14`), `assignedToFullName`, `reportedByFullName`, `estimatedEffort`, `totalHours`, `comments[]`, `changes[]`, `efforts[]`, `tags` (seen on kanban cards as `tagName`), `files[]`.

Each file: `id`, `workItemId`, `isImage`. `name` is filled by `GET .../fileName/{id}`. Download is `GET .../file/{id}`. Image preview is `GET .../image/{id}`.

### Sprint fields (kanban cards)

Each work item: `code`, `name`, `priority` / `priorityName`, `estimatedEffort`, `typeDisplayName`, `tags[].tagName`, `currentSprintId` / `currentSprintName`, `sprints[]`.

### Gaps

1. **Sprint list endpoint** — board filter still sends `sprints: []`. SPA source also has `POST /api/projectSprint` (save) and `POST /api/workItems/byProperty/sprint` (assign). No dedicated list GET in the captures. Keep inferring the current sprint from `currentSprintId` on kanban cards.
2. **Attachments** — mapped from RLD-339 + SPA `downloadFile` / `getFileNames`. `npm run ticket -- RLD-xxx` writes `detail.md` and downloads `GET /api/workItem/{id}/file/{fileId}`.
3. **Sprint note** — `npm run sprint` writes `RLand/Sprints/Sprint N.md` from `listMyCurrentSprintRows`, or rewrites the same file on later runs. `npm run sprint-review` does the same for Sprint N−1 (or an explicit sprint number): assigned tickets whose `currentSprintName` matches that sprint. Two tables: **Pending Tickets** (`Development (IN PROGRESS)`, `Analysis (IN PROGRESS)`, `Analysis (DONE)`, any `BLOCKED`) and **Done Tickets** (the rest). Estimate is `estimatedEffort`. Effort is **reported** hours (`totalExecuted` from `GET /api/workItem/{code}`; kanban `totalHours` is estimate×1.25 and is not used). Ordered by priority. Still no sprint-list GET; current sprint is the highest-numbered `currentSprintName` on your assigned cards. The most common `currentSprintId` was tried first and picked a past sprint: old sprints keep their cards, so a big old sprint outvotes a smaller current one.

## Proposed client functions

Do not install skills yet. Implement these in `src/` next:

- `createSession()` — launch persistent Chromium; throw “run `npm run login`” on 401.
- `getCurrentUser()` — id + display name for filters.
- `parseTicketKey("RLD-336")` → `{ projectCode: "RLD", code: "RLD-336" }`.
- `getWorkItem(code)` — full ticket for Obsidian.
- `getWorkItemVideos(code)` — video list (often empty).
- `listWorkItemFiles(code)` — `files[]` plus filename lookups.
- `getWorkItemFileName(workItemId, fileId)` / download via `filePath`.
- `listMyProjects()` / `resolveProject(code)`.
- `getKanban(projectCode, filters)` — raw board.
- `listMyWorkItems(projectCode)` — flatten `statuses[].workItems` with `assignedTo: [me]`.
- `listMyCurrentSprintWorkItems(projectCode)` — same list, keep items on the latest sprint (highest number in `currentSprintName`; most frequent `currentSprintId` as a fallback, or explicit `sprints` filter once we have an id).
- `sortByPriority(items)` — `priority` descending (5 → 1).
- `toSprintRow(item)` — `{ code, title, estimatedHours, type, tags, priority, status, sprint }`.
- `toTicketNote(item)` — markdown for `RLand/Tickets/{code}/detail.md`.
- `createVault().removeTicket(code)` — delete `RLand/Tickets/{code}/` when the ticket is complete.

Session helper: `apiGet(path)` / `apiPost(path, json)` on `https://surf.bluepeople.com` with the profile cookies. Never call `POST /api/login` from our code.

## Out of scope

- Bypassing SSO or sharing someone else’s session
- Committing `.chrome-profile`, `.surf-cookies.json`, or cookies
- Auto-implementing from a ticket
- Pushing this repo anywhere unless you ask
