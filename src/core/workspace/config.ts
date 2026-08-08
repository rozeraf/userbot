import { WORKSPACE_ROLES, type WorkspaceConfig, type WorkspaceRole } from "./types";

export function parseWorkspaceConfig(value: string): WorkspaceConfig | null {
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceConfig>;
    if (parsed.version !== 1 || typeof parsed.chatId !== "string"
        || typeof parsed.channelId !== "string" || typeof parsed.accessHash !== "string"
        || !parsed.topics || typeof parsed.topics !== "object") return null;
    const topics: Partial<Record<WorkspaceRole, number>> = {};
    for (const role of WORKSPACE_ROLES) {
      const topicId = parsed.topics[role];
      if (topicId != null) {
        if (!Number.isSafeInteger(topicId) || topicId <= 0) return null;
        topics[role] = topicId;
      }
    }
    const topicRandomIds: WorkspaceConfig["topicRandomIds"] = {};
    if (parsed.topicRandomIds && typeof parsed.topicRandomIds === "object") {
      for (const role of ["saved", "media", "system"] as const) {
        const randomId = parsed.topicRandomIds[role];
        if (randomId != null) {
          if (typeof randomId !== "string" || !/^\d+$/.test(randomId)) return null;
          topicRandomIds[role] = randomId;
        }
      }
    }
    return { ...parsed, version: 1, topics, topicRandomIds } as WorkspaceConfig;
  } catch {
    return null;
  }
}
