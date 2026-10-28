import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { linkBlueSurfSkills, setup } from "../src/setup.js";

const RULES = {
  "no-push-until-i-say-so.md": `---
title: No push until I say so
---

Never push until asked.
`,
  "ask-questions-via-the-harness.md": `---
title: Ask questions via the harness
---

Ask in the harness.
`,
  "matt-pocock-skill-router.md": `---
title: Matt Pocock skill router
---

Route skills.
`,
};

const LEGACY_AGENTS = `# Global agent rules

## No push until I say so

Never push until asked.

## Ask questions via the harness

Ask in the harness.

## Matt Pocock skill router

Route skills.
`;

const MANAGED = `<!-- bluesurf-tools:start -->
## No push until I say so

Never push until asked.

## Ask questions via the harness

Ask in the harness.

## Matt Pocock skill router

Route skills.
<!-- bluesurf-tools:end -->
`;

describe("checked-in rules", () => {
  it("keeps rules/AGENTS.md in the same order as the three rule files", async () => {
    const rulesDir = fileURLToPath(new URL("../rules/", import.meta.url));
    const agents = await readFile(path.join(rulesDir, "AGENTS.md"), "utf8");
    const pushAt = agents.indexOf("## No push until I say so");
    const askAt = agents.indexOf("## Ask questions via the harness");
    const routeAt = agents.indexOf("## Matt Pocock skill router");
    assert.ok(pushAt !== -1 && pushAt < askAt && askAt < routeAt);
    for (const [fileName, sentence] of [
      ["no-push-until-i-say-so.md", "Never push code to a remote until the developer explicitly asks to push."],
      ["ask-questions-via-the-harness.md", "When you need a decision from the developer, ask through the harness question UI"],
      ["matt-pocock-skill-router.md", "Classify every coding request and follow the matching skill without waiting for a slash command."],
    ]) {
      const rule = await readFile(path.join(rulesDir, fileName), "utf8");
      assert.ok(rule.includes(sentence));
      assert.ok(agents.includes(sentence));
    }
  });
});

describe("setup", () => {
  let root;
  let repoRoot;
  let home;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bluesurf-setup-"));
    repoRoot = path.join(root, "repo");
    home = path.join(root, "home");
    await mkdir(path.join(repoRoot, "skills", "bluesurf-ticket"), { recursive: true });
    await mkdir(path.join(repoRoot, "skills", "bluesurf-mine"), { recursive: true });
    await mkdir(path.join(repoRoot, "skills", "functional-test"), { recursive: true });
    await mkdir(path.join(repoRoot, "skills", "other-skill"), { recursive: true });
    await mkdir(path.join(repoRoot, "rules"), { recursive: true });
    await writeFile(path.join(repoRoot, "skills", "bluesurf-ticket", "SKILL.md"), "# ticket\n");
    await writeFile(path.join(repoRoot, "skills", "bluesurf-mine", "SKILL.md"), "# mine\n");
    await writeFile(path.join(repoRoot, "skills", "functional-test", "SKILL.md"), "# functional\n");
    await writeFile(path.join(repoRoot, "rules", "AGENTS.md"), LEGACY_AGENTS);
    for (const [name, body] of Object.entries(RULES)) {
      await writeFile(path.join(repoRoot, "rules", name), body);
    }
    await writeFile(
      path.join(repoRoot, ".env.example"),
      "BLUESURF_ORIGIN=https://surf.bluepeople.com\nOBSIDIAN_VAULT=/path/to/your/BluePeople/vault\n",
    );
    await mkdir(path.join(root, "vault"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("links Blue Surf skills into the selected harnesses and ~/.agents/skills", async () => {
    await setup(options(["--cursor", "--claude"]));

    const ticket = path.join(repoRoot, "skills", "bluesurf-ticket");
    const mine = path.join(repoRoot, "skills", "bluesurf-mine");
    assert.equal(await readlink(path.join(home, ".cursor", "skills", "bluesurf-ticket")), ticket);
    assert.equal(await readlink(path.join(home, ".claude", "skills", "bluesurf-mine")), mine);
    assert.equal(await readlink(path.join(home, ".agents", "skills", "bluesurf-ticket")), ticket);
    await assert.rejects(lstat(path.join(home, ".codex", "skills", "bluesurf-ticket")));
    await assert.rejects(lstat(path.join(home, ".cursor", "skills", "other-skill")));
  });

  it("linkBlueSurfSkills links every bluesurf-* directory including new skills", async () => {
    const review = path.join(repoRoot, "skills", "bluesurf-sprint-review");
    await mkdir(review, { recursive: true });
    await writeFile(path.join(review, "SKILL.md"), "# review\n");

    const linked = await linkBlueSurfSkills({ repoRoot, home, harnesses: ["codex", "claude"] });
    assert.deepEqual(linked, [
      "bluesurf-mine",
      "bluesurf-sprint-review",
      "bluesurf-ticket",
      "functional-test",
    ]);
    assert.equal(await readlink(path.join(home, ".codex", "skills", "bluesurf-sprint-review")), review);
    assert.equal(await readlink(path.join(home, ".claude", "skills", "bluesurf-sprint-review")), review);
    assert.equal(await readlink(path.join(home, ".agents", "skills", "bluesurf-sprint-review")), review);
  });

  it("asks which harnesses when no flags are given", async () => {
    let asked = "";
    await setup(options([], {
      prompt: async (message) => {
        asked = message;
        return "1 3";
      },
    }));

    assert.match(asked, /Cursor/);
    assert.match(asked, /Codex/);
    assert.match(asked, /Claude Code/);
    assert.equal(
      await readlink(path.join(home, ".cursor", "skills", "bluesurf-ticket")),
      path.join(repoRoot, "skills", "bluesurf-ticket"),
    );
    assert.equal(
      await readlink(path.join(home, ".claude", "skills", "bluesurf-mine")),
      path.join(repoRoot, "skills", "bluesurf-mine"),
    );
    await assert.rejects(lstat(path.join(home, ".codex", "skills", "bluesurf-ticket")));
  });

  it("rejects an unknown flag before linking skills", async () => {
    await assert.rejects(() => setup(options(["--vim"])), /--vim/);
    await assert.rejects(() => setup(options(["--all", "--vim"])), /--vim/);
    await assert.rejects(lstat(path.join(home, ".agents", "skills")));
  });

  it("tells you the flags when there is no terminal and no selection", async () => {
    await assert.rejects(() => setup(options([], { stdinIsTTY: false })), /--all/);
  });

  it("points an existing skill symlink at this repo", async () => {
    const dest = path.join(home, ".cursor", "skills", "bluesurf-ticket");
    await mkdir(path.dirname(dest), { recursive: true });
    await symlink("/somewhere/else", dest);
    await setup(options(["--cursor"]));
    assert.equal(await readlink(dest), path.join(repoRoot, "skills", "bluesurf-ticket"));
  });

  it("stops when a skill path is already a real directory", async () => {
    const dest = path.join(home, ".cursor", "skills", "bluesurf-mine");
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, "SKILL.md"), "keep\n");
    const escaped = dest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await assert.rejects(() => setup(options(["--cursor"])), new RegExp(escaped));
    assert.equal(await readFile(path.join(dest, "SKILL.md"), "utf8"), "keep\n");
    await assert.rejects(lstat(path.join(home, ".agents", "skills", "bluesurf-mine")));
    await assert.rejects(lstat(path.join(home, ".cursor", "skills", "bluesurf-ticket")));
  });

  it("writes .env from the example when .env is missing", async () => {
    const vault = path.join(root, "vault");
    await setup(options(["--all"], { env: { OBSIDIAN_VAULT: vault } }));
    assert.equal(
      await readFile(path.join(repoRoot, ".env"), "utf8"),
      `BLUESURF_ORIGIN=https://surf.bluepeople.com\nOBSIDIAN_VAULT=${vault}\n`,
    );
  });

  it("asks for the vault path when .env is missing and OBSIDIAN_VAULT is unset", async () => {
    const vault = path.join(root, "vault");
    let asked = "";
    await setup(options(["--cursor"], {
      env: {},
      prompt: async (message) => {
        asked = message;
        return vault;
      },
    }));
    assert.match(asked, /OBSIDIAN_VAULT/);
    assert.match(await readFile(path.join(repoRoot, ".env"), "utf8"), new RegExp(`OBSIDIAN_VAULT=${vault}`));
  });

  it("refuses to invent a vault path when there is no terminal", async () => {
    await assert.rejects(
      () => setup(options(["--cursor"], { env: {}, stdinIsTTY: false })),
      /OBSIDIAN_VAULT/,
    );
    await assert.rejects(lstat(path.join(repoRoot, ".env")));
  });

  it("warns when an existing .env still has the example vault path", async () => {
    await writeFile(
      path.join(repoRoot, ".env"),
      "OBSIDIAN_VAULT=/path/to/your/BluePeople/vault\n",
    );
    const result = await setup(options(["--cursor"]));
    assert.equal(
      await readFile(path.join(repoRoot, ".env"), "utf8"),
      "OBSIDIAN_VAULT=/path/to/your/BluePeople/vault\n",
    );
    assert.ok(result.warnings.some((warning) => warning.includes("/path/to/your/BluePeople/vault")));
  });

  it("warns when the vault path is a file", async () => {
    const file = path.join(root, "vault-file");
    await writeFile(file, "not a directory\n");
    const result = await setup(options(["--cursor"], { env: { OBSIDIAN_VAULT: file } }));
    assert.ok(result.warnings.some((warning) => warning.includes(file)));
  });

  it("warns when the vault directory does not exist yet", async () => {
    const missing = path.join(root, "not-synced-yet");
    const result = await setup(options(["--cursor"], { env: { OBSIDIAN_VAULT: missing } }));
    assert.ok(result.warnings.some((warning) => warning.includes(missing)));
    assert.match(await readFile(path.join(repoRoot, ".env"), "utf8"), new RegExp(`OBSIDIAN_VAULT=${missing}`));
  });

  it("installs Cursor rule files and a managed section for Codex and Claude", async () => {
    const result = await setup(options(["--all"]));
    assert.equal(
      await readFile(path.join(home, ".cursor", "rules", "no-push-until-i-say-so.mdc"), "utf8"),
      `---
description: No push until I say so
alwaysApply: true
---

Never push until asked.
`,
    );
    assert.equal(
      await readFile(path.join(home, ".cursor", "rules", "ask-questions-via-the-harness.mdc"), "utf8"),
      `---
description: Ask questions via the harness
alwaysApply: true
---

Ask in the harness.
`,
    );
    assert.equal(await readFile(path.join(home, ".codex", "AGENTS.md"), "utf8"), MANAGED);
    assert.equal(await readFile(path.join(home, ".claude", "CLAUDE.md"), "utf8"), MANAGED);
    assert.ok(result.warnings.some((warning) => warning.includes("No push until I say so") && warning.includes("Settings")));
    assert.ok(result.warnings.some((warning) => warning.includes("mattpocock-skills")));
  });

  it("replaces a rules file that is only the old copy", async () => {
    const agentsPath = path.join(home, ".codex", "AGENTS.md");
    await mkdir(path.dirname(agentsPath), { recursive: true });
    await writeFile(agentsPath, LEGACY_AGENTS);
    await setup(options(["--codex"]));
    assert.equal(await readFile(agentsPath, "utf8"), MANAGED);
  });

  it("keeps personal notes and names rules that still appear outside the managed section", async () => {
    const claudePath = path.join(home, ".claude", "CLAUDE.md");
    await mkdir(path.dirname(claudePath), { recursive: true });
    await writeFile(claudePath, "# Personal\n\nKeep this.\n\n## No push until I say so\n\nold copy\n");
    const result = await setup(options(["--claude"]));
    const text = await readFile(claudePath, "utf8");
    assert.ok(text.startsWith(MANAGED.trimEnd()));
    assert.match(text, /# Personal\n\nKeep this\./);
    assert.match(text, /old copy/);
    assert.ok(result.warnings.includes(
      "These rules are also outside the managed section. Remove the old copy: No push until I say so",
    ));
  });

  it("replaces only the managed section on a later run", async () => {
    const agentsPath = path.join(home, ".codex", "AGENTS.md");
    await mkdir(path.dirname(agentsPath), { recursive: true });
    await writeFile(agentsPath, `${MANAGED}\n# Personal\n\nKeep this.\n`);
    await writeFile(
      path.join(repoRoot, "rules", "no-push-until-i-say-so.md"),
      `---
title: No push until I say so
---

Never push until asked, including tags.
`,
    );
    await setup(options(["--codex"]));
    const text = await readFile(agentsPath, "utf8");
    assert.match(text, /Never push until asked, including tags\./);
    assert.match(text, /# Personal\n\nKeep this\./);
    assert.doesNotMatch(text, /bluesurf-tools:start[\s\S]*Never push until asked\.\n\n## Ask/);
  });

  it("leaves harnesses you did not select this time", async () => {
    await setup(options(["--all"]));
    const claudePath = path.join(home, ".claude", "CLAUDE.md");
    await writeFile(claudePath, `${MANAGED}KEEP-CLAUDE\n`);
    const cursorRule = path.join(home, ".cursor", "rules", "mine.mdc");
    await writeFile(cursorRule, "leave me\n");
    await setup(options(["--codex"]));
    assert.equal(await readFile(claudePath, "utf8"), `${MANAGED}KEEP-CLAUDE\n`);
    assert.equal(await readFile(cursorRule, "utf8"), "leave me\n");
    assert.equal(
      await readlink(path.join(home, ".claude", "skills", "bluesurf-ticket")),
      path.join(repoRoot, "skills", "bluesurf-ticket"),
    );
  });

  it("runs npm install, installs Matt Pocock skills, and logs in when the session file is missing", async () => {
    const calls = [];
    const result = await setup(options(["--all"], {
      nodeVersion: "v22.20.0",
      run: async (command, args, opts) => {
        calls.push({ command, args, cwd: opts.cwd });
        return { code: 0 };
      },
    }));
    assert.deepEqual(calls, [
      { command: "npm", args: ["install"], cwd: repoRoot },
      {
        command: "npx",
        args: ["--yes", "skills@latest", "add", "mattpocock/skills", "-g", "-y", "--skill", "*", "-a", "cursor", "-a", "codex", "-a", "claude-code"],
        cwd: repoRoot,
      },
      { command: "npm", args: ["run", "login"], cwd: repoRoot },
    ]);
    assert.equal(result.loggedIn, true);
  });

  it("installs Matt Pocock skills with skills@1.5.18 when Node is below 22.20", async () => {
    const calls = [];
    const result = await setup(options(["--claude"], {
      nodeVersion: "v20.19.4",
      run: async (command, args) => {
        calls.push([command, args[1], args[3]]);
        return { code: 0 };
      },
    }));
    assert.deepEqual(calls[1], ["npx", "skills@1.5.18", "mattpocock/skills"]);
    assert.ok(result.warnings.some((warning) => warning.includes("skills@1.5.18")));
  });

  it("skips login when .surf-cookies.json already exists", async () => {
    await writeFile(path.join(repoRoot, ".surf-cookies.json"), "{}\n");
    const calls = [];
    const result = await setup(options(["--claude"], {
      run: async (command, args) => {
        calls.push([command, args[0]]);
        return { code: 0 };
      },
    }));
    assert.deepEqual(calls, [
      ["npm", "install"],
      ["npx", "--yes"],
    ]);
    assert.equal(result.loggedIn, false);
  });

  it("does not log in when Matt Pocock install fails", async () => {
    const calls = [];
    await assert.rejects(
      () => setup(options(["--all"], {
        nodeVersion: "v20.19.4",
        run: async (command, args) => {
          calls.push([command, args[0]]);
          if (command === "npx") return { code: 1, stderr: "nope" };
          return { code: 0 };
        },
      })),
      /skills@1\.5\.18/,
    );
    assert.deepEqual(calls, [
      ["npm", "install"],
      ["npx", "--yes"],
    ]);
    await assert.rejects(lstat(path.join(home, ".agents", "skills", "bluesurf-ticket")));
  });

  it("leaves an existing .env untouched", async () => {
    const envPath = path.join(repoRoot, ".env");
    await writeFile(envPath, "OBSIDIAN_VAULT=/already\n");
    await setup(options(["--all"], { env: { OBSIDIAN_VAULT: path.join(root, "vault") } }));
    assert.equal(await readFile(envPath, "utf8"), "OBSIDIAN_VAULT=/already\n");
  });

  function options(args, extras = {}) {
    return {
      args,
      repoRoot,
      home,
      env: { OBSIDIAN_VAULT: path.join(root, "vault") },
      stdinIsTTY: true,
      prompt: async () => {
        throw new Error("prompt was not expected");
      },
      run: async () => ({ code: 0 }),
      ...extras,
    };
  }
});
