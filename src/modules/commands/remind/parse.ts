const UNIT_MS: Record<string, number> = {
  s: 1_000, "с": 1_000,
  m: 60_000, "м": 60_000,
  h: 60 * 60_000, "ч": 60 * 60_000,
  d: 24 * 60 * 60_000, "д": 24 * 60 * 60_000,
};

const MIN_DELAY_MS = 10_000;
const MAX_DELAY_MS = 365 * 24 * 60 * 60_000;

export type ReminderInput = { delayMs: number; reminderText: string };

/** Parse `<amount><unit> <text>`, for example `20m call mom`. */
export function parseReminderInput(input: string): ReminderInput | null {
  const match = input.trim().match(/^(\d+)\s*([smhdсмчд])\s+(.+)$/iu);
  if (!match) return null;
  const amount = Number(match[1]);
  const reminderText = match[3]!.trim();
  const delayMs = amount * (UNIT_MS[match[2]!.toLowerCase()] ?? 0);
  if (!Number.isSafeInteger(delayMs) || delayMs < MIN_DELAY_MS || delayMs > MAX_DELAY_MS || !reminderText) return null;
  return { delayMs, reminderText };
}
