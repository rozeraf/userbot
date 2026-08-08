import { describe, expect, test } from "bun:test";
import { routeWorkspaceMessage } from "./router";
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
});
