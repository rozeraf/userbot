import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: integer("message_id").notNull(),
    chatId: text("chat_id").notNull(),
    senderId: text("sender_id"),
    text: text("text"),
    timestamp: integer("timestamp").notNull(),
    isOutgoing: integer("is_outgoing", { mode: "boolean" }).notNull(),
  },
  (t) => [index("idx_messages_chat_timestamp").on(t.chatId, t.timestamp)]
);

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    prompt: text("prompt").notNull(),
    response: text("response"),
    latencyMs: integer("latency_ms").notNull(),
    error: text("error"),
    timestamp: integer("timestamp").notNull(),
  },
  (t) => [index("idx_llm_calls_timestamp").on(t.timestamp)]
);

export const eventLog = sqliteTable(
  "event_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull(),
    message: text("message").notNull(),
    metadata: text("metadata"), // JSON string
    timestamp: integer("timestamp").notNull(),
  },
  (t) => [index("idx_event_log_timestamp").on(t.timestamp)]
);

// Infer insert types directly from schema — no manual interfaces needed
export type NewMessage = typeof messages.$inferInsert;
export type NewLLMCall = typeof llmCalls.$inferInsert;
export type NewEvent = typeof eventLog.$inferInsert;
