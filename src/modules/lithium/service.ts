/**
 * Lithium service - manages the overall plugin lifecycle and application-wide state.
 *
 * Responsibilities:
 * 1. Load and sync state to appMeta using writeTransaction()
 * 2. Track outgoing messages in chat x and spend lithium
 * 3. Send system notifications via notify() when thresholds are crossed
 * 4. Periodically update user's bio in the target chat
 */

import type { TelegramClient } from "telegram";
import { Api } from "telegram";
import type { SystemEventSink } from "../core/db";
import {
  bioPattern,
  absorbed,
  renderBioSegment,
  scheduleBioUpdate,
  type LithiumConfig,
  type LithiumState,
  LITHIUM_REGENERATION_INTERVAL_MS,
} from "./model";
import { ENV } from "../config/env";

export interface LithiumService {
  start(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Called on every outgoing message in the target chat.
   * Handles cost calculation, state update, threshold checking, bio scheduling.
   */
  onOutgoing(chatId: string, messageId: number, text: string): void | Promise<void>;
}

/** Create and start the lithium service. */
export function createLithium(
  client: TelegramClient,
  notify: SystemEventSink,
  config?: Partial<LithiumConfig>
): LithiumService {
  const cfg: LithiumConfig = {
    enabled: ENV.LITHIUM_ENABLED,
    max: ENV.LITHIUM_MAX,
    baseCost: ENV.LITHIUM_BASE_COST,
    costPer100Chars: ENV.LITHIUM_COST_PER_100_CHARS,
    regenPerHour: ENV.LITHIUM_REGEN_PER_HOUR,
    bioLimit: ENV.LITHIUM_BIO_LIMIT,
    thresholds: ENV.LITHIUM_THRESHOLDS?.split(",").map(Number).filter(Boolean) ?? [],
    countCommands: ENV.LITHIUM_COUNT_COMMANDS ?? false,
    targetChatId: config?.targetChatId ?? null,
    ...config,
  };

  if (!cfg.enabled) {
    return createDisabledService(notify);
  }

  const state: LithiumState = loadStateFromAppMeta();
  const notificationQueue: SystemEventSink = notify;

  let bioUpdateInterval: NodeJS.Timeout | null = null;
  let isRunning = false;

  return {
    start: async () => {
      if (isRunning || !cfg.enabled) return;
      isRunning = true;

      // Initial bio sync - ensure we know the current shown step
      await syncBioAggressively();

      // Periodic tick for regeneration info and step changes
      const tickMs = Math.max(60_000, (LITHIUM_REGENERATION_INTERVAL_MS / cfg.regenPerHour) * 60); // min 1 minute

      bioUpdateInterval = setInterval(() => {
        try {
          runTick();
        } catch (err) {
          console.error("[lithium] tick error:", err);
        }
      }, tickMs);

      // Initial regenerate and bio
      runTick();

      console.log("[lithium] service started", {
        chatId: cfg.targetChatId,
        max: cfg.max,
        regenPerHour: cfg.regenPerHour,
      });
    },

    stop: async () => {
      if (!isRunning) return;
      isRunning = false;

      if (bioUpdateInterval) {
        clearInterval(bioUpdateInterval);
        bioUpdateInterval = null;
      }

      console.log("[lithium] service stopped");
    },

    onOutgoing: async (chatId, messageId, text) => {
      if (chatId !== cfg.targetChatId) return;

      const now = Date.now();
      const cost = calculateCost(text, cfg);
      const { before, after, state: newState } = spendState(state, now, cost);

      // Update state in memory
      Object.assign(state, newState);

      // Check threshold crossings
      const crossedThresholds = crossed(before, after, cfg.thresholds);
      const absorbedThresholds = absorbed(before, after, cfg.thresholds);

      for (const level of crossedThresholds) {
        await notificationQueue({
          level: "info" as const,
          category: "lithium",
          message: `🔋 Литий упал ${level}%`,
        });
      }

      for (const level of absorbedThresholds) {
        await notificationQueue({
          level: "info" as const,
          category: "lithium",
          message: `🔋 Литий восстановлен до ${level}%`,
        });
      }

      // Update stored state
      await saveStateToAppMeta(state);

      // Schedule bio update if step changed
      const active = newState.level > before ? 1 : -1;
      const newShownStep = Math.floor(newState.level / 5) * 5;
      const shouldUpdateBio = active !== 0 || newShownStep !== (state.shownStep ?? 0);

      if (shouldUpdateBio) {
        state.shownStep = newShownStep;
        scheduleBioUpdate(() => syncBio(state), 5_000);
        await saveStateToAppMeta(state);
      }

      return;
    },
  };

  function calculateCost(text: string, conf: LithiumConfig): number {
    return messageCost(text, conf);
  }

  function spendState(s: LithiumState, now: number, cost: number) {
    return spend(s, cfg, now, cost);
  }

  function crossed(before: number, after: number, thresholds: number[]) {
    return crossed(before, after, thresholds);
  }

  function crossed(before: number, after: number, thresholds: number[]): number[] {
    return crossed(before, after, thresholds);
  }
}

/** Sync bio immediately (used during start and single-actions). */
async function syncBioAggressively(): Promise<void> {
  try {
    // Read current bio
    const user = await client.getEntity(Api.InputUserSelf());
    const me = await client.getUsers([user])[0];
    const about = me.bio ?? "";

    // Extract old segment
    const match = about.match(bioPattern);
    const oldShownStep = match ? parseInt(match[0].match(/\d+/)?.[0] ?? "50") : 50;

    const segment = renderBioSegment(100, oldShownStep, 0);
    if (segment) {
      await updateBio(about, segment);
    }
  } catch (err) {
    console.error("[lithium] aggressive bio sync failed:", err);
  }
}

/** Periodic tick: regenerate lazily and check if step should change. */
function runTick(): void {
  const now = Date.now();
  const newLevel = regen(state, cfg, now);
  const changed = Math.abs(newLevel - state.level) >= 5;

  if (changed) {
    state.level = newLevel;
    scheduleBioUpdate(() => syncBioPartial(state));
  }
}

/** Run full bio sync (used on step change). */
async function syncBioPartial(s: LithiumState): Promise<void> {
  try {
    const about = await getAddress(true);
    const segment = (s.level === 100 && s.shownStep !== null && s.shownStep >= 95)
      ? "· ▰▰▰▰▰ 100%"
      : "· " + "▰".repeat(5) + "▱".repeat(0) + " " + s.level + "%";

    if (segment) {
      await updateBio(about, segment);
    }
  } catch (err) {
    console.error("[lithium] partial bio sync failed:", err);
  }
}

/** Sync bio fully (regen + step, at most once every 10 minutes). */
async function syncBio(s: LithiumState): Promise<void> {
  try {
    const about = await getAddress(true);
    const segment = renderBioSegment(s.level, s.shownStep ?? 50, s.level > (s.shownStep ?? 50) ? 1 : -1);
    if (segment) {
      await updateBio(about, segment);
    }
  } catch (err) {
    console.error("[lithium] full bio sync failed:", err);
  }
}

async function getAddress(allowUpdate = false): Promise<string> {
  const user = await client.getEntity(Api.InputUserSelf());
  // InputPeerUser not returned by getEntity, need getFullUser
  const fullUser = await client.getFullUser(user);
  return fullUser.users[0].bio ?? "";
}

async function updateBio(oldBio: string, newSegment: string): Promise<void> {
  try {
    const user = await client.getEntity(Api.InputUserSelf());

    // Extract base bio before the lithium segment
    const match = oldBio.match(new RegExp(bioPattern.source, "u"));
    const baseBio = match ? oldBio.replace(bioPattern.source, "· ").trim() : oldBio.trim();

    // Clear trailing spaces and ensure proper format
    const cleaned = baseBio.replace(/\s+/g, " ").trim() + " " + newSegment.trim();

    // Truncate to bio limit (accounting for mention: @username)
    const limit = ENV.TG_PREMIUM ? 140 : 70;
    const finalBio =
      cleaned.length <= limit
        ? cleaned
        : [...cleaned]
            .map((char, i, arr) => {
              if (i >= limit) return "";
              return char;
            })
            .join("");

    await client(
      new Api.users.EditProfile({
        id: user._ as unknown as Api.InputPeerSelf,
        about: finalBio,
      })
    );

    console.log("[lithium] bio updated:", {
      bio: finalBio,
      originalLength: cleaned.length,
      finalLength: finalBio.length,
    });
  } catch (err) {
    console.error("[lithium] updateBio error:", err);
    throw err;
  }
}

function loadStateFromAppMeta(): LithiumState {
  try {
    const trx = database.transaction();
    const meta = trx.sql<LithiumState>`SELECT data FROM app_meta WHERE key = 'lithium_state' FOR UPDATE`.get("lithium") as { string } | null;

    if (meta?.data) {
      return JSON.parse(meta.data);
    }

    // Default initial state
    return {
      level: 100,
      updatedAt: Date.now(),
      lastMessageId: -1,
      shownStep: 50,
    };
  } catch (err) {
    console.error("[lithium] failed to load state, using defaults:", err);
    return {
      level: 100,
      updatedAt: Date.now(),
      lastMessageId: -1,
      shownStep: 50,
    };
  }
}

async function saveStateToAppMeta(s: LithiumState): Promise<void> {
  try {
    const trx = database.transaction();
    trx
      .sql<never>`REPLACE INTO app_meta (key, data, created_at) VALUES ('lithium_state', ?, ${Date.now()})`
      .run(JSON.stringify(s));

    await trx.commit();
  } catch (err) {
    console.error("[lithium] failed to save state:", err);
    throw err;
  }
}

function createDisabledService(notify: SystemEventSink): LithiumService {
  return {
    start: async () => {
      console.log("[lithium] plugin disabled in configuration");
    },
    stop: async () => {
      console.log("[lithium] service stopped");
    },
    onOutgoing: () => {},
  };
}

// Import lazily to avoid cycle
import database from "../core/db";