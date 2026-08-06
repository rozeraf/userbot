/**
 * TUI read-only SQLite client.
 *
 * Differences from src/core/db/client.ts:
 * - Never runs migrations (TUI is a pure consumer)
 * - Handles missing DB file gracefully: dbReady=false instead of crash
 * - WAL reader mode — safe to open while the bot is writing
 * - Exports dbReady flag so panels can show a "waiting" state
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import path from "path";
import fs from "fs";
import * as schema from "../../src/core/db/schema";

export type { InferSelectModel } from "drizzle-orm";

const DB_PATH =
  process.env.DB_PATH ||
  path.join(import.meta.dirname, "../../userbot.db");

// ── Export schema tables for panel queries ─────────────────────────────────
export * from "../../src/core/db/schema";

// ── Try to open DB, gracefully degrade if not found yet ───────────────────

let _db: ReturnType<typeof drizzle> | null = null;
let _dbReady = false;
let _dbError: string | null = null;

function tryOpenDb() {
  if (!fs.existsSync(DB_PATH)) {
    _dbError = `DB not found: ${DB_PATH}\nStart the bot first (bun start), then reopen TUI.`;
    return;
  }

  try {
    const sqlite = new Database(DB_PATH, { readonly: true });
    sqlite.run("PRAGMA busy_timeout = 1000;"); // wait up to 1s on lock
    _db = drizzle(sqlite, { schema });
    _dbReady = true;
    console.error("[tui/db] Connected (read-only):", DB_PATH);
  } catch (err: any) {
    _dbError = `Failed to open DB: ${err?.message ?? String(err)}`;
  }
}

tryOpenDb();

/**
 * True once the SQLite file exists and opened successfully.
 * Panels should show a waiting screen when false.
 */
export function isDbReady(): boolean {
  // Re-try on each check so TUI auto-connects once the bot creates the file
  if (!_dbReady) tryOpenDb();
  return _dbReady;
}

/** Human-readable reason why DB is not ready (if isDbReady() === false) */
export function dbError(): string | null {
  return _dbError;
}

/**
 * Safe query wrapper: returns null on any SQLite error
 * (lock, missing table, schema mismatch) instead of throwing.
 */
export function safeQuery<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * The Drizzle db instance. Will be null if isDbReady() is false.
 * Always guard with isDbReady() before using.
 */
export function getDb() {
  return _db;
}

// Convenience re-export so existing panel imports still work
export const db = new Proxy({} as NonNullable<typeof _db>, {
  get(_target, prop) {
    if (!_db) throw new Error("DB not ready");
    return (_db as any)[prop];
  },
});
