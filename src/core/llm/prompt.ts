export function buildPrompt(userPrompt: string, originalText: string): string {
  if (userPrompt && originalText) {
    return `Инструкция: ${userPrompt}\n\nСообщение, на которое нужно ответить:\n${originalText}`;
  }

  if (originalText) return originalText;
  return userPrompt;
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function limitGraphemes(text: string, limit: number): string {
  if (limit === 0) return text;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  if (segments.length <= limit) return text;
  return `${segments.slice(0, limit).map(({ segment }) => segment).join("")}\n\n[truncated]`;
}

/** Command-specific rules supplement, rather than silently replace, the user configuration. */
export function combineSystemPrompts(base: string, commandRules?: string): string | undefined {
  return [base.trim(), commandRules?.trim()]
    .filter((prompt): prompt is string => Boolean(prompt))
    .join("\n\n") || undefined;
}

export function preview(text: string, len = 120): string {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  return graphemes.length > len
    ? `${graphemes.slice(0, len).map(({ segment }) => segment).join("")}...`
    : text;
}
