import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { resolveMentionedUsers } from "../resolveIdentities";
import { retrieveClaimEvidence, serializeClaimBundle } from "../../../core/analysis/claims/bundle";
import { executeLlmReply } from "../llmReply";
import { database } from "../../../core/db";

export const CLASSIFIER_PROMPT = `Classify the claim using ONLY the fixed evidence bundle supplied by the application.

Rules:
- First identify the subject of the claim.
- A statement supports or contradicts the claim only when its subject is the same person or entity as the claim subject.
- Never attribute a statement about another person, relative, pet, possession, or other entity to the message author.
- Resolve pronouns, possessives, omitted subjects, negation, and nearby wording before classifying evidence.
- "I am X" is about the author. "I am not X" contradicts that property. "My friend/pet/relative is X" is not about the author.
- Merely discussing a topic, precautions, risks, or another person's experience neither supports nor contradicts a personal claim.
- Absence of evidence is not contradiction.
- lexicalMatches and recentBySubject are retrieval groups, not truth labels.
- linguisticSignals are deterministic reading aids, not verdicts; verify them against the quoted text.
- Never use outside knowledge and never invent missing context.

Output exactly one verdict on the first line: "Подтверждается", "Опровергается", or "Недостаточно данных".
Then cite only directly relevant evidence using author, chat, ISO date, and a short exact quote. If none is directly relevant, do not cite tangential messages.`;

export const searchClaimCommand: CommandModule = {
  name: "searchclaim",
  match: (text) => matchesCommand(text, "searchclaim"),
  async run({ client, message, text, correlationId, provider }) {
    const claim = commandArgs(text, "searchclaim");
    if (!claim) {
      await message.reply({ message: `Напиши утверждение после ${commandText("searchclaim")}.` });
      return true;
    }

    const aliases = await resolveMentionedUsers(client, claim);
    const bundle = retrieveClaimEvidence(claim, aliases);
    const evidenceIds = [...bundle.lexicalMatches, ...bundle.recentBySubject]
      .map((item) => item.dbMessageId);
    database.logEvent({
      eventType: "claim_retrieval_complete",
      level: "info",
      category: "llm",
      message: `Claim retrieval completed with ${evidenceIds.length} evidence item(s)`,
      metadata: {
        correlationId,
        provider,
        subject: bundle.subject,
        chat: bundle.chat,
        query: bundle.retrievalQuery,
        lexicalEvidenceIds: bundle.lexicalMatches.map((item) => item.dbMessageId),
        recentEvidenceIds: bundle.recentBySubject.map((item) => item.dbMessageId),
      },
    });

    await executeLlmReply({
      client,
      message,
      provider,
      prompt: `<claim-evidence-bundle>\n${serializeClaimBundle(bundle)}\n</claim-evidence-bundle>`,
      systemInstruction: CLASSIFIER_PROMPT,
      logPrefix: "searchclaim",
      auditContext: { correlationId, commandName: "searchclaim", chatId: message.chatId?.toString(), messageId: message.id },
      sendErrorMessage: "Ошибка при отправке результата проверки.",
      llmErrorMessage: "Ошибка при проверке утверждения, смотри логи.",
    });
    return true;
  },
};
