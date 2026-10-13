# Setup

This is **Pato Piña / patopiña’s** agent setup, not a generic Surf or Blue People process. After a ticket is pulled, agents follow [Matt Pocock’s engineering skills](https://github.com/mattpocock/skills) (grill → spec → tickets → implement with TDD → review) plus the Blue Surf skills in this repo.

On a new machine, clone this repo and run setup. Open a **new chat** when it finishes so the harness reloads skills and rules.

**Node:** Node 18+ runs this repo. The Matt Pocock skills installer (`npx skills …`) needs Node **22.20+** for `skills@latest`. On Node 20 or 21, setup pins **`skills@1.5.18`** instead (same `add mattpocock/skills` flags). Upgrade Node when you can.

## 1. Clone and run setup

```bash
git clone https://github.com/ppina-bp/bluesurf-tools.git ~/Projects/bluesurf-tools
cd ~/Projects/bluesurf-tools
npm run setup
```

With no arguments, setup asks which harnesses to install: Cursor, Codex, Claude Code, or all. Flags skip the menu:

```bash
npm run setup -- --all
npm run setup -- --cursor --claude
```

Setup does this, in order:

1. If `.env` is missing, copies `.env.example` and asks for `OBSIDIAN_VAULT`. Set that variable in the environment to skip the question. An existing `.env` is left as it is. The other keys stay at the example defaults (`https://surf.bluepeople.com`, project `RLD`, `RLand/Tickets`, `RLand/Sprints`).
2. Runs `npm install`.
3. Installs the Matt Pocock skills for the harnesses you picked (`npx skills add mattpocock/skills`, global, the whole pack). Skip the Claude Code plugin `mattpocock-skills`; installing both shows every skill twice.
4. Symlinks the Blue Surf skills from this repo into each selected harness, and into `~/.agents/skills` (the router reads that path). A later `git pull` updates the skills.
5. Writes rules:
   - **Cursor:** `~/.cursor/rules/*.mdc` (always apply). If you already pasted these into Settings → User Rules, delete those three so they do not apply twice: No push until I say so, Ask questions via the harness, Matt Pocock skill router.
   - **Codex:** a managed section in `~/.codex/AGENTS.md`.
   - **Claude Code:** the same managed section in `~/.claude/CLAUDE.md`.
6. Runs `npm run login` when `.surf-cookies.json` is missing. Complete SSO in the Chromium window. It saves the session and closes by itself. Later commands run headless. Never `POST /api/login` from this repo.

Running setup again refreshes the harnesses you select. It does not remove a harness you leave out.

Do **not** run `/setup-matt-pocock-skills` here. That skill is per implementation repo, and only when you name that repo and ask.

### Sharing with teammates

- Hand off the **git repo** (clone), not a zip or copy of someone’s working tree. Local-only files — `.surf-cookies.json`, `.chrome-profile/`, `.env`, and `.scratch/` — are gitignored and must stay on each person’s machine.
- Everyone uses their **own** SSO via setup or `npm run login`. Sessions are not shared.
- Use the **skills** (`bluesurf-move`, `bluesurf-ticket`, …) in agent chats. They enforce preview/confirm for board moves; running `npm run move … --yes` directly skips that step.
- Tickets tagged **Bugs Detected** tell the agent to implement from Surf **comments** without a grill step. Description and comments are written into Obsidian as-is (HTML included).
- Pulling a ticket downloads **attachments** into your vault. Only pull work items you would open in Surf anyway.

## 2. When you only need a new Surf session

```bash
cd ~/Projects/bluesurf-tools
npm run login
```

When the session expires, the skills run `npm run login` for you. Setup itself skips login while `.surf-cookies.json` is still on disk.

## 3. Check it

```bash
cd ~/Projects/bluesurf-tools && npm test

test -f ~/.agents/skills/grill-with-docs/SKILL.md && echo "mattpocock ok"
test -f ~/.agents/skills/bluesurf-ticket/SKILL.md && echo "ticket skill ok"
test -f ~/.agents/skills/bluesurf-sprint/SKILL.md && echo "sprint skill ok"
test -f ~/.agents/skills/bluesurf-mine/SKILL.md && echo "mine skill ok"
```

Then a **new** chat: `/bluesurf-sprint` or “pull RLD-336”. If a command says the session expired, run `npm run login` again.
