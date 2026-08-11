import { describe, expect, test } from "bun:test";
import { claimSearchQuery } from "./query";

describe("claimSearchQuery", () => {
  test("removes resolved subject, chat and command boilerplate", () => {
    expect(claimSearchQuery(
      "правда ли то что @hdjsjsvj с чата Solnyshki боится собак",
      "@hdjsjsvj",
      "𝑠𝑜𝑙𝑛𝑦𝑠ℎ𝑘𝑖",
    )).toBe("боится собак");
  });
});
