---
name: bluesurf-sync
description: Updates the configured repos from their base branch (dev) before a new feature branch is created. Use when the user wants to pull dev, update every repo, or is about to create a branch, in any wording: "/bluesurf-sync", "update dev", "baja los cambios de dev", "pull all repos", "crea una rama", or "new branch". A clean fast-forward or merge is applied. Content conflicts stop the new branch until they are resolved.
---

Repo: `~/Projects/bluesurf-tools`. This does not use the Surf session. `RLAND_ROOT` is the workspace. `RLAND_REPOS` and `RLAND_BASE` (default `dev`) are the saved list. When they are set, do not scan the workspace for repos.

## Before a new branch

Run this before `git checkout -b` or `git switch -c` in any configured repo.

1. From bluesurf-tools: `npm run sync -- --json`.
2. If `target.needsSave` is true, the list was discovered from repos that have `origin/<base>`. Ask once, with the harness question tool, whether to save that list. Recommended: save it. Then `npm run sync -- --save --json`. Do not scan again after it is saved. Another workspace sets `RLAND_REPOS` and `RLAND_BASE` itself.
3. Read each repo's `action`. `fast-forward`, `stash-integrate`, and `merge` need `--yes`. `conflict` and `diverged` do not update that repo.
4. If they already asked to update, or a new branch is the next step: `npm run sync -- --yes`.
5. Create the branch only when every selected repo is `ok`. Branch from the updated base (`dev`), not from a stale HEAD. If any repo is `conflict` or `diverged`, stop. Do not `git reset --hard`, do not force the base ref, and do not pick ours/theirs. Resolve the listed files, then run sync again.

A dirty tree on the base branch is stashed, the update is applied, and the stash is restored. A conflict there is a real overlap with incoming changes. A repo that is on another branch only fast-forwards its local base ref; it is not checked out.
