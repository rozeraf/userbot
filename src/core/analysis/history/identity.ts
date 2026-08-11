import { sqlite } from "../../db/client";

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
}
