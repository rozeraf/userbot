import { sqlite } from "../../db/client";
import { normalizeIdentity } from "./normalization";

export type IdentityCandidate = Readonly<{
  kind: "sender" | "chat";
  id: string;
  displayName: string;
  messageCount: number;
}>;

/** Resolves locally observed names only; it never performs Telegram network lookups. */
export class IdentityResolver {
  resolve(input: string, limit = 10): IdentityCandidate[] {
    const needle = input.trim();
    if (!needle) return [];
    const pattern = `%${needle.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
    return sqlite.query<IdentityCandidate, [string, string, string, number]>(`
      SELECT 'sender' AS kind, sender_id AS id, MAX(sender_name) AS displayName, COUNT(*) AS messageCount
      FROM messages
      WHERE sender_id IS NOT NULL AND (sender_name LIKE ? ESCAPE '\\' OR sender_username LIKE ? ESCAPE '\\')
      GROUP BY sender_id
      UNION ALL
      SELECT 'chat' AS kind, chat_id AS id, MAX(chat_title) AS displayName, COUNT(*) AS messageCount
      FROM messages
      WHERE chat_title LIKE ? ESCAPE '\\'
      GROUP BY chat_id
      ORDER BY messageCount DESC
      LIMIT ?
    `).all(pattern, pattern, pattern, safeLimit);
  }

  findSenderInText(input: string): IdentityCandidate | null {
    const haystack = ` ${normalizeIdentity(input)} `;
    const rows = sqlite.query<IdentityCandidate, []>(`
      SELECT 'sender' AS kind, sender_id AS id,
             COALESCE(MAX(sender_name), MAX(sender_username), sender_id) AS displayName,
             COUNT(*) AS messageCount
      FROM messages WHERE sender_id IS NOT NULL GROUP BY sender_id
    `).all();
    return rows
      .filter((row) => {
        const name = normalizeIdentity(row.displayName);
        return name.length >= 3 && haystack.includes(` ${name} `);
      })
      .sort((a, b) => normalizeIdentity(b.displayName).length - normalizeIdentity(a.displayName).length
        || b.messageCount - a.messageCount)[0] ?? null;
  }

  findChatInText(input: string): IdentityCandidate | null {
    const haystack = ` ${normalizeIdentity(input)} `;
    const rows = sqlite.query<IdentityCandidate, []>(`
      SELECT 'chat' AS kind, chat_id AS id, COALESCE(MAX(chat_title), chat_id) AS displayName,
             COUNT(*) AS messageCount
      FROM messages WHERE chat_id IS NOT NULL GROUP BY chat_id
    `).all();
    return rows
      .filter((row) => {
        const name = normalizeIdentity(row.displayName);
        return name.length >= 3 && haystack.includes(` ${name} `);
      })
      .sort((a, b) => normalizeIdentity(b.displayName).length - normalizeIdentity(a.displayName).length
        || b.messageCount - a.messageCount)[0] ?? null;
  }
}
