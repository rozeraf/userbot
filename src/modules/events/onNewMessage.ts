import { NewMessageEvent } from "telegram/events";
import type { TelegramClient } from "telegram";
import { COMMANDS } from "../commands";

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

let commandQueue = Promise.resolve();

export async function onNewMessage(event: NewMessageEvent, client: TelegramClient) {
  const message = event.message;
  const text = normalizeText(message?.text ?? "");

  if (!message?.out) return;
  if (!text.startsWith("!")) return;

  console.log("[event] new message:", {
    chatId: message?.chatId?.toString?.(),
    out: message?.out,
    text: text.slice(0, 180),
  });

  for (const command of COMMANDS) {
    if (!command.match(text)) continue;
    
    // Queue command execution sequentially
    commandQueue = commandQueue.then(async () => {
      try {
        await command.run({ client, message, text });
      } catch (err) {
        console.error(`[event] Error executing command "${command.name}":`, err);
      }
    });
    return;
  }
}
