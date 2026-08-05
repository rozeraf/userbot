import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema:     "./src/core/db/schema.ts",
  out:        "./src/core/db/migrations",
  dialect:    "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH || "./userbot.db",
  },
});
