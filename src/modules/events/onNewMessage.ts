import { NewMessageEvent } from "telegram/events";
import type { TelegramClient } from "telegram";
import { COMMANDS } from "../commands";
import { database } from "../../core/db";

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

let commandQueue = Promise.resolve();

export async function onNewMessage(event: NewMessageEvent, client: TelegramClient) {
  const message = event.message;
  if (!message) return;

  const text = normalizeText(message.text ?? "");
  const chatId = message.chatId?.toString() ?? "";
  const senderId = message.senderId?.toString() ?? "";

  // Log all messages (incoming and outgoing)
  database.logMessage({
    messageId: message.id,
    chatId,
    senderId,
    text,
    isOutgoing: message.out ?? false,
  });

  if (!message.out) return;
  if (!text.startsWith("!")) return;

  console.log("[event] new message:", {
    chatId,
    out: message.out,
    text: text.slice(0, 180),
  });

  for (const command of COMMANDS) {
    if (!command.match(text)) continue;
    
    // Queue command execution sequentially
    commandQueue = commandQueue.then(async () => {
      try {
        database.setQueueState(`executing: ${command.name}`);
        database.logEvent({
          eventType: "command_start",
          level: "info",
          category: "client",
          message: `Executing command: ${command.name}`,
          metadata: { chatId, text },
        });

        await command.run({ client, message, text });

        database.setQueueState("idle");
        database.logEvent({
          eventType: "command_success",
          level: "info",
          category: "client",
          message: `Successfully executed command: ${command.name}`,
          metadata: { chatId },
        });
      } catch (err: any) {
        console.error(`[event] Error executing command "${command.name}":`, err);
        database.setQueueState("idle");
        database.logEvent({
          eventType: "command_error",
          level: "error",
          category: "error",
          message: `Error executing command "${command.name}": ${err.message || String(err)}`,
          metadata: { chatId, error: String(err) },
        });
      }
    });
    return;
  }
}
