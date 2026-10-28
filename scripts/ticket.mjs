import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.js";
import { parseTicketKey } from "../src/model.js";
import { createSessionClient } from "../src/session.js";
import { createVault } from "../src/vault.js";
import { exportTicket } from "../src/export-ticket.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(path.join(root, ".env"));

const code = process.argv[2];
if (!code) {
  console.error("Usage: npm run ticket -- PRY-XXX");
  process.exit(1);
}
parseTicketKey(code);

const vaultRoot = process.env.OBSIDIAN_VAULT;
if (!vaultRoot) {
  console.error("Set OBSIDIAN_VAULT in .env");
  process.exit(1);
}

const headless = process.env.BLUESURF_HEADED !== "1";
const client = await createSessionClient({
  origin: process.env.BLUESURF_ORIGIN,
  headless,
});

try {
  const result = await exportTicket({
    client,
    vault: createVault({
      root: vaultRoot,
      ticketsDir: process.env.OBSIDIAN_TICKETS_DIR ?? "RLand/Tickets",
    }),
    code,
  });
  console.log(`Wrote ${result.notePath}`);
  if (result.attachments.length === 0) {
    console.log("No attachments.");
  }
  for (const file of result.attachments) {
    console.log(`Wrote ${file}`);
  }
} finally {
  await client.close();
}
