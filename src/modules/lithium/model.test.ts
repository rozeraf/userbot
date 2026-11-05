import { describe, expect, test } from "bun:test";
import { regen, messageCost, spend, crossed, absorbed, renderBioSegment, initialState, type LithiumConfig } from "./model";

const defaultConfig: LithiumConfig = {
  enabled: true,
  max: 100,
  baseCost: 5,
  costPer100Chars: 2,
  regenPerHour: 10,
  bioLimit: 70,
  thresholds: [50, 20, 0],
  countCommands: false,
  targetChatId: "123",
};

describe("Lithium Model", () => {
  test("regen calculates correct lithium over time", () => {
    const state = initialState();
    state.level = 50;
    state.updatedAt = Date.now() - 3_600_000; // 1 hour ago
    const newLevel = regen(state, defaultConfig, Date.now());
    expect(newLevel).toBe(60);
  });

  test("regen clamps to max", () => {
    const state = initialState();
    state.level = 95;
    state.updatedAt = Date.now() - 3_600_000 * 5; // 5 hours ago
    const newLevel = regen(state, defaultConfig, Date.now());
    expect(newLevel).toBe(100);
  });

  test("messageCost computes base cost and length cost", () => {
    expect(messageCost("short", defaultConfig)).toBe(5);
    const longText = "a".repeat(250); // 2.5 chunks of 100 chars -> floor(2.5)*2 = 4 -> base 5 + 4 = 9
    expect(messageCost(longText, defaultConfig)).toBe(9);
  });

  test("spend deducts cost and returns state", () => {
    const state = initialState();
    state.level = 80;
    state.updatedAt = Date.now();
    const { before, after, state: newState } = spend(state, defaultConfig, Date.now(), 15);
    expect(before).toBe(80);
    expect(after).toBe(65);
    expect(newState.level).toBe(65);
  });

  test("crossed detects threshold crossing downward", () => {
    expect(crossed(55, 45, [50, 20, 0])).toEqual([50]);
    expect(crossed(50, 50, [50, 20, 0])).toEqual([]);
    expect(crossed(22, 18, [50, 20, 0])).toEqual([20]);
  });

  test("absorbed detects threshold crossing upward", () => {
    expect(absorbed(45, 55, [50, 20, 0])).toEqual([50]);
    expect(absorbed(18, 22, [50, 20, 0])).toEqual([20]);
  });

  test("renderBioSegment renders valid progress bars", () => {
    expect(renderBioSegment(100, 50)).toBe("· ▰▰▰▰▰ 100%");
    expect(renderBioSegment(52, 50)).toBe("· ▰▰▱▱▱ 52%");
  });
});
