import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.js";
import { parseTicketKey } from "../src/model.js";
import { createVault } from "../src/vault.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(path.join(root, ".env"));

const code = process.argv[2];
if (!code) {
  console.error("Usage: npm run ticket-done -- PRY-XXX");
  process.exit(1);
}
parseTicketKey(code);

const vaultRoot = process.env.OBSIDIAN_VAULT;
if (!vaultRoot) {
  console.error("Set OBSIDIAN_VAULT in .env");
  process.exit(1);
}

const vault = createVault({
  root: vaultRoot,
  ticketsDir: process.env.OBSIDIAN_TICKETS_DIR ?? "RLand/Tickets",
});
const removed = await vault.removeTicket(code);
console.log(`Removed ${removed}`);
