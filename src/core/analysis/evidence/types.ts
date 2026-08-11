export type MessageLocator = Readonly<{ openUrl?: string }>;

export type MessageEvidence = Readonly<{
  dbMessageId: number;
  telegram: Readonly<{ chatId: string; messageId: number }>;
  author: Readonly<{ senderId: string | null; displayName: string | null }>;
  chat: Readonly<{ title: string | null }>;
  timestamp: number;
  text: string;
  locator?: MessageLocator;
}>;
