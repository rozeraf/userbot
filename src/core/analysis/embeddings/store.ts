import { createHash } from "crypto";
import { sqlite } from "../../db/client";
import { ENV } from "../../../config/env";
import { embedTexts } from "./gemini";
import { normalizeVector, vectorToBuffer } from "./vector";
import { database } from "../../db";

type Candidate = { id: number; text: string; content_hash: string | null; model: string | null };

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function indexNextEmbeddingBatch(limit = 20): Promise<number> {
  if (!ENV.SEMANTIC_SEARCH_ENABLED) return 0;
  const rows = sqlite.query<Candidate, [string, number]>(`
    SELECT m.id, m.text, e.content_hash, e.model
    FROM messages AS m
    LEFT JOIN message_embeddings AS e ON e.message_db_id = m.id
    WHERE m.text IS NOT NULL AND m.text <> '' AND m.text NOT LIKE '.%'
      AND (e.message_db_id IS NULL OR e.model <> ?)
    ORDER BY m.id
    LIMIT ?
  `).all(ENV.GEMINI_EMBEDDING_MODEL, Math.max(1, Math.min(100, limit)));
  if (rows.length === 0) return 0;
  const vectors = await embedTexts(rows.map((row) => `Document: ${row.text}`), "RETRIEVAL_DOCUMENT");
  const statement = sqlite.prepare(`
    INSERT INTO message_embeddings (message_db_id, model, dimensions, content_hash, vector, embedded_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_db_id) DO UPDATE SET model=excluded.model, dimensions=excluded.dimensions,
      content_hash=excluded.content_hash, vector=excluded.vector, embedded_at=excluded.embedded_at
  `);
  sqlite.transaction(() => {
    rows.forEach((row, index) => {
      const vector = normalizeVector(vectors[index]!);
      statement.run(row.id, ENV.GEMINI_EMBEDDING_MODEL, vector.length, hash(row.text), vectorToBuffer(vector), Date.now());
    });
  })();
  database.logEvent({
    eventType: "embedding_batch_indexed", level: "info", category: "llm",
    message: `Indexed ${rows.length} message embedding(s)`,
    metadata: { model: ENV.GEMINI_EMBEDDING_MODEL, dimensions: ENV.EMBEDDING_DIMENSIONS },
  });
  return rows.length;
}

export function startSemanticIndexer(): () => void {
  if (!ENV.SEMANTIC_SEARCH_ENABLED) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await indexNextEmbeddingBatch(); }
    catch (err) {
      console.error("[embeddings] indexing failed:", err);
      database.logEvent({ eventType: "embedding_index_error", level: "warn", category: "llm", message: String(err) });
    } finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 15_000);
  return () => clearInterval(timer);
}
