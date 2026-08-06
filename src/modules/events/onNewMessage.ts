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

let commandQueue = Promise.resolve();

export async function onNewMessage(event: NewMessageEvent, client: TelegramClient) {
  const message = event.message;
  if (!message) return;

  const text = normalizeText(message.text ?? "");
  const chatId = message.chatId?.toString() ?? "";
  const senderId = message.senderId?.toString() ?? "";

  // ── Resolve human-readable names (best-effort, non-blocking) ───────────────
  let chatTitle: string | undefined;
  let senderName: string | undefined;

  try {
    const chat = await message.getChat();
    chatTitle = resolveEntityName(chat);
  } catch { /* ignore — don't block logging on network failure */ }

  // For outgoing messages we ARE the sender — skip sender resolution
  if (!message.out) {
    try {
      const sender = await message.getSender();
      senderName = resolveEntityName(sender);
    } catch { /* ignore */ }
  }

  // Log all messages (incoming and outgoing) with resolved names
  database.logMessage({
    messageId:  message.id,
    chatId,
    senderId,
    text,
    isOutgoing: message.out ?? false,
    chatTitle:  chatTitle ?? null,
    senderName: senderName ?? null,
  });

  if (!message.out) return;
  if (!text.startsWith("!")) return;

  console.log("[event] new message:", {
    chatId,
    chatTitle,
    out: message.out,
    text: text.slice(0, 180),
  });

  for (const command of COMMANDS) {
    if (!command.match(text)) continue;

    // Queue command execution sequentially
    commandQueue = commandQueue.then(async () => {
      // Unique ID to correlate start → success/error in TUI
      const correlationId = randomBytes(6).toString("hex");

      try {
        database.setQueueState(`executing: ${command.name}`);
        database.logEvent({
          eventType: "command_start",
          level: "info",
          category: "client",
          message: `Executing command: ${command.name}`,
          metadata: { chatId, chatTitle, text, correlationId, commandName: command.name },
        });

        await command.run({ client, message, text });

        database.setQueueState("idle");
        database.logEvent({
          eventType: "command_success",
          level: "info",
          category: "client",
          message: `Successfully executed command: ${command.name}`,
          metadata: { chatId, correlationId, commandName: command.name },
        });
      } catch (err: any) {
        console.error(`[event] Error executing command "${command.name}":`, err);
        database.setQueueState("idle");
        database.logEvent({
          eventType: "command_error",
          level: "error",
          category: "error",
          message: `Error executing command "${command.name}": ${err.message || String(err)}`,
          metadata: { chatId, correlationId, commandName: command.name, error: String(err) },
        });
      }
    });
    return;
  }
}
