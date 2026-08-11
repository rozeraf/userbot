import type { CommandContext } from "./types";
import { ToolRegistry } from "../../core/analysis/tools/registry";
import { runToolConversation } from "../../core/llm/toolLoop";
import { sendLlmResponse } from "../../core/telegram";
import { LoggedCommandError, errorMessage } from "../../core/errors";
import { resolveMentionedUsers } from "./resolveIdentities";

export async function executeAnalysisReply(options: Pick<CommandContext, "client" | "message" | "provider" | "correlationId"> & {
  commandName: string;
  prompt: string;
  systemPrompt: string;
  replyToId?: number;
}): Promise<void> {
  const { client, message, provider, correlationId, commandName, prompt, systemPrompt, replyToId } = options;
  try {
    const identityAliases = await resolveMentionedUsers(client, prompt);
    const result = await runToolConversation({
      provider,
      prompt,
      systemPrompt,
      registry: new ToolRegistry({ identityAliases }),
      context: { correlationId, commandName, chatId: message.chatId?.toString(), messageId: message.id },
    });
    await sendLlmResponse(client, message.chatId!, result.text, replyToId);
  } catch (err) {
    console.error(`[${commandName}] analysis failed:`, err);
    try { await message.reply({ message: "Ошибка при анализе истории, смотри логи." }); } catch {}
    throw new LoggedCommandError(errorMessage(err), { cause: err });
  }
}
