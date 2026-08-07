import { describe, expect, test } from "bun:test";
import { parseReminderInput } from "./parse";

describe("parseReminderInput", () => {
  test("parses latin and russian duration units", () => {
    expect(parseReminderInput("20m Call mom")).toEqual({ delayMs: 1_200_000, reminderText: "Call mom" });
    expect(parseReminderInput("2ч  Проверить почту")).toEqual({ delayMs: 7_200_000, reminderText: "Проверить почту" });
  });

  test("rejects malformed and unsafe delays", () => {
    expect(parseReminderInput("tomorrow call mom")).toBeNull();
    expect(parseReminderInput("1s too soon")).toBeNull();
    expect(parseReminderInput("366d too far")).toBeNull();
  });
});
