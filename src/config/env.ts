export type Provider = "gemini" | "cerebras";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function apiKeys(listName: string, fallbackName: string): string[] {
  const value = process.env[listName] ?? process.env[fallbackName] ?? "";
  return [...new Set(value
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean))];
}

function nonNegativeInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: "${raw}" must be a non-negative integer`);
  }
  return value;
}

function optionalBotUsername(name: string): string {
  const raw = process.env[name]?.trim() ?? "";
  if (!raw) return "";
  const username = raw.replace(/^@/, "");
  if (!/^[A-Za-z][A-Za-z0-9_]{3,30}bot$/i.test(username)) {
    throw new Error(`Invalid ${name}: expected a Telegram bot username, for example reminder_bot`);
  }
  return `@${username}`;
}

const rawProvider = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();
if (rawProvider !== "gemini" && rawProvider !== "cerebras") {
  throw new Error(`Invalid LLM_PROVIDER: "${rawProvider}" must be gemini or cerebras`);
}
const provider: Provider = rawProvider;

const tgApiIdRaw = required("TG_API_ID");
const tgApiId = Number(tgApiIdRaw);
if (!Number.isInteger(tgApiId) || tgApiId <= 0) {
  throw new Error(`Invalid TG_API_ID: "${tgApiIdRaw}" must be a positive integer`);
}

const geminiApiKeys = apiKeys("GEMINI_API_KEYS", "GEMINI_API_KEY");
const cerebrasApiKeys = apiKeys("CEREBRAS_API_KEYS", "CEREBRAS_API_KEY");

if (provider === "gemini" && geminiApiKeys.length === 0) {
  throw new Error("Missing env var: GEMINI_API_KEY or GEMINI_API_KEYS is required when LLM_PROVIDER is set to gemini");
}
if (provider === "cerebras" && cerebrasApiKeys.length === 0) {
  throw new Error("Missing env var: CEREBRAS_API_KEY or CEREBRAS_API_KEYS is required when LLM_PROVIDER is set to cerebras");
}

export const ENV = {
  TG_API_ID: tgApiId,
  TG_API_HASH: required("TG_API_HASH"),
  TG_SESSION: process.env.TG_SESSION?.trim() ?? "",
  REMINDER_BOT_USERNAME: optionalBotUsername("REMINDER_BOT_USERNAME"),

  GEMINI_API_KEYS: geminiApiKeys,
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",

  CEREBRAS_API_KEYS: cerebrasApiKeys,
  CEREBRAS_MODEL: process.env.CEREBRAS_MODEL?.trim() || "gpt-oss-120b",

  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT?.trim() || "",
  MAX_LLM_PROMPT_GRAPHEMES: nonNegativeInteger("MAX_LLM_PROMPT_GRAPHEMES", 30_000),
  /** 0 keeps history forever; a positive value deletes older private logs. */
  DB_RETENTION_DAYS: nonNegativeInteger("DB_RETENTION_DAYS", 0),

  LLM_PROVIDER: provider,
} as const satisfies {
  TG_API_ID: number;
  TG_API_HASH: string;
  TG_SESSION: string;
  REMINDER_BOT_USERNAME: string;
  GEMINI_API_KEYS: string[];
  GEMINI_MODEL: string;
  CEREBRAS_API_KEYS: string[];
  CEREBRAS_MODEL: string;
  SYSTEM_PROMPT: string;
  MAX_LLM_PROMPT_GRAPHEMES: number;
  DB_RETENTION_DAYS: number;
  LLM_PROVIDER: Provider;
};

export function hasKeysFor(provider: Provider): boolean {
  return provider === "gemini" ? ENV.GEMINI_API_KEYS.length > 0 : ENV.CEREBRAS_API_KEYS.length > 0;
}
