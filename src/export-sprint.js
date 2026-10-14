import { toSprintNote } from "./model.js";

export async function exportSprint({ client, vault, projectCode }) {
  const rows = await client.listMyCurrentSprintRows(projectCode);
  const sprintName = rows[0]?.sprint || "Current sprint";
  const notePath = await vault.writeSprint(
    sprintName,
    toSprintNote(rows, { ticketsDir: vault.ticketsDir }),
  );
  return { notePath, rows };
}
