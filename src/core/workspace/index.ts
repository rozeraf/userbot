import type { TelegramClient } from "telegram";
import { initializeWorkspaceCore } from "./init";
import { loadWorkspaceConfig, saveWorkspaceConfig } from "./store";

export function initializeWorkspace(client: TelegramClient) {
  return initializeWorkspaceCore(client, { load: loadWorkspaceConfig, save: saveWorkspaceConfig });
}
export { isQuietWorkspaceRole, messageTopicId, shouldRunWorkspaceChat } from "./router";
export { createWorkspaceSystemNotifier, type WorkspaceSystemNotifier } from "./notifier";
export type { WorkspaceConfig, WorkspaceRole, WorkspaceRouter } from "./types";
