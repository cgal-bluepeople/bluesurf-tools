import { access, readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseTicketKey } from "./model.js";
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
  { id: "mcp", url: "http://127.0.0.1:8082/health", required: false },
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
    repo: "rland-mcp",
    kind: "node",
    command: "pnpm",
    args: ["test"],
    summary: "Vitest. The running flow is the MCP server on port 8082 (compose profile mcp).",
    flowServices: ["mcp"],
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
  const playwright = argv.includes("--playwright") || argv.includes("--ticket");
  let root;
  let mode = null;
  let runner = null;
  let ticket = null;
  let appUrl = null;
  const repos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "--json" || arg === "--save" || arg === "--playwright") continue;
    if (arg === "--root" || arg === "--mode" || arg === "--runner" || arg === "--ticket" || arg === "--app-url") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Usage: npm run verify -- [--json] [--yes] [--save] [--playwright] [--app-url url] [--ticket PRY-XXX] [--mode stack|individual] [--runner repo] [--root path] [repo...]");
      }
      if (arg === "--root") root = value;
      if (arg === "--mode") mode = value;
      if (arg === "--runner") runner = value;
      if (arg === "--ticket") ticket = value;
      if (arg === "--app-url") appUrl = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
    repos.push(arg);
  }
  if (ticket) parseTicketKey(ticket);
  return {
    yes,
    json,
    save,
    playwright: playwright || Boolean(ticket) || Boolean(appUrl),
    root,
    mode,
    runner,
    ticket,
    appUrl,
    repos,
  };
}

/** `repo|command|service,service` entries, separated by `;`. Blank services means none. */
export function parseCheckList(text) {
  if (!text || !text.trim()) return [];
  return text.split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const parts = entry.split("|").map((part) => part.trim());
    const [repo, command, services = ""] = parts;
    if (!repo || !command || parts.length > 3) {
      throw new Error(`Bad RLAND_CHECKS entry "${entry}". Use repo|command|service,service`);
    }
    const [bin, ...args] = command.split(/\s+/);
    const flowServices = services
      ? services.split(",").map((id) => id.trim()).filter(Boolean)
      : null;
    return {
      repo,
      kind: kindForCommand(bin, args),
      command: bin,
      args,
      summary: "Configured in RLAND_CHECKS.",
      flowServices,
    };
  });
}

function kindForCommand(bin, args) {
  if ((bin === "pnpm" || bin === "npm") && args[0] === "test:e2e") return "playwright";
  if (bin === "pnpm" || bin === "npm") return "node";
  if (bin === "make") return "make";
  return "custom";
}

export function mergeChecks(base, extra) {
  const byRepo = new Map(base.map((check) => [check.repo, check]));
  for (const check of extra) byRepo.set(check.repo, check);
  return [...byRepo.values()];
}

/** `id|url|required` entries. `optional` is the only non-required flag. Blank means the built-in probes. */
export function parseProbeList(text) {
  if (!text || !text.trim()) return null;
  return text.split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [id, url, flag = "required"] = entry.split("|").map((part) => part.trim());
    if (!id || !url) throw new Error(`Bad RLAND_PROBES entry "${entry}". Use id|url|required`);
    return { id, url, required: flag !== "optional" };
  });
}

export function inferCheck({ repo, packageJson, makefile }) {
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson);
      const scripts = parsed.scripts ?? {};
      const bin = String(parsed.packageManager || "").startsWith("npm@") ? "npm" : "pnpm";
      if (scripts["test:e2e"]) {
        return checkFromCommand(repo, `${bin} test:e2e`, "Discovered from package.json.");
      }
      if (scripts.test) {
        return checkFromCommand(repo, `${bin} test`, "Discovered from package.json.");
      }
    } catch {
      // not JSON; fall through to the Makefile
    }
  }
  if (makefile && /^test:/m.test(makefile)) {
    return checkFromCommand(repo, "make test", "Discovered from the Makefile.");
  }
  return {
    repo,
    kind: "none",
    command: null,
    args: [],
    summary: "No automated suite.",
    flowServices: null,
  };
}

function checkFromCommand(repo, commandText, summary) {
  const [parsed] = parseCheckList(`${repo}|${commandText}`);
  return { ...parsed, summary };
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

function looksLikeRlandWorkspace(candidate, exists) {
  return exists(path.join(candidate, "rland-ui")) || exists(path.join(candidate, "rland-infra"));
}

export function resolveWorkspace({ repoRoot, env = {}, exists, siblingNames = [] }) {
  if (env.RLAND_ROOT) {
    if (!exists(env.RLAND_ROOT)) {
      throw new Error(`RLAND_ROOT does not exist: ${env.RLAND_ROOT}`);
    }
    return env.RLAND_ROOT;
  }
  const parent = path.dirname(repoRoot);
  const ownName = path.basename(repoRoot);
  const ordered = [
    ...WORKSPACE_DIR_NAMES,
    ...siblingNames.filter((name) => !WORKSPACE_DIR_NAMES.includes(name)),
  ];
  const candidates = [];
  for (const name of ordered) {
    if (!name || name.startsWith(".") || name === ownName) continue;
    const candidate = path.join(parent, name);
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  for (const candidate of candidates) {
    if (looksLikeRlandWorkspace(candidate, exists)) return candidate;
  }
  for (const candidate of candidates) {
    if (exists(path.join(candidate, ".bluesurf-workspace"))) return candidate;
  }
  if (looksLikeRlandWorkspace(parent, exists) || exists(path.join(parent, ".bluesurf-workspace"))) {
    return parent;
  }
  return null;
}

export function stackReport(results, probes = STACK_PROBES) {
  const checks = probes.map((probe) => {
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
  catalog = REPO_CHECKS,
}) {
  const named = repoNames.length > 0;
  const dirtySet = new Set(dirty);
  const existing = new Set(existingRepos);
  const files = new Set(existingFiles);
  const selected = named
    ? repoNames.map((repo) => catalog.find((check) => check.repo === repo) || unknownCheck(repo))
    : catalog.filter((check) => existing.has(check.repo) && dirtySet.has(check.repo));

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

  return { workspace, stack, run, checks, catalog: catalog.map((check) => check.repo) };
}

function unknownCheck(repo) {
  return {
    repo,
    kind: "unknown",
    command: null,
    args: [],
    summary: "Not in the catalog.",
    flowServices: null,
  };
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

  if (check.kind === "unknown") {
    return { ...base, canRun: false, reason: `unknown repo ${check.repo}` };
  }
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
    return { ...base, ...playwrightReadiness({ check, workspace, repo: check.repo, files, tools }) };
  }
  if (check.kind === "node") {
    return { ...base, ...nodeReadiness({ check, workspace, repo: check.repo, files, tools }) };
  }
  if (check.kind === "make") {
    return { ...base, ...makeReadiness({ workspace, repo: check.repo, files }) };
  }
  if (check.kind === "custom") {
    return { ...base, canRun: true, reason: null };
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

function playwrightReadiness({ check, workspace, repo, files, tools }) {
  const version = nodeReady(tools);
  if (version) return version;
  const bin = packageBinReady(check, tools);
  if (bin) return bin;
  const config = `${repo}/playwright.config.ts`;
  if (!files.has(config)) {
    return { canRun: false, reason: `${config} is missing under ${workspace}` };
  }
  return { canRun: true, reason: null };
}

function nodeReadiness({ check, workspace, repo, files, tools }) {
  const version = nodeReady(tools);
  if (version) return version;
  const bin = packageBinReady(check, tools);
  if (bin) return bin;
  const pkg = `${repo}/package.json`;
  if (!files.has(pkg)) {
    return { canRun: false, reason: `${pkg} is missing under ${workspace}` };
  }
  return { canRun: true, reason: null };
}

function nodeReady(tools) {
  const version = tools.nodeVersion ?? "";
  if (!nodeVersionAtLeast(version, 22, 0, 0)) {
    return {
      canRun: false,
      reason: `Node ${version || "unknown"} is below 22. Run: source ~/.nvm/nvm.sh && nvm use 22`,
    };
  }
  return null;
}

function packageBinReady(check, tools) {
  const bin = check.command || "pnpm";
  if (bin === "pnpm" && !tools.pnpm) return { canRun: false, reason: "pnpm is not on PATH" };
  if (bin === "npm" && !tools.npm) return { canRun: false, reason: "npm is not on PATH" };
  return null;
}

function makeReadiness({ workspace, repo, files }) {
  const makefile = `${repo}/Makefile`;
  if (!files.has(makefile)) {
    return { canRun: false, reason: `${makefile} is missing under ${workspace}` };
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
  lines.push("pnpm test:e2e starts its own servers and mocks the API. It is not the change or ticket browser test.");
  if (plan.playwright) {
    const flow = plan.playwright;
    const title = flow.ticket ? `Ticket ${flow.ticket}` : "Playwright change check";
    lines.push(flow.canRun
      ? `${title}: can run ${flow.baseUrl}`
      : `${title}: cannot run. ${flow.reason}`);
    for (const candidate of flow.candidates ?? []) {
      lines.push(`  ${candidate.id.padEnd(12)} ${candidate.url}`);
    }
    if ((flow.repos ?? []).length > 0) lines.push(`  repos        ${flow.repos.join(", ")}`);
    for (const step of flow.steps ?? []) {
      lines.push(`  ${step.source}`);
    }
  }
  lines.push("");
  lines.push("Checks:");
  if (plan.checks.length === 0) {
    const names = plan.catalog?.length ? plan.catalog : [...KNOWN];
    lines.push("  No dirty repos. Name one or more: " + names.join(", "));
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

export function emitCli({ json = false, payload, text, notes = [] } = {}, write = {}) {
  const out = write.out ?? console.log;
  const err = write.err ?? console.error;
  if (json) {
    for (const note of notes) {
      if (note) err(note);
    }
    out(JSON.stringify(payload));
    return;
  }
  if (text != null) out(text);
  for (const note of notes) {
    if (note) out(note);
  }
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
  const probes = parseProbeList(env.RLAND_PROBES) ?? STACK_PROBES;
  let catalog = mergeChecks(REPO_CHECKS, parseCheckList(env.RLAND_CHECKS || ""));
  if (!workspace) {
    return buildVerifyPlan({
      workspace: null,
      repoNames,
      catalog,
      stack: stackReport([], probes),
      run: resolveRunMode({ env, mode, runner }),
    });
  }
  for (const repo of repoNames) {
    if (catalog.some((check) => check.repo === repo)) continue;
    const dir = path.join(workspace, repo);
    if (!(await pathExists(dir))) {
      catalog = [...catalog, unknownCheck(repo)];
      continue;
    }
    const pkgPath = path.join(dir, "package.json");
    const makePath = path.join(dir, "Makefile");
    const packageJson = (await pathExists(pkgPath)) ? await readFile(pkgPath, "utf8") : null;
    const makefile = (await pathExists(makePath)) ? await readFile(makePath, "utf8") : null;
    catalog = [...catalog, inferCheck({ repo, packageJson, makefile })];
  }
  const existingRepos = [];
  const dirty = [];
  const existingFiles = [];
  const layoutFiles = [];
  for (const check of catalog) {
    if (check.kind === "unknown") continue;
    const dir = path.join(workspace, check.repo);
    if (!(await pathExists(dir))) continue;
    existingRepos.push(check.repo);
    if (await readGitDirty(dir)) dirty.push(check.repo);
    if ((check.kind === "playwright" || check.kind === "node") && (await pathExists(path.join(dir, "package.json")))) {
      existingFiles.push(`${check.repo}/package.json`);
    }
    if (check.kind === "playwright" && (await pathExists(path.join(dir, "playwright.config.ts")))) {
      existingFiles.push(`${check.repo}/playwright.config.ts`);
    }
    if ((check.kind === "go" || check.kind === "make") && (await pathExists(path.join(dir, "Makefile")))) {
      existingFiles.push(`${check.repo}/Makefile`);
    }
    for (const relative of LAYOUT_FILES) {
      const abs = path.join(dir, relative);
      if (!(await pathExists(abs))) continue;
      layoutFiles.push({ path: `${check.repo}/${relative}`, text: await readFile(abs, "utf8") });
    }
  }
  const results = await Promise.all(
    probes.map(async (item) => ({ id: item.id, up: await probe(item.url) })),
  );
  const needsNpm = catalog.some((check) => check.command === "npm");
  const [pnpm, go, npm] = await Promise.all([
    commandOnPath("pnpm"),
    commandOnPath("go"),
    needsNpm ? commandOnPath("npm") : Promise.resolve(false),
  ]);
  return buildVerifyPlan({
    workspace,
    repoNames,
    catalog,
    dirty,
    existingRepos,
    existingFiles,
    tools: { nodeVersion, pnpm, go, npm },
    stack: stackReport(results, probes),
    run: resolveRunMode({ env, discovery: discoverRunLayout(layoutFiles), mode, runner }),
  });
}
