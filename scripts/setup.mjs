import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setup } from "../src/setup.js";
import { spawnSpec } from "../src/spawn-command.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = { cursor: "Cursor", codex: "Codex", claude: "Claude Code" };

function run(command, args, { cwd }) {
  const spec = spawnSpec(command, args);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(spec.command, spec.args, { cwd, stdio: "inherit", ...spec.options });
    child.on("error", (error) => finish({ code: 1, stderr: error.message }));
    child.on("close", (code) => finish({ code: code ?? 1 }));
  });
}

const rl = readline.createInterface({ input, output });

try {
  const result = await setup({
    args: process.argv.slice(2),
    repoRoot,
    home: os.homedir(),
    env: process.env,
    stdinIsTTY: Boolean(input.isTTY),
    prompt: (message) => rl.question(`${message}\n`),
    run,
  });
  for (const warning of result.warnings) console.warn(warning);
  console.log(`Installed ${result.harnesses.map((harness) => names[harness]).join(", ")}.`);
  console.log(result.loggedIn
    ? "Surf login finished."
    : "Surf session file is already present. Skipped login.");
  console.log("Open a new chat so the harness loads the skills and rules.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
