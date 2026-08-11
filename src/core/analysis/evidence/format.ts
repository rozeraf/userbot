import type { MessageEvidence } from "./types";

export function formatEvidence(items: readonly MessageEvidence[]): string {
  if (items.length === 0) return "Ничего не найдено.";
  return items.map((item) => {
    const author = item.author.username
      ? `${item.author.displayName ?? item.author.senderId ?? "Автор"} (@${item.author.username})`
      : item.author.displayName ?? item.author.senderId ?? "Неизвестный автор";
    const chat = item.chat.title ?? item.telegram.chatId;
    const date = new Date(item.timestamp).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
    return `${author} · ${chat}\n${date}\n«${item.text}»`;
  }).join("\n\n");
}
