export const WORKSPACE_ROLES = ["chat", "saved", "media", "settings", "system"] as const;
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];

export type WorkspaceConfig = {
  version: 1;
  chatId: string;
  channelId: string;
  accessHash: string;
  topics: Partial<Record<WorkspaceRole, number>>;
  topicRandomIds: Partial<Record<Exclude<WorkspaceRole, "chat">, string>>;
};

export type WorkspaceRouter = {
  readonly config: WorkspaceConfig;
  route(chatId: string, topicId: number | null): WorkspaceRole | null;
};
