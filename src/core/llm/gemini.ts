import { ENV } from "../../config/env";
import { combineSystemPrompts, normalizeText } from "./prompt";
import { errorMessage } from "../errors";
import { HttpError, withLlmRetries } from "./retry";
import type { CompletionRequest, CompletionResult, ConversationItem } from "./types";

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        functionCall?: { name: string; args?: unknown };
      }[];
    };
  }[];
  usageMetadata?: unknown;
  modelVersion?: string;
  responseId?: string;
}

type GeminiContent = { role: "user" | "model"; parts: Array<Record<string, unknown>> };

export function serializeGeminiHistory(history: readonly ConversationItem[]): GeminiContent[] {
  return history.map((item): GeminiContent => {
    switch (item.type) {
      case "user": return { role: "user", parts: [{ text: item.text }] };
      case "assistant_text": return { role: "model", parts: [{ text: item.text }] };
      case "assistant_tool_calls": return {
        role: "model",
        parts: item.calls.map((call) => ({ functionCall: { name: call.name, args: call.arguments } })),
      };
      case "tool_result": return {
        role: "user",
        parts: [{ functionResponse: { name: item.name, response: { result: item.result } } }],
      };
    }
  });
}

function nowMs(): number {
  return Date.now();
}

export async function askGemini(prompt: string, systemPrompt?: string): Promise<string> {
  const result = await completeGemini({ history: [{ type: "user", text: prompt }], systemPrompt });
  if (result.kind !== "text") throw new Error("Gemini unexpectedly returned tool calls");
  return result.text;
}

export async function completeGemini(request: CompletionRequest): Promise<CompletionResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`;

  const t0 = nowMs();
  console.log("[gemini] request start");

  const body: Record<string, unknown> = {
    contents: serializeGeminiHistory(request.history),
  };

  const activeSystemPrompt = combineSystemPrompts(ENV.SYSTEM_PROMPT, request.systemPrompt);
  if (activeSystemPrompt) {
    body.systemInstruction = {
      parts: [{ text: activeSystemPrompt }],
    };
  }
  if (request.tools?.length) {
    body.tools = [{ functionDeclarations: request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })) }];
  }

  try {
    return await withLlmRetries("gemini", ENV.GEMINI_API_KEYS, async (apiKey, signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal,
      });

      console.log("[gemini] status:", res.status, "elapsedMs:", nowMs() - t0);

      if (!res.ok) {
        const errText = await res.text();
        console.error("[gemini] error body:", errText);
        throw new HttpError(res.status, `Gemini API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as GeminiResponse;
      console.log("[gemini] raw response keys:", Object.keys(data ?? {}));

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.flatMap((part, index) => part.functionCall ? [{
        callId: `gemini-${Date.now()}-${index}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args ?? {},
      }] : []);
      if (calls.length) return { kind: "tool_calls", calls };
      const text = parts.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini returned empty response");

      console.log("[gemini] response ok, totalMs:", nowMs() - t0);
      return { kind: "text", text: normalizeText(text) };
    }, { timeoutMs: request.timeoutMs });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini API request timed out (${Math.ceil((request.timeoutMs ?? 45_000) / 1000)}s)`);
    }
    throw new Error(errorMessage(err), { cause: err });
  }
}
