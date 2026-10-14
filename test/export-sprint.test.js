import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVault } from "../src/vault.js";
import { exportSprint } from "../src/export-sprint.js";

describe("exportSprint", () => {
  let root;
  let vault;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bluesurf-sprint-"));
    vault = createVault({ root, sprintsDir: "RLand/Sprints" });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes today's sprint note from current-sprint rows", async () => {
    const client = {
      async listMyCurrentSprintRows(projectCode) {
        assert.equal(projectCode, "RLD");
        return [
          {
            code: "RLD-336",
            title: "Add legal-location fields",
            estimatedHours: 3,
            effortHours: 1.5,
            type: "User Story",
            tags: ["Agreements"],
            priority: "High",
            status: "Analysis (DONE)",
            sprint: "Sprint 14",
          },
        ];
      },
    };

    const result = await exportSprint({
      client,
      vault,
      projectCode: "RLD",
    });
    assert.equal(result.notePath, path.join(root, "RLand/Sprints/Sprint 14.md"));
    const note = await readFile(result.notePath, "utf8");
    assert.match(note, /^# Sprint 14$/m);
    assert.match(note, /## Pending Tickets/);
    assert.match(note, /\| Ticket \| Title \| Estimate \| Effort \| Type \| Status \| Priority \| Tags \|/);
    assert.match(note, /1\.5h/);
    assert.match(note, /\[\[RLand\/Tickets\/RLD-336\/detail\\\|RLD-336\]\]/);
    assert.match(note, /Analysis \(DONE\)/);
    assert.deepEqual(
      result.rows.map((row) => row.code),
      ["RLD-336"],
    );
  });

  it("rewrites the existing sprint file when the sprint was already captured", async () => {
    await vault.writeSprint("Sprint 14", "# Sprint 14\nold\n");
    const client = {
      async listMyCurrentSprintRows() {
        return [
          {
            code: "RLD-336",
            title: "Add legal-location fields",
            estimatedHours: 3,
            effortHours: 2,
            type: "User Story",
            tags: ["Agreements"],
            priority: "High",
            status: "Analysis (DONE)",
            sprint: "Sprint 14",
          },
        ];
      },
    };
    const result = await exportSprint({
      client,
      vault,
      projectCode: "RLD",
    });
    assert.equal(result.notePath, path.join(root, "RLand/Sprints/Sprint 14.md"));
    assert.match(await readFile(result.notePath, "utf8"), /^# Sprint 14$/m);
  });
});
