export function parseTicketKey(code) {
  const match = /^([A-Z]+)-\d+$/.exec(code);
  if (!match) {
    throw new Error(`Invalid ticket key: ${code}`);
  }
  return { projectCode: match[1], code };
}

export function flattenKanbanWorkItems(kanban) {
  const items = [];
  for (const board of kanban ?? []) {
    for (const status of board.statuses ?? []) {
      for (const item of status.workItems ?? []) {
        items.push({
          ...item,
          statusName: item.statusName ?? status.name,
        });
      }
    }
  }
  return items;
}

export function modalCurrentSprintId(items) {
  const counts = new Map();
  for (const item of items) {
    const id = item.currentSprintId;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let winner = null;
  let max = 0;
  for (const [id, count] of counts) {
    if (count > max) {
      winner = id;
      max = count;
    }
  }
  return winner;
}

export function sprintNumber(name) {
  const match = /(\d+)/.exec(String(name ?? ""));
  return match ? Number(match[1]) : null;
}

export function latestSprintNumber(items) {
  let max = -Infinity;
  for (const item of items) {
    const number = sprintNumber(item.currentSprintName);
    if (number === null) continue;
    if (number > max) max = number;
  }
  return max === -Infinity ? null : max;
}

export function listMySprintWorkItems(kanban, targetSprintNumber) {
  const items = flattenKanbanWorkItems(kanban);
  if (targetSprintNumber === null || targetSprintNumber === undefined) return [];
  return items.filter((item) => sprintNumber(item.currentSprintName) === targetSprintNumber);
}

export function resolveSprintReviewNumber(items, override) {
  if (override !== undefined && override !== null && !Number.isNaN(override)) {
    return Number(override);
  }
  const current = latestSprintNumber(items);
  if (current === null) return null;
  return current - 1;
}

// Surf has no "current sprint" endpoint. Old sprints keep their cards, so the
// most common sprint is often a past one; prefer the highest-numbered sprint.
export function latestCurrentSprintId(items) {
  let winner = null;
  let max = -Infinity;
  for (const item of items) {
    const number = sprintNumber(item.currentSprintName);
    if (!item.currentSprintId || number === null) continue;
    if (number > max) {
      winner = item.currentSprintId;
      max = number;
    }
  }
  return winner ?? modalCurrentSprintId(items);
}

export function listMyCurrentSprintWorkItems(kanban) {
  const items = flattenKanbanWorkItems(kanban);
  const sprintId = latestCurrentSprintId(items);
  if (!sprintId) return [];
  return items.filter((item) => item.currentSprintId === sprintId);
}

export function sortByPriority(items) {
  return [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function isPendingSprintStatus(status) {
  const value = String(status ?? "").toLowerCase();
  const analysis = value.includes("analysis");
  const dev = value.includes("dev");
  const inProgress = value.includes("in progress");
  const done = value.includes("done");
  const blocked = value.includes("blocked");
  return blocked || (dev && inProgress) || (analysis && inProgress) || (analysis && done);
}

export function groupSprintRows(rows) {
  const pending = [];
  const done = [];
  for (const row of rows) {
    if (isPendingSprintStatus(row.status ?? row.statusName)) pending.push(row);
    else done.push(row);
  }
  return { pending, done };
}

export function toAttachment(file) {
  const workItemId = file.workItemId;
  const id = file.id;
  return {
    id,
    workItemId,
    name: file.name ?? "",
    isImage: Boolean(file.isImage),
    filePath: `/api/workItem/${workItemId}/file/${id}`,
    fileNamePath: `/api/workItem/${workItemId}/fileName/${id}`,
    imagePath: file.isImage ? `/api/workItem/${workItemId}/image/${id}` : null,
  };
}

export function toSprintRow(item) {
  return {
    code: item.code,
    title: item.name,
    estimatedHours: item.estimatedEffort ?? 0,
    effortHours: item.totalExecuted ?? 0,
    type: item.typeDisplayName ?? "",
    tags: (item.tags ?? []).map((tag) => tag.tagName).filter(Boolean),
    priority: item.priorityName ?? "",
    status: item.statusName ?? "",
    sprint: item.currentSprintName ?? "",
  };
}

function tableCell(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

function sprintTable(rows, ticketsDir) {
  const lines = [
    "| Ticket | Title | Estimate | Effort | Type | Status | Priority | Tags |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    const ticket = `[[${ticketsDir}/${row.code}/detail|${row.code}]]`;
    const tags = row.tags?.length ? row.tags.join(", ") : "—";
    lines.push(
      `| ${tableCell(ticket)} | ${tableCell(row.title)} | ${row.estimatedHours}h | ${row.effortHours ?? 0}h | ${tableCell(row.type)} | ${tableCell(row.status)} | ${tableCell(row.priority)} | ${tableCell(tags)} |`,
    );
  }
  return lines;
}

export function toSprintNote(rows, { ticketsDir = "RLand/Tickets", review = false } = {}) {
  const sprint = rows[0]?.sprint || "Current sprint";
  const { pending, done } = groupSprintRows(rows);
  const heading = review ? `# ${sprint} Review` : `# ${sprint}`;
  return [
    heading,
    "",
    "## Pending Tickets",
    "",
    ...sprintTable(pending, ticketsDir),
    "",
    "## Done Tickets",
    "",
    ...sprintTable(done, ticketsDir),
    "",
  ].join("\n");
}

function commentBody(entry) {
  const text = entry.comment ?? "";
  const images = (entry.files ?? []).filter((file) => file.isImage).length;
  const imageNote = images === 0 ? "" : images === 1 ? "Image attached." : `${images} images attached.`;
  if (text && imageNote) return `${text}\n\n${imageNote}`;
  return text || imageNote;
}

function commentBlocks(comments) {
  return (comments ?? [])
    .filter((entry) => entry && !entry.deleted)
    .map((entry) => `**${entry.createdByFullName ?? ""}**\n\n${commentBody(entry)}`);
}

export function toTicketNote(item) {
  const tags = (item.tags ?? []).map((tag) => tag.tagName).filter(Boolean);
  const attachments = (item.files ?? []).map((file) => file.name).filter(Boolean);
  const estimate = item.estimatedEffort ?? 0;
  const lines = [
    `# ${item.code} — ${item.name}`,
    "",
    `**Priority:** ${item.priorityName ?? ""}`,
    `**Type:** ${item.typeDisplayName ?? ""}`,
    `**Status:** ${item.statusName ?? ""}`,
    `**Sprint:** ${item.currentSprintName ?? ""}`,
    `**Estimate:** ${estimate}h`,
    `**Tags:** ${tags.join(", ") || "—"}`,
    `**Attachments:** ${attachments.join(", ") || "—"}`,
    "",
    "## Description",
    "",
    item.description ?? "",
    "",
  ];
  if (tags.includes("Bugs Detected")) {
    lines.push("## Comments", "", commentBlocks(item.comments).join("\n\n"), "");
  }
  return lines.join("\n");
}

function normalizeStatus(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\bdev\b/g, "development")
    .replace(/\s+/g, " ")
    .trim();
}

// Each work item type has its own board with its own status ids, so resolve
// the name on the board for that type. Accepts loose names ("dev done").
export function findBoardStatus(boards, type, query) {
  const board = (boards ?? []).find((candidate) => candidate.type === type);
  if (!board) throw new Error(`No board for work item type ${type}`);
  const statuses = board.statuses ?? [];
  const wanted = normalizeStatus(query);
  const exact = statuses.filter((status) => normalizeStatus(status.name) === wanted);
  if (exact.length === 1) return exact[0];
  const words = wanted.split(" ");
  const partial = statuses.filter((status) => {
    const parts = normalizeStatus(status.name).split(" ");
    return words.every((word) => parts.some((part) => part.startsWith(word)));
  });
  if (partial.length === 1) return partial[0];
  const names = (list) => list.map((status) => status.name.trim()).join(", ");
  throw new Error(
    partial.length
      ? `"${query}" matches ${names(partial)}. Be more specific.`
      : `No status "${query}". Options: ${names(statuses)}`,
  );
}

export function isDoneStatus(status) {
  return String(status ?? "").toLowerCase().includes("done");
}

export function toMyTicketRow(item) {
  return {
    code: item.code,
    title: item.name,
    status: item.statusName ?? "",
    priority: item.priorityName ?? "",
    estimatedHours: item.estimatedEffort ?? 0,
    type: item.typeDisplayName ?? "",
    tags: (item.tags ?? []).map((tag) => tag.tagName).filter(Boolean),
    sprint: item.currentSprintName ?? "",
  };
}

// Groups my work items by sprint: newest sprint first (by the number in its
// name), no sprint last, priority order inside each. Hides DONE unless `all`.
export function groupMyTickets(items, { all = false } = {}) {
  const groups = new Map();
  for (const item of items) {
    if (!all && isDoneStatus(item.statusName)) continue;
    const key = item.currentSprintName || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const rank = (name) => {
    if (!name) return -1;
    const match = /(\d+)/.exec(name);
    return match ? Number(match[1]) : 0;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(b) - rank(a))
    .map(([sprint, list]) => ({
      sprint: sprint || "No sprint",
      items: sortByPriority(list).map(toMyTicketRow),
    }));
}

export function formatMyTickets(groups) {
  const lines = [];
  for (const { sprint, items } of groups) {
    lines.push(`${sprint} (${items.length})`);
    for (const row of items) {
      lines.push(`  ${row.code}  ${row.status}  ${row.priority}  ${row.estimatedHours}h  ${row.title}`);
    }
  }
  return lines.join("\n");
}
