export function parseSyncArgs(argv) {
  const yes = argv.includes("--yes");
  const json = argv.includes("--json");
  const save = argv.includes("--save");
  let root = null;
  let base = null;
  const repos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "--json" || arg === "--save") continue;
    if (arg === "--root" || arg === "--base") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Usage: npm run sync -- [--json] [--yes] [--save] [--base dev] [--root path] [repo...]");
      }
      if (arg === "--root") root = value;
      if (arg === "--base") base = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
    repos.push(arg);
  }
  return { yes, json, save, root, base, repos };
}

export function parseRepoList(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Configured repos win. Discovery runs only when RLAND_REPOS is unset. */
export function resolveSyncTarget({ env = {}, discovered = [], base = null, repos = [] } = {}) {
  const resolvedBase = base || env.RLAND_BASE || "dev";
  if (repos.length > 0) {
    return { base: resolvedBase, repos, source: "flag", needsSave: false };
  }
  const configured = parseRepoList(env.RLAND_REPOS);
  if (configured.length > 0) {
    return { base: resolvedBase, repos: configured, source: "config", needsSave: false };
  }
  return { base: resolvedBase, repos: [...discovered], source: "discovered", needsSave: true };
}

export function planRepoUpdate({ repo, branch, dirty, base, hasBase, ahead, behind }) {
  if (!hasBase) {
    return { repo, action: "skip", reason: `no origin/${base}` };
  }
  if (branch !== base) {
    return {
      repo,
      action: "update-base",
      reason: `on ${branch}; update local ${base} from origin/${base} without checking it out`,
    };
  }
  if (behind === 0 && ahead === 0) {
    return { repo, action: "current", reason: `already at origin/${base}` };
  }
  if (ahead > 0 && behind === 0) {
    return { repo, action: "local-ahead", reason: `local ${base} has commits not on origin/${base}` };
  }
  if (dirty) {
    return { repo, action: "stash-integrate", reason: "dirty working tree; stash, integrate origin, restore" };
  }
  if (ahead === 0) {
    return { repo, action: "fast-forward", reason: `fast-forward ${behind} commit${behind === 1 ? "" : "s"}` };
  }
  return { repo, action: "merge", reason: "local commits and origin both moved; merge, stop if the merge conflicts" };
}

export function formatSyncPlan({ workspace, target, repos }) {
  const lines = [];
  if (!workspace) {
    lines.push("Workspace: not found. Set RLAND_ROOT.");
  } else {
    lines.push(`Workspace: ${workspace}`);
  }
  lines.push(`Base: ${target.base} (${target.source})`);
  if (target.needsSave) {
    lines.push("Repo list is not saved. Pass --save to store RLAND_REPOS and RLAND_BASE and skip discovery next time.");
  }
  lines.push("");
  if (repos.length === 0) {
    lines.push("No repos.");
  }
  for (const repo of repos) {
    lines.push(`  ${repo.repo.padEnd(22)} ${repo.action.padEnd(16)} ${repo.reason}`);
  }
  return lines.join("\n");
}

export async function applyRepoUpdate({ cwd, base, plan, dirty, git }) {
  if (plan.action === "skip" || plan.action === "current" || plan.action === "local-ahead") {
    return { ...plan, ok: plan.action !== "skip", applied: false };
  }
  if (plan.action === "update-base") {
    const updated = await git(cwd, ["fetch", "origin", `${base}:${base}`]);
    if (updated.code !== 0) {
      return {
        ...plan,
        action: "diverged",
        ok: false,
        applied: false,
        reason: `local ${base} is not a fast-forward of origin/${base}. Not overwriting it.`,
      };
    }
    return { ...plan, ok: true, applied: true };
  }
  if (dirty) {
    const stashed = await git(cwd, ["stash", "push", "-u", "-m", "bluesurf-sync"]);
    if (stashed.code !== 0) return failed(plan, "could not stash local changes");
  }
  const integrated = await integrate(cwd, base, git);
  if (!integrated.ok) {
    if (dirty) await git(cwd, ["stash", "pop"]);
    return { ...plan, ...integrated, applied: false };
  }
  if (!dirty) return { ...plan, ok: true, applied: true };
  const restored = await git(cwd, ["stash", "pop"]);
  if (restored.code !== 0) {
    const files = await conflictFiles(cwd, git);
    return {
      ...plan,
      action: "conflict",
      ok: false,
      applied: true,
      reason: `origin/${base} is in, and restoring local changes conflicted: ${files.join(", ") || "see git status"}`,
      files,
    };
  }
  return { ...plan, ok: true, applied: true };
}

async function integrate(cwd, base, git) {
  const fast = await git(cwd, ["merge", "--ff-only", `origin/${base}`]);
  if (fast.code === 0) return { ok: true };
  const merged = await git(cwd, ["merge", "--no-edit", `origin/${base}`]);
  if (merged.code === 0) return { ok: true };
  const files = await conflictFiles(cwd, git);
  await git(cwd, ["merge", "--abort"]);
  return {
    action: "conflict",
    ok: false,
    reason: `merge with origin/${base} conflicts: ${files.join(", ") || merged.stderr || "see git status"}. The merge was aborted.`,
    files,
  };
}

async function conflictFiles(cwd, git) {
  const listed = await git(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  return listed.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function failed(plan, reason) {
  return { ...plan, action: "error", ok: false, applied: false, reason };
}
