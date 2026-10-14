import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTicketKey } from "./model.js";

export function safeFileName(name) {
  const trimmed = String(name ?? "").trim() || "attachment";
  return trimmed.replace(/[/\\]/g, "-").replace(/^\.+$/, "attachment");
}

export function createVault({
  root,
  ticketsDir = "RLand/Tickets",
  sprintsDir = "RLand/Sprints",
} = {}) {
  if (!root) {
    throw new Error("createVault requires a vault root");
  }

  function ticketsRoot() {
    return path.join(root, ticketsDir);
  }

  function ticketDir(code) {
    parseTicketKey(code);
    return path.join(ticketsRoot(), code);
  }

  function notePath(code) {
    return path.join(ticketDir(code), "detail.md");
  }

  function attachmentDir(code) {
    return path.join(ticketDir(code), "attachments");
  }

  return {
    ticketsDir,
    ticketDir,
    notePath,
    attachmentDir,
    async writeNote(code, markdown) {
      const dest = notePath(code);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, markdown);
      return dest;
    },
    async writeAttachment(code, name, bytes) {
      const dest = path.join(attachmentDir(code), safeFileName(name));
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
      return dest;
    },
    sprintNotePath(sprintName) {
      const name = String(sprintName ?? "").trim();
      if (!name) {
        throw new Error("Invalid sprint name");
      }
      return path.join(root, sprintsDir, `${name}.md`);
    },
    async findSprintPath(sprintName) {
      if (!sprintName) return null;
      const canonical = this.sprintNotePath(sprintName);
      try {
        await access(canonical);
        return canonical;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return null;
    },
    async writeSprint(sprintName, markdown) {
      const dest = (await this.findSprintPath(sprintName)) ?? this.sprintNotePath(sprintName);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, markdown);
      return dest;
    },
    async removeTicket(code) {
      const dir = ticketDir(code);
      const legacyNote = path.join(ticketsRoot(), `${code}.md`);
      await rm(dir, { recursive: true, force: true });
      await rm(legacyNote, { force: true });
      return dir;
    },
  };
}
