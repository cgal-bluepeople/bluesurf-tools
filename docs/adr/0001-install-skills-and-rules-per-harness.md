# Install skills and rules per harness

Setup is one script, `npm run setup`, because the old checklist (hand-pasted Cursor rules, a full overwrite of `~/.codex/AGENTS.md`, and symlinks you typed yourself) was easy to do halfway. The script asks which harnesses you want — Cursor, Codex, Claude Code, or any mix — and installs only those. A later run adds a harness you skipped and leaves the others alone.

Blue Surf skills are symlinks back into this repo, including `~/.agents/skills`, because the router reads that path and a git pull should update the skills. Matt Pocock’s skills come from `npx skills` for every selected harness, including Claude Code. The Claude Code plugin is a second copy of the same skills, so the script does not install it.

Cursor’s account-synced Settings rules cannot be written by a script. Machine-local files in `~/.cursor/rules` can. Codex and Claude Code share one rules file with notes you may already have there, so setup owns a marked section and replaces only that section on the next run. A file that is still the old full copy of `rules/AGENTS.md` is replaced outright. Anything else stays, and setup names the headings that now appear twice.

Surf login runs only when `.surf-cookies.json` is missing. An expired session still on disk is refreshed by the skills, not by setup.
