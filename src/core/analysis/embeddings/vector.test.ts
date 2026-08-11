import { describe, expect, test } from "bun:test";
import { bufferToVector, cosineSimilarity, normalizeVector, vectorToBuffer } from "./vector";

describe("embedding vectors", () => {
  test("round-trips normalized Float32 vectors", () => {
    const vector = normalizeVector([3, 4]);
    const decoded = bufferToVector(vectorToBuffer(vector));
    expect([...decoded]).toEqual([...vector]);
    expect(cosineSimilarity(vector, decoded)).toBeCloseTo(1, 6);
  });

  test("rejects zero vectors", () => {
    expect(() => normalizeVector([0, 0])).toThrow();
  });
});
