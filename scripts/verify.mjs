import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.js";
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

let plan;
try {
  plan = await collectVerifyPlan({
    workspace,
    repoNames: parsed.repos,
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
  if (!parsed.mode) {
    console.error("Pass --mode stack or --mode individual with --save.");
    process.exit(1);
  }
  const envPath = path.join(root, ".env");
  const current = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  await writeFile(envPath, upsertEnvAssignments(current, {
    RLAND_RUN_MODE: parsed.mode,
    RLAND_RUNNER: parsed.mode === "stack" ? (parsed.runner || plan.run.runner || "") : "",
  }));
  notes.push(`Saved RLAND_RUN_MODE=${parsed.mode} in ${envPath}`);
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
const outcome = await runVerifyPlan(plan, runCommand);
if (parsed.json) {
  emitCli({ json: true, payload: { ...plan, outcome }, notes });
} else {
  for (const result of outcome.results) {
    console.log(`${result.repo}: exit ${result.code}`);
  }
  if (outcome.blocked.length > 0) {
    console.error(`Skipped (cannot run): ${outcome.blocked.join(", ")}`);
  }
  if (!plan.workspace) {
    console.error("Cannot run without a workspace. Set RLAND_ROOT.");
  }
  if (plan.checks.length === 0) {
    console.error("Nothing to run. Name a repo.");
  }
}
process.exit(outcome.ok ? 0 : 1);

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
