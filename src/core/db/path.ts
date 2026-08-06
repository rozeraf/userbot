import path from "path";

const DEFAULT_DB_PATH = path.join(import.meta.dirname, "../../../userbot.db");

/** Database location shared by the bot writer and the read-only TUI. */
export function getDbPath(): string {
  return process.env.DB_PATH || DEFAULT_DB_PATH;
}
