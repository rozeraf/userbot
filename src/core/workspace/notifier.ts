import type { TelegramClient } from "telegram";
import { registerServiceMessage } from "../telegram";
import { workspaceInputChannel } from "./peer";
import type { WorkspaceRouter } from "./types";

type SystemEvent = {
  level: "info" | "warn" | "error";
  category?: string;
  message: string;
};

export type WorkspaceSystemNotifier = {
  notify(message: string): Promise<void>;
  notifyEvent(event: SystemEvent): Promise<void>;
};

export function createWorkspaceSystemNotifier(
  client: TelegramClient,
  workspace: WorkspaceRouter,
): WorkspaceSystemNotifier {
  let queue = Promise.resolve();

  const enqueue = (message: string): Promise<void> => {
    const run = queue.then(async () => {
      const topicId = workspace.config.topics.system;
      if (!topicId) throw new Error("Workspace System topic is not configured");
      const sent = await client.sendMessage(workspaceInputChannel(workspace.config), {
        message: [...message].slice(0, 3_500).join(""),
        replyTo: topicId,
      });
      registerServiceMessage(sent, workspace.config.chatId);
    });
    queue = run.catch((err) => console.error("[workspace/system] notification failed:", err));
    return run;
  };

  return {
    notify: enqueue,
    notifyEvent(event) {
      const icon = event.level === "error" ? "🔴" : event.level === "warn" ? "🟡" : "ℹ️";
      return enqueue(`${icon} [${event.category ?? "system"}] ${event.message}`);
    },
  };
}
