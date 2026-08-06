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

export function preview(text: string, len = 120): string {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  return graphemes.length > len
    ? `${graphemes.slice(0, len).map(({ segment }) => segment).join("")}...`
    : text;
}
