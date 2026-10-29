import { access, readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { nodeVersionAtLeast } from "./skills-cli.js";
import { spawnSpec } from "./spawn-command.js";

export const WORKSPACE_DIR_NAMES = ["rland-new", "RLand", "rland"];

/** Host checks for the Docker stack. Playwright e2e does not use these. */
export const STACK_PROBES = [
  { id: "proxy", url: "http://127.0.0.1/", required: true },
  { id: "rland-web", url: "http://127.0.0.1:3000/health", required: true },
  { id: "loader-web", url: "http://127.0.0.1:3001/loader/health", required: false },
  { id: "auth", url: "http://127.0.0.1/api/auth/health", required: true },
  { id: "core", url: "http://127.0.0.1/api/core/health", required: true },
  { id: "collab", url: "http://127.0.0.1/api/collab/health", required: false },
  { id: "mock-oidc", url: "http://127.0.0.1:8091/health", required: false },
];

export const REPO_CHECKS = [
  {
    repo: "rland-ui",
    kind: "playwright",
    command: "pnpm",
    args: ["test:e2e"],
    summary: "Playwright e2e on ports 3100 and 3101. It mocks the API. The running flow is rland-web behind the infra proxy.",
    flowServices: ["proxy", "rland-web"],
  },
  {
    repo: "rland-core",
    kind: "go",
    command: "make",
    args: ["test"],
    summary: "Go tests. The running flow is core behind the infra proxy.",
    flowServices: ["proxy", "auth", "core"],
  },
  {
    repo: "rland-auth",
    kind: "go",
    command: "make",
    args: ["test"],
    summary: "Go tests. The running flow is auth and mock-oidc behind the infra proxy.",
    flowServices: ["proxy", "auth", "mock-oidc"],
  },
  {
    repo: "rland-collab",
    kind: "go",
    command: "make",
    args: ["test"],
    summary: "Go tests. The running flow is collab behind the infra proxy.",
    flowServices: ["proxy", "auth", "collab"],
  },
  {
    repo: "rland-commons",
    kind: "go",
    command: "make",
    args: ["test"],
    summary: "Go tests. Not a service in the infra stack.",
    flowServices: null,
  },
  {
    repo: "rland-ngam",
    kind: "go",
    command: "make",
    args: ["test"],
    summary: "Go tests. Infra runs ngam on the compose network only; it has no host port.",
    flowServices: null,
  },
  {
    repo: "rland-infra",
    kind: "stack",
    command: null,
    args: [],
    summary: "Starts the local stack with make local-up-detached. Other repos validate their flow through that stack.",
    flowServices: ["proxy", "rland-web", "auth", "core"],
  },
  {
    repo: "rland-sql",
    kind: "none",
    command: null,
    args: [],
    summary: "No automated suite. Not a service in the infra stack.",
    flowServices: null,
  },
];

const KNOWN = new Set(REPO_CHECKS.map((check) => check.repo));

export function parseVerifyArgs(argv) {
  const yes = argv.includes("--yes");
  const json = argv.includes("--json");
  const save = argv.includes("--save");
  let root;
  let mode = null;
  let runner = null;
  const repos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "--json" || arg === "--save") continue;
    if (arg === "--root" || arg === "--mode" || arg === "--runner") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Usage: npm run verify -- [--json] [--yes] [--save] [--mode stack|individual] [--runner repo] [--root path] [repo...]");
      }
      if (arg === "--root") root = value;
      if (arg === "--mode") mode = value;
      if (arg === "--runner") runner = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
    repos.push(arg);
  }
  for (const repo of repos) {
    if (!KNOWN.has(repo)) {
      throw new Error(`Unknown repo ${repo}. Options: ${[...KNOWN].join(", ")}`);
    }
  }
  return { yes, json, save, root, mode, runner, repos };
}

export function individualCommand(makefile, packageJson) {
  if (packageJson) {
    try {
      const scripts = JSON.parse(packageJson).scripts ?? {};
      if (scripts.dev) return "pnpm dev";
    } catch {
      // not JSON; ignore and fall through to the Makefile
    }
  }
  if (makefile && /^dev:/m.test(makefile)) return "make dev";
  if (makefile && /^run:/m.test(makefile)) return "make run";
  return null;
}

/** Find a compose repo that starts sibling repos, and each repo's own run command. */
export function discoverRunLayout(files) {
  const byRepo = new Map();
  for (const file of files) {
    const repo = file.path.split("/")[0];
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo).push(file);
  }
  const repoNames = [...byRepo.keys()];
  const runners = [];
  const individual = [];
  for (const repo of repoNames) {
    const own = byRepo.get(repo);
    const served = new Set();
    for (const file of own) {
      if (!isComposeFile(file.path)) continue;
      for (const match of file.text.matchAll(/\.\.\/\.\.\/([A-Za-z0-9_.-]+)/g)) {
        if (match[1] !== repo) served.add(match[1]);
      }
    }
    if (served.size > 0) {
      const makefile = own.find((file) => file.path.endsWith("/Makefile") || file.path === "Makefile");
      const command = makefile && /^local-up-detached:/m.test(makefile.text)
        ? "make local-up-detached"
        : "docker compose up";
      runners.push({ repo, command, serves: [...served].sort() });
    }
    const makefile = own.find((file) => file.path === `${repo}/Makefile`);
    const pkg = own.find((file) => file.path === `${repo}/package.json`);
    const command = individualCommand(makefile?.text, pkg?.text);
    if (command) individual.push({ repo, command });
  }
  runners.sort((left, right) => left.repo.localeCompare(right.repo));
  individual.sort((left, right) => left.repo.localeCompare(right.repo));
  return { runners, individual };
}

function isComposeFile(filePath) {
  const base = filePath.split("/").pop();
  return base.startsWith("docker-compose");
}

export function resolveRunMode({ env = {}, discovery = { runners: [], individual: [] }, mode = null, runner = null } = {}) {
  const chosen = mode || env.RLAND_RUN_MODE || "";
  if (chosen && chosen !== "stack" && chosen !== "individual") {
    throw new Error(`Unknown run mode ${chosen}. Options: stack, individual`);
  }
  const namedRunner = runner || env.RLAND_RUNNER || "";
  const source = mode ? "flag" : (env.RLAND_RUN_MODE ? "config" : null);
  if (chosen === "individual") {
    return { mode: "individual", runner: null, command: null, serves: [], needsChoice: false, source, discovery };
  }
  if (chosen === "stack") {
    const found = discovery.runners.find((item) => item.repo === namedRunner) || discovery.runners[0] || null;
    return {
      mode: "stack",
      runner: found?.repo || namedRunner || null,
      command: found?.command || null,
      serves: found?.serves || [],
      needsChoice: false,
      source,
      discovery,
    };
  }
  if (discovery.runners.length > 0 && discovery.individual.length > 0) {
    return { mode: null, runner: null, command: null, serves: [], needsChoice: true, source: "ask", discovery };
  }
  if (discovery.runners.length > 0) {
    const found = discovery.runners[0];
    return {
      mode: "stack",
      runner: found.repo,
      command: found.command,
      serves: found.serves,
      needsChoice: false,
      source: "discovered",
      discovery,
    };
  }
  return { mode: "individual", runner: null, command: null, serves: [], needsChoice: false, source: "discovered", discovery };
}

export function upsertEnvAssignments(text, assignments) {
  const lines = text.length > 0 ? text.split("\n") : [];
  if (lines.at(-1) === "") lines.pop();
  for (const [key, value] of Object.entries(assignments)) {
    const next = `${key}=${value}`;
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = next;
    else lines.push(next);
  }
  return `${lines.join("\n")}\n`;
}

export function resolveWorkspace({ repoRoot, env = {}, exists }) {
  if (env.RLAND_ROOT) {
    if (!exists(env.RLAND_ROOT)) {
      throw new Error(`RLAND_ROOT does not exist: ${env.RLAND_ROOT}`);
    }
    return env.RLAND_ROOT;
  }
  const parent = path.dirname(repoRoot);
  for (const name of WORKSPACE_DIR_NAMES) {
    const candidate = path.join(parent, name);
    if (exists(path.join(candidate, "rland-ui")) || exists(path.join(candidate, "rland-infra"))) {
      return candidate;
    }
  }
  if (exists(path.join(parent, "rland-ui")) || exists(path.join(parent, "rland-infra"))) {
    return parent;
  }
  return null;
}

export function stackReport(results) {
  const checks = STACK_PROBES.map((probe) => {
    const found = results.find((result) => result.id === probe.id);
    return { ...probe, up: Boolean(found?.up) };
  });
  return {
    ready: checks.filter((check) => check.required).every((check) => check.up),
    checks,
  };
}

const DEFAULT_RUN = {
  mode: "stack",
  runner: "rland-infra",
  command: "make local-up-detached",
  serves: [],
  needsChoice: false,
  source: "default",
  discovery: { runners: [], individual: [] },
};

export function buildVerifyPlan({
  workspace,
  repoNames = [],
  dirty = [],
  existingRepos = [],
  existingFiles = [],
  tools = {},
  stack = stackReport([]),
  run = DEFAULT_RUN,
}) {
  const named = repoNames.length > 0;
  const dirtySet = new Set(dirty);
  const existing = new Set(existingRepos);
  const files = new Set(existingFiles);
  const selected = named
    ? REPO_CHECKS.filter((check) => repoNames.includes(check.repo))
    : REPO_CHECKS.filter((check) => existing.has(check.repo) && dirtySet.has(check.repo));

  const checks = selected.map((check) => assessCheck(check, {
    workspace,
    named,
    dirty: dirtySet.has(check.repo),
    present: existing.has(check.repo),
    files,
    tools,
    stack,
    run,
  }));

  return { workspace, stack, run, checks };
}

function assessCheck(check, { workspace, named, dirty, present, files, tools, stack, run }) {
  const cwd = workspace ? path.join(workspace, check.repo) : null;
  const flow = assessFlow(check, stack, run);
  const base = {
    repo: check.repo,
    kind: check.kind,
    summary: check.summary,
    command: check.command ? [check.command, ...check.args].join(" ") : null,
    argv: check.command ? [check.command, ...check.args] : null,
    cwd,
    present,
    dirty,
    why: named ? "named" : "working tree has changes",
    flow,
  };

  if (!present) {
    return { ...base, canRun: false, reason: `repo not found at ${cwd}` };
  }
  if (check.kind === "stack") {
    return {
      ...base,
      canRun: flow.canRun,
      reason: flow.canRun ? null : flow.reason,
    };
  }
  if (check.kind === "none") {
    return { ...base, canRun: false, reason: "no automated suite" };
  }
  if (check.kind === "playwright") {
    return { ...base, ...playwrightReadiness({ workspace, repo: check.repo, files, tools }) };
  }
  return { ...base, ...goReadiness({ workspace, repo: check.repo, files, tools }) };
}

function assessFlow(check, stack, run) {
  if (run.needsChoice || !run.mode) {
    return { via: null, services: [], command: null, canRun: false, reason: "run mode is not chosen" };
  }
  if (run.mode === "individual") {
    const own = run.discovery?.individual?.find((item) => item.repo === check.repo);
    if (!own) return { via: null, services: [], command: null, canRun: false, reason: "no per-repo run command" };
    return { via: null, services: [], command: own.command, canRun: true, reason: null };
  }
  const runner = run.runner || "rland-infra";
  if (!check.flowServices) {
    const reason = check.repo === "rland-ngam"
      ? "ngam has no host port. The stack runner starts it on the compose network; core is the host-visible service that calls it."
      : "not a service in the stack";
    return { via: null, services: [], command: null, canRun: false, reason };
  }
  const down = check.flowServices.filter((id) => !stack.checks.find((item) => item.id === id)?.up);
  if (down.length > 0) {
    const start = run.command ? `: cd ${runner} && ${run.command}` : "";
    return {
      via: runner,
      services: check.flowServices,
      command: null,
      canRun: false,
      reason: `down: ${down.join(", ")}. ${runner} runs this stack${start}`,
    };
  }
  return { via: runner, services: check.flowServices, command: null, canRun: true, reason: null };
}

function playwrightReadiness({ workspace, repo, files, tools }) {
  const version = tools.nodeVersion ?? "";
  if (!nodeVersionAtLeast(version, 22, 0, 0)) {
    return {
      canRun: false,
      reason: `Node ${version || "unknown"} is below 22. Run: source ~/.nvm/nvm.sh && nvm use 22`,
    };
  }
  if (!tools.pnpm) return { canRun: false, reason: "pnpm is not on PATH" };
  const config = `${repo}/playwright.config.ts`;
  if (!files.has(config)) {
    return { canRun: false, reason: `${config} is missing under ${workspace}` };
  }
  return { canRun: true, reason: null };
}

function goReadiness({ workspace, repo, files, tools }) {
  if (!tools.go) return { canRun: false, reason: "go is not on PATH" };
  const makefile = `${repo}/Makefile`;
  if (!files.has(makefile)) {
    return { canRun: false, reason: `${makefile} is missing under ${workspace}` };
  }
  return { canRun: true, reason: null };
}

export function formatVerifyPlan(plan) {
  const lines = [];
  if (!plan.workspace) {
    lines.push("Workspace: not found. Set RLAND_ROOT to the directory that contains rland-ui and rland-infra.");
  } else {
    lines.push(`Workspace: ${plan.workspace}`);
  }
  lines.push("");
  lines.push("Local stack:");
  for (const check of plan.stack.checks) {
    const state = check.up ? "up  " : "down";
    const mark = check.required ? "" : " (optional)";
    lines.push(`  ${check.id.padEnd(12)} ${state}  ${check.url}${mark}`);
  }
  lines.push(
    plan.stack.ready
      ? "Real flow against localhost: ready (proxy, rland-web, auth, core)."
      : "Real flow against localhost: not ready.",
  );
  lines.push(...formatRunMode(plan.run));
  lines.push("Playwright e2e does not use this stack. It starts its own servers and mocks the API.");
  lines.push("");
  lines.push("Checks:");
  if (plan.checks.length === 0) {
    lines.push("  No dirty repos. Name one or more: " + [...KNOWN].join(", "));
  } else {
    for (const check of plan.checks) {
      const verdict = check.canRun ? "can run    " : "cannot run ";
      const detail = check.canRun ? check.why : check.reason;
      const command = check.command ?? "(no command)";
      lines.push(`  ${check.repo.padEnd(16)} ${command.padEnd(16)} ${verdict} ${detail}`);
      const flowVerdict = check.flow.canRun ? "can run    " : "cannot run ";
      const flowDetail = check.flow.canRun
        ? (check.flow.services.length > 0 ? check.flow.services.join(", ") : check.flow.command)
        : check.flow.reason;
      const flowLabel = check.flow.via ? `flow via ${check.flow.via}` : "flow";
      lines.push(`  ${"".padEnd(16)} ${flowLabel.padEnd(16)} ${flowVerdict} ${flowDetail}`);
    }
  }
  return lines.join("\n");
}

function formatRunMode(run) {
  if (!run) return ["Run mode: stack via rland-infra."];
  if (run.needsChoice) {
    const lines = ["Run mode: not chosen. Ask stack or individual."];
    for (const runner of run.discovery?.runners ?? []) {
      lines.push(`  stack        ${runner.repo}  ${runner.command}  serves ${runner.serves.join(", ")}`);
    }
    for (const item of run.discovery?.individual ?? []) {
      lines.push(`  individual   ${item.repo}  ${item.command}`);
    }
    return lines;
  }
  if (run.mode === "individual") {
    return [`Run mode: individual (${run.source}). Each repo runs its own command.`];
  }
  const runner = run.runner || "rland-infra";
  return [`Run mode: stack via ${runner} (${run.source}). Each repo's flow uses its own services on that stack.`];
}

export async function runVerifyPlan(plan, run) {
  if (plan.run?.needsChoice) {
    return { ok: false, results: [], blocked: plan.checks.map((check) => check.repo) };
  }
  const blocked = [];
  const results = [];
  for (const check of plan.checks) {
    if (check.argv) {
      if (!check.canRun) {
        blocked.push(check.repo);
        continue;
      }
      const code = await run({ command: check.argv[0], args: check.argv.slice(1), cwd: check.cwd });
      results.push({ repo: check.repo, kind: "suite", code: code ?? 1 });
      continue;
    }
    if (check.flow?.canRun) {
      results.push({ repo: check.repo, kind: "flow", code: 0 });
      continue;
    }
    blocked.push(check.repo);
  }
  const passed = results.length > 0 && results.every((result) => result.code === 0);
  return {
    ok: Boolean(plan.workspace) && blocked.length === 0 && passed,
    results,
    blocked,
  };
}

export function probeUrl(url, { timeoutMs = 3000 } = {}) {
  const lib = url.startsWith("https:") ? https : http;
  return new Promise((resolve) => {
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(typeof res.statusCode === "number" && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function commandOnPath(name) {
  const spec = spawnSpec(name, ["--version"]);
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { stdio: "ignore", ...spec.options });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

export function readGitDirty(repoPath) {
  return new Promise((resolve) => {
    const child = spawn("git", ["status", "--porcelain"], { cwd: repoPath, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0 && out.trim().length > 0));
  });
}

const LAYOUT_FILES = [
  "Makefile",
  "package.json",
  "docker-compose.yml",
  "deploy/docker-compose.yml",
  "deploy/docker-compose.local.yml",
];

export async function collectVerifyPlan({
  workspace,
  repoNames,
  probe = probeUrl,
  nodeVersion = process.version,
  env = {},
  mode = null,
  runner = null,
}) {
  if (!workspace) {
    return buildVerifyPlan({
      workspace: null,
      repoNames,
      stack: stackReport([]),
      run: resolveRunMode({ env, mode, runner }),
    });
  }
  const existingRepos = [];
  const dirty = [];
  const existingFiles = [];
  const layoutFiles = [];
  for (const check of REPO_CHECKS) {
    const dir = path.join(workspace, check.repo);
    if (!(await pathExists(dir))) continue;
    existingRepos.push(check.repo);
    if (await readGitDirty(dir)) dirty.push(check.repo);
    if (check.kind === "playwright" && (await pathExists(path.join(dir, "playwright.config.ts")))) {
      existingFiles.push(`${check.repo}/playwright.config.ts`);
    }
    if (check.kind === "go" && (await pathExists(path.join(dir, "Makefile")))) {
      existingFiles.push(`${check.repo}/Makefile`);
    }
    for (const relative of LAYOUT_FILES) {
      const abs = path.join(dir, relative);
      if (!(await pathExists(abs))) continue;
      layoutFiles.push({ path: `${check.repo}/${relative}`, text: await readFile(abs, "utf8") });
    }
  }
  const results = await Promise.all(
    STACK_PROBES.map(async (item) => ({ id: item.id, up: await probe(item.url) })),
  );
  const [pnpm, go] = await Promise.all([commandOnPath("pnpm"), commandOnPath("go")]);
  return buildVerifyPlan({
    workspace,
    repoNames,
    dirty,
    existingRepos,
    existingFiles,
    tools: { nodeVersion, pnpm, go },
    stack: stackReport(results),
    run: resolveRunMode({ env, discovery: discoverRunLayout(layoutFiles), mode, runner }),
  });
}
