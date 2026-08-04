export type Provider = "gemini" | "cerebras";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

const rawProvider = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();

export const ENV = {
  TG_API_ID: Number(required("TG_API_ID")),
  TG_API_HASH: required("TG_API_HASH"),
  TG_SESSION: process.env.TG_SESSION ?? "",

  GEMINI_API_KEY: required("GEMINI_API_KEY"),
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",

  CEREBRAS_API_KEY: required("CEREBRAS_API_KEY"),
  CEREBRAS_MODEL: process.env.CEREBRAS_MODEL?.trim() || "gpt-oss-120b",

  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT?.trim() || "",

  LLM_PROVIDER: rawProvider === "cerebras" ? "cerebras" : "gemini",
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
