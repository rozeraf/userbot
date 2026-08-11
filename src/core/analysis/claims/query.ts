import { normalizeIdentity } from "../history/normalization";

const STOP_WORDS = new Set([
  "правда", "ли", "то", "что", "это", "этот", "эта", "этом", "с", "со", "из", "чата",
  "про", "насчет", "насчёт", "у", "в", "на", "the", "is", "it", "true", "that", "from", "chat",
]);

export function claimSearchQuery(claim: string, subjectLabel?: string, chatLabel?: string): string {
  const excluded = new Set([
    ...normalizeIdentity(subjectLabel ?? "").split(/\s+/),
    ...normalizeIdentity(chatLabel ?? "").split(/\s+/),
  ].filter(Boolean));
  return normalizeIdentity(claim.replace(/@[a-zA-Z0-9_]{5,32}/g, " "))
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term) && !excluded.has(term))
    .slice(-6)
    .join(" ");
}
