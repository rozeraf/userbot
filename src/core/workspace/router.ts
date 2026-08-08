import { Api } from "telegram";
import type { WorkspaceConfig, WorkspaceRole, WorkspaceRouter } from "./types";
import { COMMAND_PREFIX } from "../../config/commands";

export function messageTopicId(message: Pick<Api.Message, "replyTo">): number | null {
  const replyTo = message.replyTo;
  if (!(replyTo instanceof Api.MessageReplyHeader) || !replyTo.forumTopic) return null;
  return replyTo.replyToTopId ?? replyTo.replyToMsgId ?? null;
}

export function isQuietWorkspaceRole(role: WorkspaceRole | null): boolean {
  return role === "saved" || role === "media" || role === "system";
}

export function shouldRunWorkspaceChat(role: WorkspaceRole | null, text: string): boolean {
  return role === "chat" && Boolean(text) && !text.startsWith(COMMAND_PREFIX);
}

export function routeWorkspaceMessage(
  config: WorkspaceConfig,
  chatId: string,
  topicId: number | null,
): WorkspaceRole | null {
  if (chatId !== config.chatId || topicId == null) return null;
  for (const [role, configuredTopicId] of Object.entries(config.topics)) {
    if (configuredTopicId === topicId) return role as WorkspaceRole;
  }
  return null;
}

export function createWorkspaceRouter(config: WorkspaceConfig): WorkspaceRouter {
  return { config, route: (chatId, topicId) => routeWorkspaceMessage(config, chatId, topicId) };
}
