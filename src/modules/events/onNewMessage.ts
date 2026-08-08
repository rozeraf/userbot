import { NewMessageEvent } from "telegram/events";
import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import { COMMANDS } from "../commands";
import { database } from "../../core/db";
import { randomBytes } from "crypto";
import { errorMessage, isLoggedCommandError } from "../../core/errors";
import { consumeServiceMessage } from "../../core/telegram";
import { state } from "../../core/state";
import { COMMAND_PREFIX, commandText } from "../../config/commands";

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

  // Synchronously determine if this is a command to lock its order in the queue
  let matchedCmd: typeof COMMANDS[number] | undefined;
  if (isOutgoing && !isServiceMessage && text.startsWith(COMMAND_PREFIX)) {
    matchedCmd = COMMANDS.find((c) => c.match(text));
  }

  // Names are display metadata, not part of command execution. Avoid a network
  // lookup altogether for commands, and resolve them concurrently for messages.
  const chatPromise = matchedCmd
    ? Promise.resolve(undefined)
    : message.getChat().then(resolveEntityName).catch(() => undefined);
  const senderPromise = (!isOutgoing && !matchedCmd)
    ? message.getSender().then(resolveEntityName).catch(() => undefined)
    : Promise.resolve(undefined);

  if (matchedCmd) {
    const cmd = matchedCmd;
    // Provider is part of the command's input: a switch in another chat must
    // not change this command while it waits in its per-chat queue.
    const provider = state.getProvider();
    enqueueCommand(chatId, async () => {
      activeCommands++;
      // Display metadata must never hold a command queue.
      database.logMessage({
        messageId:  message.id,
        chatId,
        senderId,
        text,
        isOutgoing: true,
        telegramTimestamp: message.date ? message.date * 1000 : null,
        chatTitle: null,
        senderName: null,
      });

      console.log("[event] executing queued command:", {
        chatId,
        text: text.slice(0, 180),
      });

      const correlationId = randomBytes(12).toString("hex");
      let claimed = false;
      let succeeded = false;
      let failure: string | undefined;
      try {
        claimed = database.beginCommand({ chatId, messageId: message.id, commandName: cmd.name, correlationId, provider });
        if (!claimed) {
          console.warn("[event] ignored duplicate command update:", { chatId, messageId: message.id });
          return;
        }
        database.setQueueState(`executing: ${activeCommands} command(s)`);
        database.logEvent({
          eventType: "command_start",
          level: "info",
          category: "client",
          message: `Executing command: ${cmd.name}`,
          metadata: { chatId, text, correlationId, commandName: cmd.name, provider },
        });

        await cmd.run({ client, message, text, correlationId, provider });
        succeeded = true;

        database.logEvent({
          eventType: "command_success",
          level: "info",
          category: "client",
          message: `Successfully executed command: ${cmd.name}`,
          metadata: { chatId, correlationId, commandName: cmd.name },
        });
      } catch (err: unknown) {
        failure = errorMessage(err);
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
        // A failed claim is retained deliberately: replaying a Telegram update
        // must not generate a second paid LLM request or duplicate reply.
        if (claimed) {
          try {
            database.finishCommand(chatId, message.id, succeeded ? "succeeded" : "failed", failure);
          } catch (finishErr) {
            console.error("[event] failed to finalize command execution:", finishErr);
          }
        }
        activeCommands--;
        database.setQueueState(activeCommands > 0 ? `executing: ${activeCommands} command(s)` : "idle");
      }
    });
  } else {
    if (isOutgoing && !isServiceMessage && text.startsWith(COMMAND_PREFIX)) {
      void message.reply({ message: `Неизвестная команда. Используй ${commandText("help")} для списка команд.` })
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
