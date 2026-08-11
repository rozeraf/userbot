import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { executeAnalysisReply } from "../analysisReply";

export const personCommand: CommandModule = {
  name: "person",
  match: (text) => matchesCommand(text, "person"),
  async run({ client, message, text, correlationId, provider }) {
    const input = commandArgs(text, "person");
    if (!/@[a-zA-Z0-9_]{5,32}/.test(input)) {
      await message.reply({ message: `Укажи пользователя: ${commandText("person")} @username [что выяснить].` });
      return true;
    }
    await executeAnalysisReply({
      client, message, correlationId, provider, commandName: "person", prompt: input,
      systemPrompt: `Analyze only the local Telegram history for the specified @username.
Always call search_messages with that username in the sender field. Search more than once only when different content keywords are necessary.
Summarize stable observations, recent activity, relevant chats, and directly requested facts. Distinguish quoted evidence from inference.
Never infer sensitive traits or facts absent from evidence. Include concise author/chat/date/quote attribution. Reply in the user's language.`,
    });
    return true;
  },
};
