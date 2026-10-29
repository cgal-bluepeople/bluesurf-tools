import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyRepoUpdate,
  formatSyncPlan,
  parseSyncArgs,
  planRepoUpdate,
  resolveSyncTarget,
} from "../src/sync.js";

describe("parseSyncArgs", () => {
  it("reads flags and repo names", () => {
    assert.deepEqual(parseSyncArgs(["--save", "--yes", "--base", "dev", "rland-ui"]), {
      yes: true,
      json: false,
      save: true,
      root: null,
      base: "dev",
      repos: ["rland-ui"],
    });
  });
});

describe("resolveSyncTarget", () => {
  it("uses the saved repo list and does not take the discovered one", () => {
    const target = resolveSyncTarget({
      env: { RLAND_REPOS: "rland-core, rland-ui", RLAND_BASE: "dev" },
      discovered: ["rland-auth", "somewhere-else"],
    });
    assert.deepEqual(target.repos, ["rland-core", "rland-ui"]);
    assert.equal(target.source, "config");
    assert.equal(target.needsSave, false);
  });

  it("discovers only when nothing is saved", () => {
    const target = resolveSyncTarget({ discovered: ["rland-core"] });
    assert.equal(target.needsSave, true);
    assert.deepEqual(target.repos, ["rland-core"]);
    assert.match(formatSyncPlan({ workspace: "/work", target, repos: [] }), /--save/);
  });
});

describe("planRepoUpdate", () => {
  const base = { repo: "rland-core", branch: "dev", dirty: false, base: "dev", hasBase: true, ahead: 0, behind: 0 };

  it("fast-forwards a clean base that is behind", () => {
    assert.equal(planRepoUpdate({ ...base, behind: 2 }).action, "fast-forward");
  });

  it("stashes a dirty tree before integrating", () => {
    assert.equal(planRepoUpdate({ ...base, dirty: true, behind: 1 }).action, "stash-integrate");
  });

  it("merges when both sides moved, and skips a repo with no base", () => {
    assert.equal(planRepoUpdate({ ...base, ahead: 1, behind: 1 }).action, "merge");
    assert.equal(planRepoUpdate({ ...base, hasBase: false }).action, "skip");
  });

  it("updates the base ref without checking it out when another branch is current", () => {
    assert.equal(planRepoUpdate({ ...base, branch: "RLD-1-thing", behind: 3 }).action, "update-base");
  });
});

describe("applyRepoUpdate", () => {
  it("fast-forwards with git merge --ff-only", async () => {
    const calls = [];
    const result = await applyRepoUpdate({
      cwd: "/repo",
      base: "dev",
      dirty: false,
      plan: { repo: "rland-core", action: "fast-forward", reason: "fast-forward 1 commit" },
      git: async (cwd, args) => {
        calls.push(args);
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [["merge", "--ff-only", "origin/dev"]]);
  });

  it("aborts a conflicting merge and restores a stash", async () => {
    const calls = [];
    const result = await applyRepoUpdate({
      cwd: "/repo",
      base: "dev",
      dirty: true,
      plan: { repo: "rland-ui", action: "stash-integrate", reason: "dirty" },
      git: async (cwd, args) => {
        calls.push(args.join(" "));
        if (args[0] === "merge") return { code: 1, stdout: "", stderr: "CONFLICT" };
        if (args.includes("--diff-filter=U")) return { code: 0, stdout: "apps/rland-web/AGENTS.md\n", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.action, "conflict");
    assert.deepEqual(result.files, ["apps/rland-web/AGENTS.md"]);
    assert.ok(calls.includes("merge --abort"));
    assert.ok(calls.includes("stash pop"));
  });
});
