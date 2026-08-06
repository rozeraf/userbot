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
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA synchronous = NORMAL;");

export const db = drizzle(sqlite, { schema });

export function closeDb() {
  sqlite.close();
}

// Run migrations on startup (applies any pending .sql files from migrations/)
migrate(db, { migrationsFolder });

console.log("[db] SQLite initialized:", dbPath);
