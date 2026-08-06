import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path from "path";
import fs from "fs";
import * as schema from "./schema";
import { getDbPath } from "./path";

const dbPath = getDbPath();
const migrationsFolder = path.join(import.meta.dirname, "migrations");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(dbPath);
// The database contains private message history. Keep the main file readable
// only by the current OS user (WAL side files follow the process umask).
try {
  fs.chmodSync(dbPath, 0o600);
} catch (err) {
  console.warn("[db] Could not restrict database file permissions:", err);
}
sqlite.run("PRAGMA journal_mode = WAL;");
// This bot stores private messages. Prefer durability over a tiny throughput gain:
// NORMAL may lose recent committed WAL transactions after a power failure.
sqlite.run("PRAGMA synchronous = FULL;");

export const db = drizzle(sqlite, { schema });

export function closeDb() {
  sqlite.close();
}

/** WAL and SHM are separate files and need the same privacy protection as the DB. */
export function secureDbFiles() {
  for (const suffix of ["-wal", "-shm"]) {
    try {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.chmodSync(`${dbPath}${suffix}`, 0o600);
    } catch (err) {
      console.warn(`[db] Could not restrict ${suffix} file permissions:`, err);
    }
  }
}

// Run migrations on startup (applies any pending .sql files from migrations/)
migrate(db, { migrationsFolder });

console.log("[db] SQLite initialized:", dbPath);
