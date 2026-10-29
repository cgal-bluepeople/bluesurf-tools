import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.js";
import {
  discoverAppUrls,
  formatPlaywrightReport,
  planPlaywright,
  playwrightForJson,
  resolveAppUrl,
  runPlaywrightSteps,
} from "../src/playwright-flow.js";
import { parseRepoList } from "../src/sync.js";
import { spawnSpec } from "../src/spawn-command.js";
import {
  collectVerifyPlan,
  emitCli,
  formatVerifyPlan,
  parseVerifyArgs,
  resolveWorkspace,
  runVerifyPlan,
  upsertEnvAssignments,
} from "../src/verify.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(path.join(root, ".env"));

let parsed;
try {
  parsed = parseVerifyArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const env = { ...process.env };
if (parsed.root) env.RLAND_ROOT = parsed.root;
if (parsed.mode) env.RLAND_RUN_MODE = parsed.mode;
if (parsed.runner) env.RLAND_RUNNER = parsed.runner;
let workspace;
try {
  workspace = resolveWorkspace({
    repoRoot: root,
    env,
    exists: existsSync,
    siblingNames: siblingNames(root),
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const savedPlaywrightRepos = parseRepoList(env.RLAND_PLAYWRIGHT_REPOS);
const repoNames = parsed.repos.length > 0
  ? parsed.repos
  : (parsed.playwright ? savedPlaywrightRepos : []);
const repoSource = parsed.repos.length > 0 ? "flag" : (repoNames.length > 0 ? "config" : "ask");
let plan;
try {
  plan = await collectVerifyPlan({
    workspace,
    repoNames,
    env,
    mode: parsed.mode,
    runner: parsed.runner,
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const notes = [];
if (parsed.save) {
  const assignments = {};
  if (parsed.mode) {
    assignments.RLAND_RUN_MODE = parsed.mode;
    assignments.RLAND_RUNNER = parsed.mode === "stack" ? (parsed.runner || plan.run.runner || "") : "";
  }
  if (parsed.appUrl) assignments.RLAND_APP_URL = resolveAppUrl({ env: { RLAND_APP_URL: parsed.appUrl } });
  if (parsed.playwright && parsed.repos.length > 0) {
    assignments.RLAND_PLAYWRIGHT_REPOS = parsed.repos.join(",");
  }
  if (Object.keys(assignments).length === 0) {
    console.error("Pass --mode, --app-url, or playwright repo names with --save.");
    process.exit(1);
  }
  const envPath = path.join(root, ".env");
  const current = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  await writeFile(envPath, upsertEnvAssignments(current, assignments));
  notes.push(`Saved ${Object.keys(assignments).join(", ")} in ${envPath}`);
}

if (parsed.playwright) {
  let loaded = null;
  if (parsed.ticket) {
    try {
      loaded = await loadTicketMarkdown(env, parsed.ticket);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
  plan.playwrightDir = loaded?.dir ?? path.join(root, ".scratch", "playwright");
  const urlSource = parsed.appUrl ? "flag" : (env.RLAND_APP_URL ? "config" : "ask");
  plan.playwright = planPlaywright({
    baseUrl: urlSource === "ask" ? null : resolveAppUrl({
      env: parsed.appUrl ? { ...env, RLAND_APP_URL: parsed.appUrl } : env,
      stack: plan.stack,
    }),
    candidates: discoverAppUrls(plan.stack),
    repos: repoNames,
    urlSource,
    repoSource,
    ticket: parsed.ticket,
    markdown: loaded?.markdown ?? "",
  });
}

if (!parsed.yes) {
  emitCli({
    json: parsed.json,
    payload: plan,
    text: formatVerifyPlan(plan),
    notes: [...notes, "Nothing ran. Re-run with --yes to run the checks that can."],
  });
  process.exit(0);
}

if (!parsed.json) {
  console.log(formatVerifyPlan(plan));
  for (const note of notes) console.log(note);
}
const suitePlan = parsed.playwright
  ? { ...plan, checks: plan.checks.filter((check) => check.kind !== "playwright") }
  : plan;
let outcome = { ok: true, results: [], blocked: [] };
if (!parsed.playwright || suitePlan.checks.length > 0) {
  outcome = await runVerifyPlan(suitePlan, runCommand);
}
let playwrightOutcome = null;
if (parsed.playwright) {
  playwrightOutcome = await runBrowser(plan);
  outcome = { ...outcome, ok: outcome.ok && playwrightOutcome.ok };
}
const payload = {
  ...plan,
  playwright: playwrightForJson(playwrightOutcome
    ? { ...plan.playwright, ...playwrightOutcome }
    : plan.playwright),
  outcome,
};
if (parsed.json) {
  emitCli({ json: true, payload, notes });
} else {
  for (const result of outcome.results) {
    console.log(`${result.repo}: exit ${result.code}`);
  }
  if (playwrightOutcome) {
    console.log(formatPlaywrightReport({
      ticket: plan.playwright?.ticket,
      baseUrl: plan.playwright?.baseUrl,
      results: playwrightOutcome.results,
    }));
    if (playwrightOutcome.reportPath) console.log(`Report: ${playwrightOutcome.reportPath}`);
  }
  if (outcome.blocked.length > 0) {
    console.error(`Skipped (cannot run): ${outcome.blocked.join(", ")}`);
  }
  if (!plan.workspace && !parsed.playwright) {
    console.error("Cannot run without a workspace. Set RLAND_ROOT.");
  }
  if (plan.checks.length === 0 && !parsed.playwright) {
    console.error("Nothing to run. Name a repo, or pass --playwright.");
  }
  if (playwrightOutcome && !playwrightOutcome.ok && playwrightOutcome.reason) {
    console.error(playwrightOutcome.reason);
  }
}
process.exit(outcome.ok ? 0 : 1);

async function loadTicketMarkdown(env, ticket) {
  const vault = env.OBSIDIAN_VAULT;
  if (!vault) throw new Error("Set OBSIDIAN_VAULT to validate a ticket.");
  const ticketsDir = env.OBSIDIAN_TICKETS_DIR || "RLand/Tickets";
  const dir = path.join(vault, ticketsDir, ticket, "validation");
  const checksFile = path.join(dir, "checks.md");
  const detail = path.join(vault, ticketsDir, ticket, "detail.md");
  if (existsSync(checksFile)) return { dir, markdown: await readFile(checksFile, "utf8") };
  if (existsSync(detail)) return { dir, markdown: await readFile(detail, "utf8") };
  return { dir, markdown: "" };
}

async function runBrowser(current) {
  const flow = current.playwright;
  if (!flow?.canRun) {
    return {
      ok: false,
      baseUrl: flow?.baseUrl ?? null,
      ticket: flow?.ticket ?? null,
      reason: flow?.reason ?? "playwright cannot run",
      results: flow?.steps ?? [],
    };
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: process.env.RLAND_HEADED !== "1" });
  try {
    const page = await browser.newPage();
    const ran = await runPlaywrightSteps({
      baseUrl: flow.baseUrl,
      steps: flow.steps,
      page: adaptPage(page),
    });
    await mkdir(current.playwrightDir, { recursive: true });
    let index = 0;
    for (const result of ran.results) {
      if (!result.screenshot) continue;
      index += 1;
      const file = `${String(index).padStart(2, "0")}-${result.op}.png`;
      await writeFile(path.join(current.playwrightDir, file), result.screenshot);
      result.file = file;
      delete result.screenshot;
    }
    const reportPath = path.join(current.playwrightDir, "report.md");
    await writeFile(reportPath, formatPlaywrightReport({
      ticket: flow.ticket,
      baseUrl: flow.baseUrl,
      results: ran.results,
    }));
    return { ...ran, reportPath, dir: current.playwrightDir };
  } finally {
    await browser.close();
  }
}

function adaptPage(page) {
  return {
    goto: (url, opts) => page.goto(url, opts),
    screenshot: (opts) => page.screenshot(opts),
    url: () => page.url(),
    see: async (text) => {
      try {
        await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    },
  };
}

function siblingNames(repoRoot) {
  try {
    return readdirSync(path.dirname(repoRoot));
  } catch {
    return [];
  }
}

function runCommand({ command, args, cwd }) {
  const spec = spawnSpec(command, args);
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { cwd, stdio: "inherit", ...spec.options });
    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
