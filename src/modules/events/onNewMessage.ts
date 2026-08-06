import { NewMessageEvent } from "telegram/events";
import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import { COMMANDS } from "../commands";
import { database } from "../../core/db";
import { randomBytes } from "crypto";

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** Resolve a human-readable name from any GramJS entity type */
function resolveEntityName(entity: any): string | undefined {
  if (!entity) return undefined;
  if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
    return entity.title || undefined;
  }
  if (entity instanceof Api.User) {
    const parts = [entity.firstName, entity.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : (entity.username ?? undefined);
  }
  return undefined;
}

// Sequential queue to guarantee command execution order exactly matching arrival order
let commandQueue = Promise.resolve();

export function onNewMessage(event: NewMessageEvent, client: TelegramClient) {
  const message = event.message;
  if (!message) return;

  const text = normalizeText(message.text ?? "");
  const chatId = message.chatId?.toString() ?? "";
  const senderId = message.senderId?.toString() ?? "";
  const isOutgoing = message.out ?? false;

  // ── Resolve names in parallel immediately upon arrival ──────────────────────
  const chatPromise = message.getChat()
    .then(resolveEntityName)
    .catch(() => undefined);

  const senderPromise = (!isOutgoing)
    ? message.getSender().then(resolveEntityName).catch(() => undefined)
    : Promise.resolve(undefined);

  // Synchronously determine if this is a command to lock its order in the queue
  let matchedCmd: typeof COMMANDS[number] | undefined;
  if (isOutgoing && text.startsWith("!")) {
    matchedCmd = COMMANDS.find((c) => c.match(text));
  }

  if (matchedCmd) {
    const cmd = matchedCmd;
    // Chain command execution synchronously to secure the execution sequence slot
    commandQueue = commandQueue.then(async () => {
      // 1. Wait for name resolution (which started in parallel when message arrived)
      const chatTitle = await chatPromise;
      const senderName = await senderPromise;

      // 2. Log the command message to the DB (guarantees command message is logged before execution logs)
      database.logMessage({
        messageId:  message.id,
        chatId,
        senderId,
        text,
        isOutgoing: true,
        chatTitle:  chatTitle ?? null,
        senderName: senderName ?? null,
      });

      console.log("[event] executing queued command:", {
        chatId,
        chatTitle,
        text: text.slice(0, 180),
      });

      const correlationId = randomBytes(6).toString("hex");

      try {
        database.setQueueState(`executing: ${cmd.name}`);
        database.logEvent({
          eventType: "command_start",
          level: "info",
          category: "client",
          message: `Executing command: ${cmd.name}`,
          metadata: { chatId, chatTitle, text, correlationId, commandName: cmd.name },
        });

        await cmd.run({ client, message, text });

        database.setQueueState("idle");
        database.logEvent({
          eventType: "command_success",
          level: "info",
          category: "client",
          message: `Successfully executed command: ${cmd.name}`,
          metadata: { chatId, correlationId, commandName: cmd.name },
        });
      } catch (err: any) {
        console.error(`[event] Error executing command "${cmd.name}":`, err);
        database.setQueueState("idle");
        database.logEvent({
          eventType: "command_error",
          level: "error",
          category: "error",
          message: `Error executing command "${cmd.name}": ${err.message || String(err)}`,
          metadata: { chatId, correlationId, commandName: cmd.name, error: String(err) },
        });
      }
    });
  } else {
    // Non-command message: log asynchronously as soon as names are resolved, without blocking the queue
    Promise.all([chatPromise, senderPromise])
      .then(([chatTitle, senderName]) => {
        database.logMessage({
          messageId:  message.id,
          chatId,
          senderId,
          text,
          isOutgoing,
          chatTitle:  chatTitle ?? null,
          senderName: senderName ?? null,
        });
      })
      .catch((err) => {
        console.error("[event] failed to resolve entities for message logging:", err);
      });
  }
}
