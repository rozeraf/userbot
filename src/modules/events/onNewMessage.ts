import { NewMessageEvent } from "telegram/events";
import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import { COMMANDS } from "../commands";
import { database } from "../../core/db";
import { randomBytes } from "crypto";
import { errorMessage, isLoggedCommandError } from "../../core/errors";
import { consumeServiceMessage } from "../../core/telegram";

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** Resolve a human-readable name from any GramJS entity type */
function resolveEntityName(entity: unknown): string | undefined {
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

// Commands remain ordered within one chat, while a slow LLM call in one chat does
// not block unrelated chats. Provider changes are applied when their command runs.
const commandQueues = new Map<string, Promise<void>>();
let activeCommands = 0;

function enqueueCommand(chatId: string, job: () => Promise<void>): void {
  const previous = commandQueues.get(chatId) ?? Promise.resolve();
  const next = previous
    .catch((err: unknown) => {
      console.error("[event] Recovered command queue after an unexpected failure:", err);
    })
    .then(job);

  commandQueues.set(chatId, next);
  void next.finally(() => {
    if (commandQueues.get(chatId) === next) commandQueues.delete(chatId);
  });
}

export function onNewMessage(event: NewMessageEvent, client: TelegramClient) {
  const message = event.message;
  if (!message) return;

  const text = normalizeText(message.text ?? "");
  const chatId = message.chatId?.toString() ?? "";
  const senderId = message.senderId?.toString() ?? "";
  const isOutgoing = message.out ?? false;
  const isServiceMessage = isOutgoing && consumeServiceMessage(chatId, message.id);

  // ── Resolve names in parallel immediately upon arrival ──────────────────────
  const chatPromise = message.getChat()
    .then(resolveEntityName)
    .catch(() => undefined);

  const senderPromise = (!isOutgoing)
    ? message.getSender().then(resolveEntityName).catch(() => undefined)
    : Promise.resolve(undefined);

  // Synchronously determine if this is a command to lock its order in the queue
  let matchedCmd: typeof COMMANDS[number] | undefined;
  if (isOutgoing && !isServiceMessage && text.startsWith("!")) {
    matchedCmd = COMMANDS.find((c) => c.match(text));
  }

  if (matchedCmd) {
    const cmd = matchedCmd;
    enqueueCommand(chatId, async () => {
      activeCommands++;
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
        telegramTimestamp: message.date ? message.date * 1000 : null,
        chatTitle:  chatTitle ?? null,
        senderName: senderName ?? null,
      });

      console.log("[event] executing queued command:", {
        chatId,
        chatTitle,
        text: text.slice(0, 180),
      });

      let correlationId: string | undefined;
      try {
        correlationId = randomBytes(6).toString("hex");
        database.setQueueState(`executing: ${activeCommands} command(s)`);
        database.logEvent({
          eventType: "command_start",
          level: "info",
          category: "client",
          message: `Executing command: ${cmd.name}`,
          metadata: { chatId, chatTitle, text, correlationId, commandName: cmd.name },
        });

        await cmd.run({ client, message, text, correlationId });

        database.logEvent({
          eventType: "command_success",
          level: "info",
          category: "client",
          message: `Successfully executed command: ${cmd.name}`,
          metadata: { chatId, correlationId, commandName: cmd.name },
        });
      } catch (err: unknown) {
        console.error(`[event] Error executing command "${cmd.name}":`, err);
        const alreadyLogged = isLoggedCommandError(err);
        database.logEvent({
          eventType: "command_error",
          level: alreadyLogged ? "warn" : "error",
          category: alreadyLogged ? "client" : "error",
          message: `Error executing command "${cmd.name}": ${errorMessage(err)}`,
          metadata: { chatId, correlationId, commandName: cmd.name, error: errorMessage(err), alreadyLogged },
        });
      } finally {
        activeCommands--;
        database.setQueueState(activeCommands > 0 ? `executing: ${activeCommands} command(s)` : "idle");
      }
    });
  } else {
    if (isOutgoing && !isServiceMessage && text.startsWith("!")) {
      void message.reply({ message: "Неизвестная команда. Используй !help для списка команд." })
        .catch((err) => console.error("[event] failed to send unknown-command reply:", err));
    }
    // Non-command message: log asynchronously as soon as names are resolved, without blocking the queue
    Promise.all([chatPromise, senderPromise])
      .then(([chatTitle, senderName]) => {
        database.logMessage({
          messageId:  message.id,
          chatId,
          senderId,
          text,
          isOutgoing,
          telegramTimestamp: message.date ? message.date * 1000 : null,
          chatTitle:  chatTitle ?? null,
          senderName: senderName ?? null,
        });
      })
      .catch((err) => {
        console.error("[event] failed to resolve entities for message logging:", err);
      });
  }
}
