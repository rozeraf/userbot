import { describe, expect, test } from "bun:test";
import { parseWorkspaceConfig } from "./config";

describe("workspace config", () => {
  test("accepts persisted IDs without relying on topic names", () => {
    const config = parseWorkspaceConfig(JSON.stringify({
      version: 1,
      chatId: "-100123",
      channelId: "123",
      accessHash: "456",
      topics: { chat: 1, saved: 10 },
      topicRandomIds: { saved: "789" },
    }));
    expect(config?.topics.saved).toBe(10);
    expect(config?.topicRandomIds.saved).toBe("789");
  });

  test("rejects corrupt topic and random IDs", () => {
    expect(parseWorkspaceConfig(JSON.stringify({
      version: 1, chatId: "x", channelId: "1", accessHash: "2",
      topics: { chat: 0 }, topicRandomIds: {},
    }))).toBeNull();
    expect(parseWorkspaceConfig(JSON.stringify({
      version: 1, chatId: "x", channelId: "1", accessHash: "2",
      topics: { chat: 1 }, topicRandomIds: { saved: "not-a-long" },
    }))).toBeNull();
  });
});
