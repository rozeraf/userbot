import { describe, expect, test } from "bun:test";
import { Api } from "telegram";
import { isQuietWorkspaceRole, messageTopicId, routeWorkspaceMessage, shouldRunWorkspaceChat } from "./router";
import type { WorkspaceConfig } from "./types";

const config: WorkspaceConfig = {
  version: 1,
  chatId: "-100123",
  channelId: "123",
  accessHash: "456",
  topics: { chat: 1, saved: 10, media: 20, system: 30 },
  topicRandomIds: {},
};

describe("workspace router", () => {
  test("routes only by persisted chat and topic IDs", () => {
    expect(routeWorkspaceMessage(config, "-100123", 1)).toBe("chat");
    expect(routeWorkspaceMessage(config, "-100123", 20)).toBe("media");
    expect(routeWorkspaceMessage(config, "-100999", 1)).toBeNull();
    expect(routeWorkspaceMessage(config, "-100123", 999)).toBeNull();
    expect(routeWorkspaceMessage(config, "-100123", null)).toBeNull();
  });

  test("extracts the forum root topic ID from Telegram reply metadata", () => {
    expect(messageTopicId({ replyTo: new Api.MessageReplyHeader({
      forumTopic: true, replyToMsgId: 99, replyToTopId: 1,
    }) })).toBe(1);
    expect(messageTopicId({ replyTo: undefined })).toBeNull();
  });

  test("allows plain Chat text and keeps storage topics quiet", () => {
    expect(shouldRunWorkspaceChat("chat", "обычный вопрос")).toBeTrue();
    expect(shouldRunWorkspaceChat("chat", ".status")).toBeFalse();
    expect(shouldRunWorkspaceChat("saved", "обычный вопрос")).toBeFalse();
    expect(isQuietWorkspaceRole("saved")).toBeTrue();
    expect(isQuietWorkspaceRole("media")).toBeTrue();
    expect(isQuietWorkspaceRole("system")).toBeTrue();
    expect(isQuietWorkspaceRole("chat")).toBeFalse();
  });
});
