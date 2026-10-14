import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVault } from "../src/vault.js";
import { exportSprintReview } from "../src/export-sprint-review.js";

describe("exportSprintReview", () => {
  let root;
  let vault;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bluesurf-sprint-review-"));
    vault = createVault({ root, sprintsDir: "RLand/Sprints" });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the previous sprint note by default", async () => {
    const client = {
      async listMyWorkItems() {
        return [
          { currentSprintName: "Sprint 15" },
          { currentSprintName: "Sprint 14" },
        ];
      },
      async listMySprintRows(projectCode, targetSprintNumber) {
        assert.equal(projectCode, "RLD");
        assert.equal(targetSprintNumber, 14);
        return [
          {
            code: "RLD-200",
            title: "Past sprint item",
            estimatedHours: 2,
            effortHours: 1,
            type: "Task",
            tags: [],
            priority: "Medium",
            status: "Development (DONE)",
            sprint: "Sprint 14",
          },
        ];
      },
    };

    const result = await exportSprintReview({
      client,
      vault,
      projectCode: "RLD",
    });
    assert.equal(result.notePath, path.join(root, "RLand/Sprints/Sprint 14.md"));
    assert.match(await readFile(result.notePath, "utf8"), /^# Sprint 14 Review$/m);
  });

  it("accepts an explicit sprint number override", async () => {
    const client = {
      async listMyWorkItems() {
        return [{ currentSprintName: "Sprint 15" }];
      },
      async listMySprintRows(_projectCode, targetSprintNumber) {
        assert.equal(targetSprintNumber, 11);
        return [
          {
            code: "RLD-111",
            title: "Older sprint",
            estimatedHours: 1,
            effortHours: 0,
            type: "Bug",
            tags: [],
            priority: "Low",
            status: "Development (DONE)",
            sprint: "Sprint 11",
          },
        ];
      },
    };

    const result = await exportSprintReview({
      client,
      vault,
      projectCode: "RLD",
      sprintNumber: 11,
    });
    assert.equal(result.notePath, path.join(root, "RLand/Sprints/Sprint 11.md"));
  });

  it("uses a plain H1 when the review target is the current sprint", async () => {
    const client = {
      async listMyWorkItems() {
        return [{ currentSprintName: "Sprint 15" }];
      },
      async listMySprintRows(_projectCode, targetSprintNumber) {
        assert.equal(targetSprintNumber, 15);
        return [
          {
            code: "RLD-300",
            title: "Current sprint item",
            estimatedHours: 1,
            effortHours: 0,
            type: "Task",
            tags: [],
            priority: "Medium",
            status: "Development (IN PROGRESS)",
            sprint: "Sprint 15",
          },
        ];
      },
    };

    const result = await exportSprintReview({
      client,
      vault,
      projectCode: "RLD",
      sprintNumber: 15,
    });
    assert.match(await readFile(result.notePath, "utf8"), /^# Sprint 15$/m);
  });

  it("does not write a file when the sprint has no assigned tickets", async () => {
    const client = {
      async listMyWorkItems() {
        return [{ currentSprintName: "Sprint 15" }];
      },
      async listMySprintRows() {
        return [];
      },
    };

    const result = await exportSprintReview({
      client,
      vault,
      projectCode: "RLD",
    });
    assert.equal(result.notePath, null);
    assert.match(result.message, /No assigned tickets/);
  });
});
