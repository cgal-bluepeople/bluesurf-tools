import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_ORDER, harnessesFromArgs, linkBlueSurfSkills } from "../src/setup.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = { cursor: "Cursor", codex: "Codex", claude: "Claude Code" };

try {
  const args = process.argv.slice(2);
  const harnesses = args.length === 0 ? [...HARNESS_ORDER] : harnessesFromArgs(args);
  const skills = await linkBlueSurfSkills({
    repoRoot,
    home: os.homedir(),
    harnesses,
  });
  console.log(`Linked ${skills.join(", ")} for ${harnesses.map((h) => names[h]).join(", ")} and ~/.agents/skills.`);
  console.log("Open a new chat so each harness reloads skills.");
} catch (error) {
  if (error.message?.includes("is not a symlink")) {
    console.error(`${error.message}\nRemove or rename that folder, then run link-skills again.`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
