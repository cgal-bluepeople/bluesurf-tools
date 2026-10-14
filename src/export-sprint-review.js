import { latestSprintNumber, resolveSprintReviewNumber, toSprintNote } from "./model.js";

export async function exportSprintReview({ client, vault, projectCode, sprintNumber }) {
  const items = await client.listMyWorkItems(projectCode);
  const target = resolveSprintReviewNumber(items, sprintNumber);
  if (target === null || target < 1) {
    return {
      notePath: null,
      rows: [],
      sprint: target === null ? null : `Sprint ${target}`,
      message: "Could not determine a sprint to review.",
    };
  }

  const current = latestSprintNumber(items);
  const rows = await client.listMySprintRows(projectCode, target);
  const sprintLabel = rows[0]?.sprint ?? `Sprint ${target}`;
  const review = current !== null && target !== current;
  if (rows.length === 0) {
    return {
      notePath: null,
      rows: [],
      sprint: sprintLabel,
      message: `No assigned tickets on ${sprintLabel}.`,
    };
  }

  const notePath = await vault.writeSprint(
    sprintLabel,
    toSprintNote(rows, { ticketsDir: vault.ticketsDir, review }),
  );
  return { notePath, rows, sprint: sprintLabel };
}

export function defaultReviewSprintNumber(items) {
  const current = latestSprintNumber(items);
  return current === null ? null : current - 1;
}
