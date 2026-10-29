import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.js";
import { upsertEnvAssignments } from "../src/verify.js";
import { resolveWorkspace } from "../src/verify.js";
import {
  applyRepoUpdate,
  formatSyncPlan,
  parseSyncArgs,
  planRepoUpdate,
  resolveSyncTarget,
} from "../src/sync.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(path.join(root, ".env"));

let parsed;
try {
  parsed = parseSyncArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const env = { ...process.env };
if (parsed.root) env.RLAND_ROOT = parsed.root;
if (parsed.base) env.RLAND_BASE = parsed.base;
let workspace;
try {
  workspace = resolveWorkspace({ repoRoot: root, env, exists: existsSync });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const discovered = env.RLAND_REPOS || parsed.repos.length > 0
  ? []
  : await discoverBaseRepos(workspace, parsed.base || env.RLAND_BASE || "dev");
const target = resolveSyncTarget({
  env,
  discovered,
  base: parsed.base,
  repos: parsed.repos,
});

if (!workspace) {
  console.error("Workspace not found. Set RLAND_ROOT.");
  process.exit(1);
}

const inspected = [];
for (const repo of target.repos) {
  const cwd = path.join(workspace, repo);
  if (!existsSync(path.join(cwd, ".git"))) {
    inspected.push({ repo, action: "skip", reason: "not a git repo" });
    continue;
  }
  const fetched = await git(cwd, ["fetch", "origin", target.base]);
  if (fetched.code !== 0) {
    inspected.push({ repo, action: "error", reason: fetched.stderr.trim() || "fetch failed" });
    continue;
  }
  inspected.push(await inspectRepo(cwd, repo, target.base));
}

const plan = { workspace, target, repos: inspected };
if (parsed.json) console.log(JSON.stringify(plan, null, 2));
else console.log(formatSyncPlan(plan));

if (parsed.save) {
  const envPath = path.join(root, ".env");
  const current = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  await writeFile(envPath, upsertEnvAssignments(current, {
    RLAND_BASE: target.base,
    RLAND_REPOS: target.repos.join(","),
  }));
  console.log(`Saved RLAND_BASE=${target.base} and RLAND_REPOS in ${envPath}`);
}

if (!parsed.yes) {
  console.log("");
  console.log("Nothing changed. Re-run with --yes to update.");
  process.exit(0);
}

let failed = false;
for (const item of inspected) {
  if (item.action === "skip" || item.action === "error") {
    if (item.action === "error") failed = true;
    continue;
  }
  const cwd = path.join(workspace, item.repo);
  const dirty = item.dirty;
  const result = await applyRepoUpdate({ cwd, base: target.base, plan: item, dirty, git });
  console.log(`${result.repo}: ${result.ok ? "ok" : "failed"} ${result.action}${result.applied ? "" : " (not applied)"} — ${result.reason}`);
  if (!result.ok) failed = true;
}
process.exit(failed ? 1 : 0);

async function discoverBaseRepos(workspace, base) {
  if (!workspace) return [];
  const names = await readdir(workspace);
  const found = [];
  for (const name of names) {
    const cwd = path.join(workspace, name);
    if (!existsSync(path.join(cwd, ".git"))) continue;
    const verified = await git(cwd, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`]);
    if (verified.code === 0) found.push(name);
  }
  return found.sort();
}

async function inspectRepo(cwd, repo, base) {
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  const dirty = (await git(cwd, ["status", "--porcelain"])).stdout.trim().length > 0;
  const hasBase = (await git(cwd, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).code === 0;
  let ahead = 0;
  let behind = 0;
  if (hasBase) {
    const counts = await git(cwd, ["rev-list", "--left-right", "--count", `${branch}...origin/${base}`]);
    const [left, right] = counts.stdout.trim().split(/\s+/).map(Number);
    if (branch === base) {
      ahead = left || 0;
      behind = right || 0;
    } else {
      const baseCounts = await git(cwd, ["rev-list", "--left-right", "--count", `${base}...origin/${base}`]);
      const [baseAhead, baseBehind] = baseCounts.stdout.trim().split(/\s+/).map(Number);
      ahead = baseAhead || 0;
      behind = baseBehind || 0;
    }
  }
  return { ...planRepoUpdate({ repo, branch, dirty, base, hasBase, ahead, behind }), dirty, branch };
}

function git(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: 1, stdout: "", stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
