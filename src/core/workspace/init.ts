import { randomBytes } from "crypto";
import bigInt from "big-integer";
import { Api, utils, type TelegramClient } from "telegram";
import { createWorkspaceRouter } from "./router";
import type { WorkspaceConfig, WorkspaceRole, WorkspaceRouter } from "./types";
import { workspaceInputChannel } from "./peer";
import { BRAND } from "../../config/branding";

const WORKSPACE_TITLE = BRAND.workspaceTitle;
const TOPIC_TITLES: Record<WorkspaceRole, string> = {
  chat: "Chat",
  saved: "Saved",
  media: "Media",
  settings: "Settings",
  system: "System",
};

export type WorkspacePersistence = {
  load(): WorkspaceConfig | null;
  save(config: WorkspaceConfig): void;
};

function updatesOf(result: Api.TypeUpdates): Api.TypeUpdate[] {
  return result instanceof Api.Updates || result instanceof Api.UpdatesCombined ? result.updates : [];
}

function createdChannel(result: Api.TypeUpdates): Api.Channel {
  const chats = result instanceof Api.Updates || result instanceof Api.UpdatesCombined ? result.chats : [];
  const channel = chats.find((chat): chat is Api.Channel => chat instanceof Api.Channel);
  if (!channel?.accessHash) throw new Error("Telegram did not return the created workspace channel identity");
  return channel;
}

function createdTopicId(result: Api.TypeUpdates, randomId: string): number {
  for (const update of updatesOf(result)) {
    if (update instanceof Api.UpdateMessageID && update.randomId?.toString() === randomId) {
      return update.id;
    }
    if (update instanceof Api.UpdateNewChannelMessage
        && update.message instanceof Api.Message
        && update.message.action instanceof Api.MessageActionTopicCreate) {
      return update.message.id;
    }
  }
  throw new Error("Telegram did not return the created forum topic ID");
}

function newRandomId(): string {
  const bytes = randomBytes(8);
  bytes[0] = (bytes[0] ?? 0) & 0x7f;
  return bigInt(bytes.toString("hex"), 16).toString();
}

async function createWorkspace(client: TelegramClient, persistence: WorkspacePersistence): Promise<WorkspaceConfig> {
  const result = await client.invoke(new Api.channels.CreateChannel({
    title: WORKSPACE_TITLE,
    about: BRAND.workspaceAbout,
    megagroup: true,
    forum: true,
  }));
  const channel = createdChannel(result);
  const config: WorkspaceConfig = {
    version: 1,
    chatId: utils.getPeerId(channel),
    channelId: channel.id.toString(),
    accessHash: channel.accessHash!.toString(),
    topics: { chat: 1 },
    topicRandomIds: {},
  };
  persistence.save(config);
  await client.invoke(new Api.channels.EditForumTopic({
    channel: workspaceInputChannel(config),
    topicId: 1,
    title: TOPIC_TITLES.chat,
  }));
  return config;
}

async function ensureForum(client: TelegramClient, config: WorkspaceConfig): Promise<void> {
  const channel = workspaceInputChannel(config);
  const response = await client.invoke(new Api.channels.GetChannels({ id: [channel] }));
  const entity = response.chats.find((chat): chat is Api.Channel => chat instanceof Api.Channel);
  if (!entity) throw new Error(`Workspace channel ${config.chatId} is unavailable`);
  if (entity.title !== WORKSPACE_TITLE) {
    await client.invoke(new Api.channels.EditTitle({ channel, title: WORKSPACE_TITLE }));
  }
  if (!entity.forum) {
    await client.invoke(new Api.channels.ToggleForum({ channel, enabled: true }));
  }
}

async function getTopic(client: TelegramClient, config: WorkspaceConfig, topicId: number): Promise<Api.ForumTopic | null> {
  try {
    const result = await client.invoke(new Api.channels.GetForumTopicsByID({
      channel: workspaceInputChannel(config),
      topics: [topicId],
    }));
    return result.topics.find((topic): topic is Api.ForumTopic =>
      topic instanceof Api.ForumTopic && topic.id === topicId) ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/TOPIC.*INVALID|MESSAGE_ID_INVALID/i.test(message)) return null;
    throw err;
  }
}

async function ensureTopic(
  client: TelegramClient,
  config: WorkspaceConfig,
  role: Exclude<WorkspaceRole, "chat">,
  persistence: WorkspacePersistence,
): Promise<void> {
  const existingId = config.topics[role];
  if (existingId && await getTopic(client, config, existingId)) return;

  const randomId = config.topicRandomIds[role] ?? newRandomId();
  config.topicRandomIds[role] = randomId;
  delete config.topics[role];
  persistence.save(config);

  const result = await client.invoke(new Api.channels.CreateForumTopic({
    channel: workspaceInputChannel(config),
    title: TOPIC_TITLES[role],
    randomId: bigInt(randomId),
  }));
  config.topics[role] = createdTopicId(result, randomId);
  persistence.save(config);
}

export async function initializeWorkspaceCore(
  client: TelegramClient,
  persistence: WorkspacePersistence,
): Promise<WorkspaceRouter> {
  const config = persistence.load() ?? await createWorkspace(client, persistence);
  await ensureForum(client, config);

  // The general topic is protocol-defined as ID 1. Store and validate the ID;
  // names are display metadata and are never used for routing.
  if (config.topics.chat !== 1) {
    config.topics.chat = 1;
    persistence.save(config);
  }
  const chatTopic = await getTopic(client, config, 1);
  if (!chatTopic) {
    throw new Error("Workspace forum has no general Chat topic");
  }
  if (chatTopic.title !== TOPIC_TITLES.chat) {
    await client.invoke(new Api.channels.EditForumTopic({
      channel: workspaceInputChannel(config),
      topicId: 1,
      title: TOPIC_TITLES.chat,
    }));
  }
  // Telegram requires changing the General topic visibility in a separate RPC.
  if (chatTopic.hidden) {
    await client.invoke(new Api.channels.EditForumTopic({
      channel: workspaceInputChannel(config),
      topicId: 1,
      hidden: false,
    }));
  }

  for (const role of ["saved", "media", "settings", "system"] as const) {
    await ensureTopic(client, config, role, persistence);
  }
  return createWorkspaceRouter(config);
}
