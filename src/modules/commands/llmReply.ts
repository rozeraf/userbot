import { askCurrent, type LlmRequestContext } from "../../core/llm";
import { LoggedCommandError, errorMessage } from "../../core/errors";
import { database } from "../../core/db";
import { sendLlmResponse } from "../../core/telegram";
import type { CommandContext } from "./types";

type Options = Pick<CommandContext, "client" | "message"> & {
  prompt: string;
  systemInstruction?: string;
  replyToId?: number;
  sendErrorMessage: string;
  llmErrorMessage: string;
  logPrefix: string;
  auditContext?: LlmRequestContext;
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
  auditContext,
}: Options): Promise<void> {
  let answer: string;
  try {
    const startedAt = Date.now();
    answer = await askCurrent(prompt, systemInstruction, auditContext);
    console.log(`[${logPrefix}] model done inMs:`, Date.now() - startedAt);
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
    await sendLlmResponse(client, message.chatId!, answer, replyToId);
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
