import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.js";
import { createSessionClient } from "../src/session.js";
import { createVault } from "../src/vault.js";
import { exportSprint } from "../src/export-sprint.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(path.join(root, ".env"));

const vaultRoot = process.env.OBSIDIAN_VAULT;
if (!vaultRoot) {
  console.error("Set OBSIDIAN_VAULT in .env");
  process.exit(1);
}

const projectCode = process.argv[2] ?? process.env.BLUESURF_PROJECT ?? "RLD";
const headless = process.env.BLUESURF_HEADED !== "1";
const client = await createSessionClient({
  origin: process.env.BLUESURF_ORIGIN,
  headless,
});

try {
  const result = await exportSprint({
    client,
    vault: createVault({
      root: vaultRoot,
      ticketsDir: process.env.OBSIDIAN_TICKETS_DIR ?? "RLand/Tickets",
      sprintsDir: process.env.OBSIDIAN_SPRINTS_DIR ?? "RLand/Sprints",
    }),
    projectCode,
  });
  console.log(`Wrote ${result.notePath}`);
  if (result.rows.length === 0) {
    console.log("No assigned tickets on the current sprint.");
  }
  for (const row of result.rows) {
    console.log(`${row.code}  ${row.estimatedHours}h  ${row.title}`);
  }
} finally {
  await client.close();
}
