import { describe, expect, test } from "bun:test";
import { serializeCerebrasHistory } from "./cerebras";
import { parseGeminiToolCalls, serializeGeminiHistory } from "./gemini";
import type { ConversationItem } from "./types";

const history: ConversationItem[] = [
  { type: "user", text: "найди код" },
  { type: "assistant_tool_calls", calls: [{
    callId: "call-1",
    name: "search_messages",
    arguments: { query: "код" },
    providerMetadata: { thoughtSignature: "opaque-signature" },
  }] },
  { type: "tool_result", callId: "call-1", name: "search_messages", result: [{ text: "код 4821" }] },
];

describe("provider-neutral conversation serialization", () => {
  test("serializes Cerebras tool call IDs without leaking wire format into history", () => {
    expect(serializeCerebrasHistory(history)).toEqual([
      { role: "user", content: "найди код" },
      { role: "assistant", content: null, tool_calls: [{
        id: "call-1", type: "function", function: { name: "search_messages", arguments: '{"query":"код"}' },
      }] },
      { role: "tool", tool_call_id: "call-1", name: "search_messages", content: '[{"text":"код 4821"}]' },
    ]);
  });

  test("serializes the same history to Gemini contents", () => {
    expect(serializeGeminiHistory(history)).toEqual([
      { role: "user", parts: [{ text: "найди код" }] },
      { role: "model", parts: [{
        functionCall: { name: "search_messages", args: { query: "код" } },
        thoughtSignature: "opaque-signature",
      }] },
      { role: "user", parts: [{ functionResponse: { name: "search_messages", response: { result: [{ text: "код 4821" }] } } }] },
    ]);
  });

  test("preserves Gemini thought signatures as opaque provider metadata", () => {
    const calls = parseGeminiToolCalls([{
      functionCall: { name: "search_messages", args: { query: "код" } },
      thoughtSignature: "signature-from-model",
    }]);

    expect(calls[0]?.providerMetadata).toEqual({ thoughtSignature: "signature-from-model" });
  });
});
