import { Api, type TelegramClient } from "telegram";
import { errorMessage } from "../../core/errors";

export async function resolveMentionedUsers(client: TelegramClient, text: string): Promise<Map<string, string>> {
  const usernames = [...new Set([...text.matchAll(/@([a-zA-Z0-9_]{5,32})/g)]
    .map((match) => match[1]!.toLowerCase()))];
  const aliases = new Map<string, string>();
  await Promise.all(usernames.map(async (username) => {
    try {
      const entity = await client.getEntity(username);
      if (entity instanceof Api.User) aliases.set(username, entity.id.toString());
    } catch (err) {
      console.warn("[analysis] could not resolve username:", { username, error: errorMessage(err) });
    }
  }));
  return aliases;
}
