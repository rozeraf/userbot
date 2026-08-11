import { describe, expect, test } from "bun:test";
import { toFtsQuery } from "./search";

describe("toFtsQuery", () => {
  test("builds a literal AND query", () => {
    expect(toFtsQuery("код комнаты 4821")).toBe('"код" AND "комнаты" AND "4821"');
  });

  test("removes FTS operators and punctuation", () => {
    expect(toFtsQuery('hello OR "world"*')).toBe('"hello" AND "OR" AND "world"');
  });
});
