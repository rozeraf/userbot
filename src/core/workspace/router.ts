import { Api } from "telegram";
import type { WorkspaceConfig, WorkspaceRole, WorkspaceRouter } from "./types";

export function messageTopicId(message: Api.Message): number | null {
  const replyTo = message.replyTo;
  if (!(replyTo instanceof Api.MessageReplyHeader) || !replyTo.forumTopic) return null;
  return replyTo.replyToTopId ?? replyTo.replyToMsgId ?? null;
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
