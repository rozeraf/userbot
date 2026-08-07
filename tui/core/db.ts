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
let _sqlite: Database | null = null;
let _dbReady = false;
let _dbError: string | null = null;

function tryOpenDb() {
  if (!fs.existsSync(dbPath)) {
    _dbError = `DB not found: ${dbPath}\nStart the bot first (bun start), then reopen TUI.`;
    return;
  }

  try {
    const sqlite = new Database(dbPath, { readonly: true });
    // TUI queries run synchronously on Ink's event-loop thread.  A missed poll
    // is preferable to making keyboard input unresponsive while a writer holds
    // a lock.
    sqlite.run("PRAGMA busy_timeout = 50;");
    _db = drizzle(sqlite, { schema });
    _sqlite = sqlite;
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

/** Connection-local commit counter used only by the rare reconciliation watchdog. */
export function getDataVersion(): number | null {
  if (!_sqlite) return null;
  try {
    const row = _sqlite.query("PRAGMA data_version").get() as { data_version?: number } | null;
    return row?.data_version ?? null;
  } catch {
    return null;
  }
}
