import { askCurrent } from "../../core/llm";
import { preview } from "../../core/llm/prompt";
import { LoggedCommandError, errorMessage } from "../../core/errors";
import { database } from "../../core/db";
import type { CommandContext } from "./types";

type Options = Pick<CommandContext, "client" | "message"> & {
  prompt: string;
  systemInstruction?: string;
  replyToId?: number;
  sendErrorMessage: string;
  llmErrorMessage: string;
  logPrefix: string;
};

/** Execute an LLM request and deliver its result with consistent error handling. */
export async function executeLlmReply({
  client,
  message,
  prompt,
  systemInstruction,
  replyToId,
  sendErrorMessage,
  llmErrorMessage,
  logPrefix,
}: Options): Promise<void> {
  let answer: string;
  try {
    const startedAt = Date.now();
    answer = await askCurrent(prompt, systemInstruction);
    console.log(`[${logPrefix}] model done inMs:`, Date.now() - startedAt);
    console.log(`[${logPrefix}] answer preview:`, preview(answer, 200));
  } catch (err) {
    console.error(`[${logPrefix}] error:`, err);
    try {
      await message.reply({ message: llmErrorMessage });
    } catch (replyErr) {
      console.error(`[${logPrefix}] failed to send LLM error reply:`, replyErr);
    }
    throw new LoggedCommandError(errorMessage(err), { cause: err });
  }

  try {
    await client.sendMessage(message.chatId!, {
      message: answer,
      ...(replyToId ? { replyTo: replyToId } : {}),
    });
  } catch (err) {
    console.error(`[${logPrefix}] telegram send message error:`, err);
    database.logEvent({
      eventType: "telegram_send_error",
      level: "error",
      category: "error",
      message: `Failed to send ${logPrefix} response: ${errorMessage(err)}`,
    });
    try {
      await message.reply({ message: sendErrorMessage });
    } catch (replyErr) {
      console.error(`[${logPrefix}] failed to send Telegram error reply:`, replyErr);
    }
    throw new LoggedCommandError(errorMessage(err), { cause: err });
  }
}
