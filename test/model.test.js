import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTicketKey,
  flattenKanbanWorkItems,
  modalCurrentSprintId,
  latestCurrentSprintId,
  listMyCurrentSprintWorkItems,
  listMySprintWorkItems,
  resolveSprintReviewNumber,
  latestSprintNumber,
  sortByPriority,
  groupSprintRows,
  toAttachment,
  toSprintNote,
  toSprintRow,
  toTicketNote,
} from "../src/model.js";

describe("parseTicketKey", () => {
  it("splits a work item code into project code and key", () => {
    assert.deepEqual(parseTicketKey("RLD-336"), {
      projectCode: "RLD",
      code: "RLD-336",
    });
  });
});

const kanban = [
  {
    type: 0,
    statuses: [
      {
        name: "Backlog",
        workItems: [
          {
            code: "RLD-331",
            name: "Reorder columns",
            priority: 2,
            priorityName: "Low",
            typeDisplayName: "User Story",
            estimatedEffort: 10,
            statusName: "Backlog",
            currentSprintId: null,
            currentSprintName: null,
            tags: [{ tagName: "Agreements" }],
            description: "<p>Reorder</p>",
          },
        ],
      },
      {
        name: "In Progress",
        workItems: [
          {
            code: "RLD-336",
            name: "Add legal-location fields",
            priority: 4,
            priorityName: "High",
            typeDisplayName: "User Story",
            estimatedEffort: 3,
            totalHours: 1.5,
            totalExecuted: 4,
            statusName: "Analysis (DONE)",
            currentSprintId: "sprint-14",
            currentSprintName: "Sprint 14",
            tags: [{ tagName: "Agreements" }, { tagName: "Tracts" }],
            description: "<p>Quartering, Lot, Parcel</p>",
          },
          {
            code: "RLD-340",
            name: "Other sprint item",
            priority: 5,
            priorityName: "Highest",
            typeDisplayName: "Bug",
            estimatedEffort: 1,
            statusName: "In Progress",
            currentSprintId: "sprint-13",
            currentSprintName: "Sprint 13",
            tags: [],
            description: "<p>Old</p>",
          },
          {
            code: "RLD-337",
            name: "Same sprint other item",
            priority: 3,
            priorityName: "Medium",
            typeDisplayName: "Task",
            estimatedEffort: 2,
            totalHours: 0,
            statusName: "In Progress",
            currentSprintId: "sprint-14",
            currentSprintName: "Sprint 14",
            tags: [],
            description: "<p>Also 14</p>",
          },
        ],
      },
    ],
  },
];

describe("flattenKanbanWorkItems", () => {
  it("collects work items from every status column", () => {
    assert.deepEqual(
      flattenKanbanWorkItems(kanban).map((item) => item.code),
      ["RLD-331", "RLD-336", "RLD-340", "RLD-337"],
    );
  });
});

describe("modalCurrentSprintId", () => {
  it("picks the most common non-empty currentSprintId", () => {
    assert.equal(modalCurrentSprintId(flattenKanbanWorkItems(kanban)), "sprint-14");
  });
});

describe("latestCurrentSprintId", () => {
  it("picks the highest-numbered sprint even when an older sprint has more cards", () => {
    const items = [
      { currentSprintId: "s11", currentSprintName: "Sprint 11" },
      { currentSprintId: "s11", currentSprintName: "Sprint 11" },
      { currentSprintId: "s11", currentSprintName: "Sprint 11" },
      { currentSprintId: "s15", currentSprintName: "Sprint 15" },
      { currentSprintId: "s9", currentSprintName: "Sprint 9" },
      { currentSprintId: null, currentSprintName: null },
    ];
    assert.equal(latestCurrentSprintId(items), "s15");
  });

  it("falls back to the most common sprint when names carry no number", () => {
    const items = [
      { currentSprintId: "a", currentSprintName: "Alpha" },
      { currentSprintId: "b", currentSprintName: "Beta" },
      { currentSprintId: "b", currentSprintName: "Beta" },
    ];
    assert.equal(latestCurrentSprintId(items), "b");
  });
});

describe("listMyCurrentSprintWorkItems", () => {
  it("keeps items on the latest current sprint", () => {
    assert.deepEqual(
      listMyCurrentSprintWorkItems(kanban).map((item) => item.code),
      ["RLD-336", "RLD-337"],
    );
  });
});

describe("listMySprintWorkItems", () => {
  it("keeps items whose current sprint name matches the target number", () => {
    assert.deepEqual(
      listMySprintWorkItems(kanban, 14).map((item) => item.code),
      ["RLD-336", "RLD-337"],
    );
    assert.deepEqual(listMySprintWorkItems(kanban, 13).map((item) => item.code), ["RLD-340"]);
  });
});

describe("resolveSprintReviewNumber", () => {
  it("defaults to one below the highest sprint number on assigned cards", () => {
    const items = [
      { currentSprintName: "Sprint 15" },
      { currentSprintName: "Sprint 14" },
    ];
    assert.equal(latestSprintNumber(items), 15);
    assert.equal(resolveSprintReviewNumber(items), 14);
  });

  it("uses an explicit override when provided", () => {
    assert.equal(resolveSprintReviewNumber([{ currentSprintName: "Sprint 15" }], 11), 11);
  });
});

describe("sortByPriority", () => {
  it("orders Highest before Lowest without mutating the input", () => {
    const items = flattenKanbanWorkItems(kanban);
    assert.deepEqual(
      sortByPriority(items).map((item) => item.code),
      ["RLD-340", "RLD-336", "RLD-337", "RLD-331"],
    );
    assert.equal(items[0].code, "RLD-331");
  });
});

describe("toSprintRow", () => {
  it("maps a work item to sprint-note fields", () => {
    const item = flattenKanbanWorkItems(kanban)[1];
    assert.deepEqual(toSprintRow(item), {
      code: "RLD-336",
      title: "Add legal-location fields",
      estimatedHours: 3,
      effortHours: 4,
      type: "User Story",
      tags: ["Agreements", "Tracts"],
      priority: "High",
      status: "Analysis (DONE)",
      sprint: "Sprint 14",
    });
  });
});

describe("groupSprintRows", () => {
  it("puts analysis/dev in progress, analysis done, and blocked in pending, the rest in done", () => {
    const rows = [
      { code: "RLD-1", status: "Testing (DONE)" },
      { code: "RLD-2", status: "Analysis (DONE)" },
      { code: "RLD-3", status: "Development (IN PROGRESS)" },
      { code: "RLD-4", status: "Analysis (IN PROGRESS)" },
      { code: "RLD-5", status: "Development (DONE)" },
      { code: "RLD-6", status: "Validation (BLOCKED)" },
      { code: "RLD-7", status: "Blocked" },
    ];
    const groups = groupSprintRows(rows);
    assert.deepEqual(
      groups.pending.map((row) => row.code),
      ["RLD-2", "RLD-3", "RLD-4", "RLD-6", "RLD-7"],
    );
    assert.deepEqual(
      groups.done.map((row) => row.code),
      ["RLD-1", "RLD-5"],
    );
  });
});

describe("toSprintNote", () => {
  it("writes pending and done tables with estimate, effort, type, status, tags, and ticket links", () => {
    const rows = [
      toSprintRow(flattenKanbanWorkItems(kanban)[1]),
      toSprintRow(flattenKanbanWorkItems(kanban)[3]),
    ];
    assert.equal(
      toSprintNote(rows),
      [
        "# Sprint 14",
        "",
        "## Pending Tickets",
        "",
        "| Ticket | Title | Estimate | Effort | Type | Status | Priority | Tags |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| [[RLand/Tickets/RLD-336/detail\\|RLD-336]] | Add legal-location fields | 3h | 4h | User Story | Analysis (DONE) | High | Agreements, Tracts |",
        "",
        "## Done Tickets",
        "",
        "| Ticket | Title | Estimate | Effort | Type | Status | Priority | Tags |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| [[RLand/Tickets/RLD-337/detail\\|RLD-337]] | Same sprint other item | 2h | 0h | Task | In Progress | Medium | — |",
        "",
      ].join("\n"),
    );
  });
});

describe("toSprintNote ticketsDir", () => {
  it("links tickets under the configured tickets folder", () => {
    const rows = [toSprintRow(flattenKanbanWorkItems(kanban)[1])];
    assert.match(
      toSprintNote(rows, { ticketsDir: "Work/Surf" }),
      /\[\[Work\/Surf\/RLD-336\/detail\\\|RLD-336\]\]/,
    );
  });
});

describe("toAttachment", () => {
  it("maps a work item file to name and download paths", () => {
    assert.deepEqual(
      toAttachment({
        id: "file-1",
        workItemId: "item-1",
        name: "CleanShot 2026-09-04 at 14.31.46.png",
        isImage: true,
      }),
      {
        id: "file-1",
        workItemId: "item-1",
        name: "CleanShot 2026-09-04 at 14.31.46.png",
        isImage: true,
        filePath: "/api/workItem/item-1/file/file-1",
        fileNamePath: "/api/workItem/item-1/fileName/file-1",
        imagePath: "/api/workItem/item-1/image/file-1",
      },
    );
  });

  it("omits imagePath when the file is not an image", () => {
    const attachment = toAttachment({
      id: "file-2",
      workItemId: "item-1",
      name: "notes.pdf",
      isImage: false,
    });
    assert.equal(attachment.imagePath, null);
    assert.equal(attachment.filePath, "/api/workItem/item-1/file/file-2");
  });
});

describe("toTicketNote", () => {
  it("writes a markdown note with title, meta, and HTML description", () => {
    const item = flattenKanbanWorkItems(kanban)[1];
    const note = toTicketNote(item);
    assert.match(note, /^# RLD-336 — Add legal-location fields\n/);
    assert.match(note, /\*\*Priority:\*\* High/);
    assert.match(note, /\*\*Type:\*\* User Story/);
    assert.match(note, /\*\*Sprint:\*\* Sprint 14/);
    assert.match(note, /\*\*Estimate:\*\* 3h/);
    assert.match(note, /\*\*Tags:\*\* Agreements, Tracts/);
    assert.match(note, /\*\*Attachments:\*\* —/);
    assert.match(note, /Quartering, Lot, Parcel/);
  });

  it("includes regression comments when the ticket is tagged Bugs Detected", () => {
    const item = {
      ...flattenKanbanWorkItems(kanban)[1],
      tags: [{ tagName: "Bugs Detected" }],
      comments: [
        {
          comment: "<p>Saving a tract clears the legal location.</p>",
          createdByFullName: "Ada Lovelace",
          deleted: false,
        },
      ],
    };
    const note = toTicketNote(item);
    assert.match(note, /## Comments\n\n\*\*Ada Lovelace\*\*\n\n<p>Saving a tract clears the legal location\.<\/p>/);
  });

  it("leaves comments off the note when the ticket is not tagged Bugs Detected", () => {
    const item = {
      ...flattenKanbanWorkItems(kanban)[1],
      comments: [
        {
          comment: "<p>Saving a tract clears the legal location.</p>",
          createdByFullName: "Ada Lovelace",
          deleted: false,
        },
      ],
    };
    assert.doesNotMatch(toTicketNote(item), /## Comments|Ada Lovelace/);
  });

  it("omits deleted regression comments", () => {
    const item = {
      ...flattenKanbanWorkItems(kanban)[1],
      tags: [{ tagName: "Bugs Detected" }],
      comments: [
        {
          comment: "<p>Old note.</p>",
          createdByFullName: "Grace Hopper",
          deleted: true,
        },
        {
          comment: "<p>Saving a tract clears the legal location.</p>",
          createdByFullName: "Ada Lovelace",
          deleted: false,
        },
      ],
    };
    const note = toTicketNote(item);
    assert.match(note, /Ada Lovelace/);
    assert.doesNotMatch(note, /Grace Hopper|Old note/);
  });

  it("notes an image when a regression comment has no text", () => {
    const item = {
      ...flattenKanbanWorkItems(kanban)[1],
      tags: [{ tagName: "Bugs Detected" }],
      comments: [
        {
          comment: "",
          createdByFullName: "Ada Lovelace",
          deleted: false,
          files: [{ id: "file-1", isImage: true }],
        },
      ],
    };
    assert.match(toTicketNote(item), /\*\*Ada Lovelace\*\*\n\nImage attached\./);
  });

  it("lists attachment names when the work item has files", () => {
    const item = {
      ...flattenKanbanWorkItems(kanban)[1],
      files: [
        { name: "CleanShot 2026-09-04 at 14.31.46.png" },
        { name: "CleanShot 2026-08-21 at 15.16.07.gif" },
      ],
    };
    assert.match(
      toTicketNote(item),
      /\*\*Attachments:\*\* CleanShot 2026-09-04 at 14.31.46.png, CleanShot 2026-08-21 at 15.16.07.gif/,
    );
  });
});
