const MAX_QUERY_TERMS = 12;

/** Convert user text to a literal, injection-safe FTS5 AND query. */
export function toFtsQuery(input: string): string {
  return (input.normalize("NFKC").match(/[\p{L}\p{N}_-]+/gu) ?? [])
    .slice(0, MAX_QUERY_TERMS)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" AND ");
}
