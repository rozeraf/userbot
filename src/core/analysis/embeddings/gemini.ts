import { ENV } from "../../../config/env";
import { errorMessage } from "../../errors";
import { HttpError, withLlmRetries } from "../../llm/retry";

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
type EmbedResponse = { embedding?: { values?: number[] }; embeddings?: Array<{ values?: number[] }> };

function requestItem(text: string, taskType: TaskType) {
  return {
    model: `models/${ENV.GEMINI_EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: ENV.EMBEDDING_DIMENSIONS,
  };
}

export async function embedTexts(texts: readonly string[], taskType: TaskType): Promise<number[][]> {
  if (texts.length === 0) return [];
  const batch = texts.length > 1;
  const method = batch ? "batchEmbedContents" : "embedContent";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_EMBEDDING_MODEL}:${method}`;
  try {
    return await withLlmRetries("gemini-embeddings", ENV.GEMINI_API_KEYS, async (apiKey, signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(batch
          ? { requests: texts.map((text) => requestItem(text, taskType)) }
          : requestItem(texts[0]!, taskType)),
        signal,
      });
      if (!res.ok) throw new HttpError(res.status, `Gemini embeddings error ${res.status}: ${await res.text()}`);
      const data = await res.json() as EmbedResponse;
      const vectors = batch ? data.embeddings?.map((item) => item.values ?? []) : [data.embedding?.values ?? []];
      if (!vectors || vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
        throw new Error("Gemini embeddings returned an invalid vector count");
      }
      return vectors;
    }, { timeoutMs: 20_000 });
  } catch (err) {
    throw new Error(errorMessage(err), { cause: err });
  }
}

export async function embedQuery(text: string): Promise<number[]> {
  return (await embedTexts([text], "RETRIEVAL_QUERY"))[0]!;
}
