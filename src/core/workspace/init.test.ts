import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Api, type TelegramClient } from "telegram";
import { initializeWorkspaceCore } from "./init";
import type { WorkspaceConfig } from "./types";

function topic(id: number, title: string): Api.ForumTopic {
  return new Api.ForumTopic({ id, title, hidden: false } as ConstructorParameters<typeof Api.ForumTopic>[0]);
}

function topicsResult(items: Api.TypeForumTopic[]): Api.messages.ForumTopics {
  return new Api.messages.ForumTopics({ topics: items, count: items.length } as ConstructorParameters<typeof Api.messages.ForumTopics>[0]);
}

describe("workspace initialization", () => {
  test("restores only a missing topic and persists its returned ID", async () => {
    const config: WorkspaceConfig = {
      version: 1,
      chatId: "-100123",
      channelId: "123",
      accessHash: "456",
      topics: { chat: 1, saved: 4, system: 6 },
      topicRandomIds: { media: "777" },
    };
    let createCalls = 0;
    const saved: WorkspaceConfig[] = [];
    const client = {
      async invoke(request: unknown) {
        if (request instanceof Api.channels.GetChannels) {
          return new Api.messages.Chats({ chats: [new Api.Channel({
            id: bigInt(123), accessHash: bigInt(456), title: "Userbot Workspace", forum: true,
          } as ConstructorParameters<typeof Api.Channel>[0])] });
        }
        if (request instanceof Api.channels.GetForumTopicsByID) {
          const id = request.topics[0]!;
          return topicsResult([topic(id, id === 1 ? "Chat" : id === 4 ? "Saved" : "System")]);
        }
        if (request instanceof Api.channels.CreateForumTopic) {
          createCalls++;
          return new Api.Updates({
            updates: [new Api.UpdateMessageID({ id: 5, randomId: bigInt(777) })],
            users: [], chats: [], date: 0, seq: 0,
          });
        }
        throw new Error(`Unexpected request: ${String(request)}`);
      },
    } as unknown as TelegramClient;

    const workspace = await initializeWorkspaceCore(client, {
      load: () => config,
      save: (next) => saved.push(structuredClone(next)),
    });

    expect(createCalls).toBe(1);
    expect(workspace.config.topics).toEqual({ chat: 1, saved: 4, media: 5, system: 6 });
    expect(saved.at(-1)?.topics.media).toBe(5);
  });
});
