export const DEFAULT_LLM_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  if (error instanceof Error && error.name === "AbortError") return true;
  // fetch rejects with TypeError for transport failures.
  return error instanceof TypeError;
}

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export async function withLlmRetries<T>(
  provider: string,
  keys: readonly string[],
  request: (apiKey: string, signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  if (keys.length === 0) throw new Error(`No ${provider} API keys configured`);
  const keyOrder = shuffled(keys);
  const attempts = MAX_ATTEMPTS;
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remaining);
    try {
      return await request(keyOrder[attempt % keyOrder.length]!, controller.signal);
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt + 1 >= attempts) throw error;
      const delay = Math.min(1_000 * 2 ** attempt, Math.max(0, deadline - Date.now() - 1));
      console.warn(`[${provider}] transient failure; retrying request`, { attempt: attempt + 1, delay });
      if (delay > 0) await Bun.sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new Error(`${provider} API request timed out (${timeoutMs / 1000}s total)`);
  }
  throw lastError ?? new Error(`${provider} API request deadline exceeded`);
}
