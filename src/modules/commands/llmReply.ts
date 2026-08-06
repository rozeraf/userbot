import { askCurrent } from "../../core/llm";
import { preview } from "../../core/llm/prompt";
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
  try {
    const startedAt = Date.now();
    const answer = await askCurrent(prompt, systemInstruction);
    console.log(`[${logPrefix}] model done inMs:`, Date.now() - startedAt);
    console.log(`[${logPrefix}] answer preview:`, preview(answer, 200));

    try {
      await client.sendMessage(message.chatId!, {
        message: answer,
        ...(replyToId ? { replyTo: replyToId } : {}),
      });
    } catch (sendErr) {
      console.error(`[${logPrefix}] telegram send message error:`, sendErr);
      try {
        await message.reply({ message: sendErrorMessage });
      } catch (replyErr) {
        console.error(`[${logPrefix}] failed to send Telegram error reply:`, replyErr);
      }
    }
  } catch (err) {
    console.error(`[${logPrefix}] error:`, err);
    try {
      await message.reply({ message: llmErrorMessage });
    } catch (replyErr) {
      console.error(`[${logPrefix}] failed to send LLM error reply:`, replyErr);
    }
    throw err;
  }
}
