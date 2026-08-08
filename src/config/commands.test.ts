import { describe, expect, test } from "bun:test";
import { COMMAND_PREFIX, commandArgs, commandText, matchesCommand } from "./commands";

describe("command syntax", () => {
  test("builds commands from the centralized prefix", () => {
    expect(commandText("help")).toBe(`${COMMAND_PREFIX}help`);
  });

  test("matches only a complete command token", () => {
    expect(matchesCommand(`${COMMAND_PREFIX}answer`, "answer")).toBeTrue();
    expect(matchesCommand(`${COMMAND_PREFIX}answer prompt`, "answer")).toBeTrue();
    expect(matchesCommand(`${COMMAND_PREFIX}answering`, "answer")).toBeFalse();
  });

  test("extracts trimmed arguments", () => {
    expect(commandArgs(`${COMMAND_PREFIX}answer   hello`, "answer")).toBe("hello");
  });
});
