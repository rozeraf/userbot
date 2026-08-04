export type Provider = "gemini" | "cerebras";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

const rawProvider = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();
const provider: Provider = rawProvider === "cerebras" ? "cerebras" : "gemini";

const tgApiIdRaw = required("TG_API_ID");
const tgApiId = Number(tgApiIdRaw);
if (isNaN(tgApiId) || !Number.isFinite(tgApiId)) {
  throw new Error(`Invalid TG_API_ID: "${tgApiIdRaw}" must be a valid number`);
}

const geminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
const cerebrasApiKey = process.env.CEREBRAS_API_KEY?.trim() ?? "";

if (provider === "gemini" && !geminiApiKey) {
  throw new Error("Missing env var: GEMINI_API_KEY is required when LLM_PROVIDER is set to gemini");
}
if (provider === "cerebras" && !cerebrasApiKey) {
  throw new Error("Missing env var: CEREBRAS_API_KEY is required when LLM_PROVIDER is set to cerebras");
}

export const ENV = {
  TG_API_ID: tgApiId,
  TG_API_HASH: required("TG_API_HASH"),
  TG_SESSION: process.env.TG_SESSION ?? "",

  GEMINI_API_KEY: geminiApiKey,
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",

  CEREBRAS_API_KEY: cerebrasApiKey,
  CEREBRAS_MODEL: process.env.CEREBRAS_MODEL?.trim() || "gpt-oss-120b",

  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT?.trim() || "",

  LLM_PROVIDER: provider,
} as const satisfies {
  TG_API_ID: number;
  TG_API_HASH: string;
  TG_SESSION: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  CEREBRAS_API_KEY: string;
  CEREBRAS_MODEL: string;
  SYSTEM_PROMPT: string;
  LLM_PROVIDER: Provider;
};
