/**
 * TUI read-only SQLite client.
 *
 * Opens the bot database read-only. Query code lives in tui/data/.
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import fs from "fs";
import * as schema from "../../src/core/db/schema";
import { getDbPath } from "../../src/core/db/path";

const dbPath = getDbPath();

// ── Try to open DB, gracefully degrade if not found yet ───────────────────

let _db: ReturnType<typeof drizzle> | null = null;
let _dbReady = false;
let _dbError: string | null = null;

function tryOpenDb() {
  if (!fs.existsSync(dbPath)) {
    _dbError = `DB not found: ${dbPath}\nStart the bot first (bun start), then reopen TUI.`;
    return;
  }

  try {
    const sqlite = new Database(dbPath, { readonly: true });
    sqlite.run("PRAGMA busy_timeout = 1000;"); // wait up to 1s on lock
    _db = drizzle(sqlite, { schema });
    _dbReady = true;
    console.error("[tui/db] Connected (read-only):", dbPath);
  } catch (err: unknown) {
    _dbError = `Failed to open DB: ${err instanceof Error ? err.message : String(err)}`;
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
export function getDb() {
  return _db;
}
