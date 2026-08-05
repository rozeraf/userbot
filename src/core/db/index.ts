import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

// Initialize SQLite database
const dbPath = process.env.DB_PATH || path.join(import.meta.dirname, "../../../userbot.db");

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable WAL (Write-Ahead Logging) and set synchronous to NORMAL for optimal write speed & durability
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");

// Initialize tables
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL,
    sender_id TEXT,
    text TEXT,
    timestamp INTEGER NOT NULL,
    is_outgoing INTEGER NOT NULL CHECK (is_outgoing IN (0, 1))
  );
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages (chat_id, timestamp);
`);

db.run(`
  CREATE TABLE IF NOT EXISTS llm_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT,
    latency_ms INTEGER NOT NULL,
    error TEXT,
    timestamp INTEGER NOT NULL
  );
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_llm_calls_timestamp ON llm_calls (timestamp);
`);

db.run(`
  CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata TEXT, -- JSON string
    timestamp INTEGER NOT NULL
  );
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON event_log (timestamp);
`);

// Prepared statements for batch inserts
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (message_id, chat_id, sender_id, text, timestamp, is_outgoing)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertLLMCallStmt = db.prepare(`
  INSERT INTO llm_calls (provider, prompt, response, latency_ms, error, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertEventLogStmt = db.prepare(`
  INSERT INTO event_log (event_type, level, message, metadata, timestamp)
  VALUES (?, ?, ?, ?, ?)
`);

// Buffers for batch transactions
export interface PendingMessage {
  messageId: number;
  chatId: string;
  senderId?: string;
  text?: string;
  timestamp: number;
  isOutgoing: boolean;
}

export interface PendingLLMCall {
  provider: string;
  prompt: string;
  response?: string | null;
  latencyMs: number;
  error?: string | null;
  timestamp: number;
}

export interface PendingEvent {
  eventType: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, any> | null;
  timestamp: number;
}

let messageBuffer: PendingMessage[] = [];
let llmCallBuffer: PendingLLMCall[] = [];
let eventLogBuffer: PendingEvent[] = [];

let flushTimeout: Timer | null = null;
const MAX_BUFFER_SIZE = 50; // trigger flush when total buffered items reach this
const FLUSH_INTERVAL_MS = 1000; // flush every 1s if there is pending data

export const database = {
  logMessage(msg: Omit<PendingMessage, "timestamp">) {
    messageBuffer.push({ ...msg, timestamp: Date.now() });
    checkFlush();
  },

  logLLMCall(call: Omit<PendingLLMCall, "timestamp">) {
    llmCallBuffer.push({ ...call, timestamp: Date.now() });
    checkFlush();
  },

  logEvent(event: Omit<PendingEvent, "timestamp">) {
    eventLogBuffer.push({ ...event, timestamp: Date.now() });
    checkFlush();
  },

  flush() {
    if (messageBuffer.length === 0 && llmCallBuffer.length === 0 && eventLogBuffer.length === 0) {
      return;
    }

    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    const messagesToInsert = [...messageBuffer];
    const llmCallsToInsert = [...llmCallBuffer];
    const eventLogsToInsert = [...eventLogBuffer];

    // Reset buffers immediately
    messageBuffer = [];
    llmCallBuffer = [];
    eventLogBuffer = [];

    try {
      db.transaction(() => {
        for (const msg of messagesToInsert) {
          insertMessageStmt.run(
            msg.messageId,
            msg.chatId,
            msg.senderId ?? null,
            msg.text ?? null,
            msg.timestamp,
            msg.isOutgoing ? 1 : 0
          );
        }

        for (const call of llmCallsToInsert) {
          insertLLMCallStmt.run(
            call.provider,
            call.prompt,
            call.response ?? null,
            call.latencyMs,
            call.error ?? null,
            call.timestamp
          );
        }

        for (const log of eventLogsToInsert) {
          insertEventLogStmt.run(
            log.eventType,
            log.level,
            log.message,
            log.metadata ? JSON.stringify(log.metadata) : null,
            log.timestamp
          );
        }
      })();
      // console.log(`[db] Batch write executed successfully (${messagesToInsert.length} messages, ${llmCallsToInsert.length} LLM calls, ${eventLogsToInsert.length} logs)`);
    } catch (err) {
      console.error("[db] Error executing batch transaction:", err);
      // Restore buffers
      messageBuffer.unshift(...messagesToInsert);
      llmCallBuffer.unshift(...llmCallsToInsert);
      eventLogBuffer.unshift(...eventLogsToInsert);
    }
  },

  close() {
    this.flush();
    db.close();
  }
};

function checkFlush() {
  const totalItems = messageBuffer.length + llmCallBuffer.length + eventLogBuffer.length;
  if (totalItems >= MAX_BUFFER_SIZE) {
    database.flush();
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(() => database.flush(), FLUSH_INTERVAL_MS);
  }
}

// Ensure graceful shutdown flushes the queues
process.on("beforeExit", () => database.flush());
process.on("exit", () => database.flush());

const handleExitSignals = () => {
  database.flush();
  process.exit(0);
};

process.on("SIGINT", handleExitSignals);
process.on("SIGTERM", handleExitSignals);
