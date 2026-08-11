import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { executeAnalysisReply } from "../analysisReply";

export const searchClaimCommand: CommandModule = {
  name: "searchclaim",
  match: (text) => matchesCommand(text, "searchclaim"),
  async run({ client, message, text, correlationId, provider }) {
    const claim = commandArgs(text, "searchclaim");
    if (!claim) {
      await message.reply({ message: `Напиши утверждение после ${commandText("searchclaim")}.` });
      return true;
    }
    await executeAnalysisReply({
      client, message, correlationId, provider, commandName: "searchclaim", prompt: claim,
      systemPrompt: `Check the supplied claim against the user's local Telegram history.
Use search_messages to look separately for supporting and contradicting evidence. If an @username appears, pass it in sender.
Output one verdict: "Подтверждается", "Опровергается", or "Недостаточно данных"; then list only directly relevant evidence with author/chat/date/short quote.
Do not treat absence as contradiction. Do not invent facts or rely on world knowledge. Reply in Russian unless the claim clearly uses another language.`,
    });
    return true;
  },
};
