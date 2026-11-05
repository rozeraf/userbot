/**
 * Core lithium model - pure business logic, no Telegram or data access dependencies.
 */

export type LithiumState = {
  level: number;           // Current amount 0-100 (percentage)
  updatedAt: number;       // Last time level was calculated (Unix ms)
  lastMessageId: number;   // Last outgoing message we've charged for
  shownStep: number | null;// Current 5% step displayed in bio (null = skip bio)
};

export type LithiumConfig = {
  enabled: boolean;
  max: number;
  baseCost: number;
  costPer100Chars: number;
  regenPerHour: number;
  bioLimit: number;
  thresholds: number[];
  countCommands: boolean;
  targetChatId: string | null;
};

export const LITHIUM_REGENERATION_INTERVAL_MS = 3_600_000; // 1 hour

export const regen = (s: LithiumState, c: LithiumConfig, now: number): number => {
  const elapsed = Math.max(0, now - s.updatedAt);
  const additional = (elapsed / LITHIUM_REGENERATION_INTERVAL_MS) * c.regenPerHour;
  return Math.min(c.max, s.level + additional);
};

export const messageCost = (text: string, c: LithiumConfig): number => {
  if (c.costPer100Chars === 0) return c.baseCost;
  const chars = [...text].length;
  const lengthCost = Math.floor(chars / 100) * c.costPer100Chars;
  return c.baseCost + lengthCost;
};

export const spend = (s: LithiumState, c: LithiumConfig, now: number, cost: number): {
  before: number;
  after: number;
  state: LithiumState;
} => {
  const before = regen(s, c, now);
  const after = Math.max(0, before - cost);
  const newState: LithiumState = {
    ...s,
    level: after,
    updatedAt: now,
    lastMessageId: s.lastMessageId,
  };
  return { before, after, state: newState };
};

export const crossed = (before: number, after: number, thresholds: number[]): number[] => {
  return thresholds.filter((t) => before > t && after <= t);
};

export const absorbed = (before: number, after: number, thresholds: number[]): number[] => {
  return thresholds.filter((t) => before <= t && after > t);
};

export const BIO_PATTERN = /\s*·\s*Li\s*▰▱{5}\s+\d{1,3}%\s*$/u;

export const renderBioSegment = (level: number, shown: number | null, max = 100, active: 0 | 1 | -1 = 0): string => {
  if (level === 0 && shown !== null && shown === 0) {
    return `· Li ▱▱▱▱▱ 20%`;
  }

  if (level === max && shown !== null && shown >= max - 5) {
    const fullBars = 5;
    const bar = '▰'.repeat(fullBars) + '▱'.repeat(0);
    return `· ${bar} ${Math.round(level)}%`;
  }

  const step = Math.floor(level / 5) * 5;
  if (step === shown && active === 0) {
    return '';
  }

  const inStep = level - step;
  const fullInStep = Math.max(0, Math.min(5, Math.round((inStep / 5) * 5)));
  const bar = '▰'.repeat(fullInStep) + '▱'.repeat(5 - fullInStep);
  return `· ${bar} ${Math.round(level)}%`;
};

export const initialState = (): LithiumState => ({
  level: 100,
  updatedAt: Date.now(),
  lastMessageId: -1,
  shownStep: 50,
});

let bioUpdateSchedule: NodeJS.Timeout | null = null;

export const scheduleBioUpdate = (fn: () => Promise<void>, delayMs = 10_000): void => {
  if (bioUpdateSchedule) return;

  bioUpdateSchedule = setTimeout(async () => {
    try {
      await fn();
    } finally {
      bioUpdateSchedule = null;
    }
  }, delayMs);
};
