import { sqliteTable, integer, text, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable(
  "messages",
  {
    id:         integer("id").primaryKey({ autoIncrement: true }),
    messageId:  integer("message_id").notNull(),
    chatId:     text("chat_id").notNull(),
    senderId:   text("sender_id"),
    text:       text("text"),
    telegramTimestamp: integer("telegram_timestamp"),
    timestamp:  integer("timestamp").notNull(),
    isOutgoing: integer("is_outgoing", { mode: "boolean" }).notNull(),
    chatTitle:  text("chat_title"),   // denormalized: resolved at log time
    senderName: text("sender_name"),  // denormalized: resolved at log time
  },
  (t) => [
    uniqueIndex("uq_messages_chat_message").on(t.chatId, t.messageId),
    index("idx_messages_chat_telegram_timestamp").on(t.chatId, t.telegramTimestamp),
    index("idx_messages_timestamp").on(t.timestamp),
  ]
);

/** Incrementally maintained chat list metadata for the TUI. */
export const chatSummary = sqliteTable(
  "chat_summary",
  {
    chatId: text("chat_id").primaryKey(),
    chatTitle: text("chat_title"),
    lastTimestamp: integer("last_timestamp").notNull(),
    messageCount: integer("message_count").notNull(),
  },
  (t) => [index("idx_chat_summary_last_timestamp").on(t.lastTimestamp)],
);

/** Durable idempotency record for a command message received from Telegram. */
export const commandExecutions = sqliteTable(
  "command_executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: text("chat_id").notNull(),
    messageId: integer("message_id").notNull(),
    commandName: text("command_name").notNull(),
    correlationId: text("correlation_id").notNull(),
    provider: text("provider").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    error: text("error"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    uniqueIndex("uq_command_executions_chat_message").on(t.chatId, t.messageId),
    index("idx_command_executions_status_started").on(t.status, t.startedAt),
    index("idx_command_executions_started").on(t.startedAt),
  ]
);

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    correlationId: text("correlation_id"),
    commandName: text("command_name"),
    chatId: text("chat_id"),
    messageId: integer("message_id"),
    prompt: text("prompt").notNull(),
    response: text("response"),
    latencyMs: integer("latency_ms").notNull(),
    error: text("error"),
    timestamp: integer("timestamp").notNull(),
  },
  (t) => [
    index("idx_llm_calls_timestamp").on(t.timestamp),
    index("idx_llm_calls_correlation").on(t.correlationId),
  ]
);

export const eventLog = sqliteTable(
  "event_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull(),
    category: text("category", { enum: ["system", "client", "server", "llm", "error"] }).notNull().default("system"),
    message: text("message").notNull(),
    metadata: text("metadata"), // JSON string
    timestamp: integer("timestamp").notNull(),
  },
  (t) => [
    index("idx_event_log_timestamp").on(t.timestamp),
    index("idx_event_log_category_id").on(t.category, t.id),
    index("idx_event_log_type_id").on(t.eventType, t.id),
  ]
);

export const statusSnapshot = sqliteTable(
  "status_snapshot",
  {
    id: integer("id").primaryKey(), // always 1 for upsert
    status: text("status").notNull(), // e.g. active | connecting | disconnected
    provider: text("provider").notNull(),
    connectedSince: integer("connected_since"),
    pingMs: integer("ping_ms"),
    incomingCount: integer("incoming_count").notNull(),
    outgoingCount: integer("outgoing_count").notNull(),
    aiRequestCount: integer("ai_request_count").notNull(),
    errorCount: integer("error_count").notNull(),
    eventCount: integer("event_count").notNull(),
    queueState: text("queue_state").notNull(),
    memoryMb: integer("memory_mb").notNull(),
    updatedAt: integer("updated_at").notNull(),
  }
);

export const appMeta = sqliteTable(
  "app_meta",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
);

export const tuiRevisions = sqliteTable(
  "tui_revisions",
  {
    resource: text("resource").notNull(),
    scope: text("scope").notNull().default(""),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.resource, t.scope] })],
);

// Infer insert types directly from schema — no manual interfaces needed
export type NewMessage = typeof messages.$inferInsert;
export type NewLLMCall = typeof llmCalls.$inferInsert;
export type NewEvent = typeof eventLog.$inferInsert;
export type NewStatusSnapshot = typeof statusSnapshot.$inferInsert;
export type NewCommandExecution = typeof commandExecutions.$inferInsert;
