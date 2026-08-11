import type { MessageEvidence } from "../evidence/types";
import { HistoryRepository } from "../history/repository";
import { IdentityResolver } from "../history/identity";
import { claimSearchQuery } from "./query";
import { normalizeIdentity } from "../history/normalization";
import { hybridSearch } from "../history/hybrid";

export type ClaimEvidenceBundle = Readonly<{
  claim: string;
  subject: Readonly<{ senderId: string; label: string }> | null;
  chat: Readonly<{ chatId: string; title: string }> | null;
  retrievalQuery: string;
  lexicalMatches: readonly MessageEvidence[];
  recentBySubject: readonly MessageEvidence[];
}>;

const history = new HistoryRepository();
const identities = new IdentityResolver();

export async function retrieveClaimEvidence(claim: string, aliases: ReadonlyMap<string, string>): Promise<ClaimEvidenceBundle> {
  const usernameEntry = aliases.entries().next().value as [string, string] | undefined;
  const localSubject = usernameEntry ? null : identities.findSenderInText(claim);
  const subject = usernameEntry
    ? { senderId: usernameEntry[1], label: `@${usernameEntry[0]}` }
    : localSubject ? { senderId: localSubject.id, label: localSubject.displayName } : null;
  const localChat = identities.findChatInText(claim);
  const chat = localChat ? { chatId: localChat.id, title: localChat.displayName } : null;
  const retrievalQuery = claimSearchQuery(claim, subject?.label, chat?.title);

  const lexicalQueries = [retrievalQuery, ...retrievalQuery.split(/\s+/).reverse()]
    .filter((query, index, all) => query && all.indexOf(query) === index);
  const lexicalMatches = (await Promise.all(lexicalQueries.map((query) => hybridSearch({
    query,
    senderId: subject?.senderId,
    chatId: chat?.chatId,
    limit: 12,
  })))).flat()
    .filter((item, index, all) => all.findIndex((other) => other.dbMessageId === item.dbMessageId) === index)
    .slice(0, 12);
  const recentBySubject = subject
    ? history.messagesBySender(subject.senderId, "", 8, chat?.chatId)
        .filter((item) => !lexicalMatches.some((match) => match.dbMessageId === item.dbMessageId))
    : [];

  return { claim, subject, chat, retrievalQuery, lexicalMatches, recentBySubject };
}

export function serializeClaimBundle(bundle: ClaimEvidenceBundle): string {
  const queryTerms = bundle.retrievalQuery.split(/\s+/).filter(Boolean);
  const excerpt = (text: string): string => {
    if (text.length <= 500) return text;
    const normalized = normalizeIdentity(text);
    const anchors = ["сама не", "сам не", "я не", ...queryTerms]
      .map((term) => normalized.indexOf(normalizeIdentity(term)))
      .filter((index) => index >= 0);
    const approximate = anchors.length ? Math.min(...anchors) : 0;
    const start = Math.max(0, approximate - 120);
    return `${start > 0 ? "…" : ""}${text.slice(start, start + 500)}${start + 500 < text.length ? "…" : ""}`;
  };
  const score = (item: MessageEvidence): number => {
    const text = normalizeIdentity(item.text);
    const termScore = queryTerms.reduce((total, term) => total + (text.includes(term.slice(0, 4)) ? 3 : 0), 0);
    const firstPerson = /\b(я|мне|меня|мной|сама|сам|боюсь|думаю|считаю)\b/u.test(text);
    const negation = /\b(не|нет|никогда)\b/u.test(text);
    return termScore + (firstPerson ? 3 : 0) + (firstPerson && negation ? 4 : 0) + (item.text.length <= 500 ? 1 : 0);
  };
  const serialize = (item: MessageEvidence) => ({
    ...item,
    timestamp: new Date(item.timestamp).toISOString(),
    text: excerpt(item.text),
    linguisticSignals: {
      firstPersonSelfReference: /\b(я|мне|меня|мной|сама|сам|боюсь|думаю|считаю)\b/u.test(normalizeIdentity(item.text)),
      negationPresent: /\b(не|нет|никогда)\b/u.test(normalizeIdentity(item.text)),
      possessiveOrOtherEntityReference: /\b(мой|моя|мое|моё|мои|друг|подруга|брат|сестра|питомец|собака)\b/u.test(normalizeIdentity(item.text)),
    },
  });
  const ranked = (items: readonly MessageEvidence[]) => [...items]
    .sort((a, b) => score(b) - score(a) || b.timestamp - a.timestamp)
    .slice(0, 8)
    .map(serialize);
  return JSON.stringify({
    claim: bundle.claim,
    resolvedSubject: bundle.subject,
    resolvedChat: bundle.chat,
    retrievalQuery: bundle.retrievalQuery,
    lexicalMatches: ranked(bundle.lexicalMatches),
    recentBySubject: ranked(bundle.recentBySubject),
  });
}
