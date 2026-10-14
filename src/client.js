import {
  findBoardStatus,
  flattenKanbanWorkItems,
  listMyCurrentSprintWorkItems,
  listMySprintWorkItems,
  parseTicketKey,
  sortByPriority,
  toAttachment,
  toSprintRow,
  toTicketNote,
} from "./model.js";

const emptyKanbanFilter = {
  statuses: [],
  tags: [],
  sprints: [],
  priorities: [],
  assignedTo: [],
  reportedBy: [],
  colors: [],
  defectsOrigins: [],
  tagCondition: "and",
  search: "",
  quantityPerStatus: [],
};

function sessionError(status, path) {
  if (status === 401) {
    return new Error(`Blue Surf session expired on ${path}. Run npm run login and retry.`);
  }
  return new Error(`Blue Surf ${status} on ${path}`);
}

export function createClient({ request, origin = "https://surf.bluepeople.com" } = {}) {
  if (typeof request !== "function") {
    throw new Error("createClient requires a request(method, path, body) function");
  }

  async function api(method, path, body) {
    try {
      return await request(method, path, body);
    } catch (error) {
      if (error.status === 401) throw sessionError(401, path);
      throw error;
    }
  }

  return {
    origin,
    getCurrentUser() {
      return api("GET", "/api/instance/currentUser");
    },
    getWorkItem(code) {
      parseTicketKey(code);
      return api("GET", `/api/workItem/${code}`);
    },
    getWorkItemVideos(code) {
      parseTicketKey(code);
      return api("GET", `/api/WorkItem/${code}/videos`);
    },
    listMyProjects() {
      return api("GET", "/api/user/current/project");
    },
    getKanban(projectCode, filters = {}) {
      return api("POST", `/api/project/${projectCode}/kanban?skipWorkItems=false`, {
        ...emptyKanbanFilter,
        ...filters,
      });
    },
    getBoards(projectCode) {
      return api("POST", `/api/project/${projectCode}/kanban?skipWorkItems=true`, {
        ...emptyKanbanFilter,
      });
    },
    moveWorkItemOnBoard(workItemId, statusId, position = 0) {
      return api("POST", `/api/WorkItem/${workItemId}/moveOnBoard/${statusId}/${position}`);
    },
    async planMove(code, statusQuery) {
      const { projectCode } = parseTicketKey(code);
      const item = await this.getWorkItem(code);
      const target = findBoardStatus(await this.getBoards(projectCode), item.type, statusQuery);
      return {
        code,
        projectCode,
        workItemId: item.id,
        from: item.statusName,
        to: target.name.trim(),
        statusId: target.id,
        unchanged: item.statusId === target.id,
      };
    },
    async moveWorkItem(plan) {
      const updated = await this.moveWorkItemOnBoard(plan.workItemId, plan.statusId);
      if (updated?.statusId !== plan.statusId) {
        throw new Error(`${plan.code} did not move: Surf reports ${updated?.statusName ?? "no status"}`);
      }
      return updated;
    },
    async listMyWorkItems(projectCode) {
      const user = await this.getCurrentUser();
      const kanban = await this.getKanban(projectCode, { assignedTo: [user.id] });
      return flattenKanbanWorkItems(kanban);
    },
    async listMyCurrentSprintWorkItems(projectCode) {
      const user = await this.getCurrentUser();
      const kanban = await this.getKanban(projectCode, { assignedTo: [user.id] });
      return listMyCurrentSprintWorkItems(kanban);
    },
    async listMyCurrentSprintRows(projectCode) {
      const items = sortByPriority(await this.listMyCurrentSprintWorkItems(projectCode));
      return this.toSprintRows(items);
    },
    async listMySprintRows(projectCode, targetSprintNumber) {
      const user = await this.getCurrentUser();
      const kanban = await this.getKanban(projectCode, { assignedTo: [user.id] });
      const items = sortByPriority(listMySprintWorkItems(kanban, targetSprintNumber));
      return this.toSprintRows(items);
    },
    toSprintRows(items) {
      return Promise.all(
        items.map(async (item) => {
          const full = await this.getWorkItem(item.code);
          return toSprintRow({ ...item, ...full });
        }),
      );
    },
    getWorkItemFileName(workItemId, fileId) {
      return api("GET", `/api/workItem/${workItemId}/fileName/${fileId}`);
    },
    downloadWorkItemFile(workItemId, fileId) {
      return api("GET", `/api/workItem/${workItemId}/file/${fileId}`);
    },
    async resolveWorkItemFiles(files = []) {
      return Promise.all(
        files.map(async (file) => {
          const name = file.name || (await this.getWorkItemFileName(file.workItemId, file.id));
          return toAttachment({ ...file, name });
        }),
      );
    },
    async listWorkItemFiles(code) {
      const item = await this.getWorkItem(code);
      return this.resolveWorkItemFiles(item.files ?? []);
    },
    async getTicketNote(code) {
      const item = await this.getWorkItem(code);
      const files = await this.resolveWorkItemFiles(item.files ?? []);
      return toTicketNote({ ...item, files });
    },
  };
}
