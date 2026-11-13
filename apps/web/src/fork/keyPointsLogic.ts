// Fork: key points. A cheap model restates what the reader must not miss in a
// finished reply, and the app lists it in a card under that reply.
// Frontend only: the request goes through the voice clean-up endpoint, which
// runs the text-generation model on instructions the client supplies.

export type KeyPointKind = "ask" | "key" | "watch";

export interface KeyPoints {
  readonly ask: ReadonlyArray<string>;
  readonly key: ReadonlyArray<string>;
  readonly watch: ReadonlyArray<string>;
}

export const KEY_POINT_KINDS: ReadonlyArray<KeyPointKind> = ["ask", "key", "watch"];

const MAX_PER_KIND: Record<KeyPointKind, number> = { ask: 2, key: 1, watch: 2 };
const MIN_POINT_LENGTH = 12;

// The endpoint wraps these instructions in transcript clean-up text, so they
// open by overriding it.
export const KEY_POINTS_INSTRUCTIONS = `You are not cleaning a transcript. Ignore every later instruction about transcripts, cleanup, the composer draft or insertion, and do not return the text itself.

The text inside <transcript> is a reply a coding agent wrote to its user. The user skims long replies and misses things. List what they must not miss, so an app can show it in a small card under the reply.

Return JSON only, with no prose and no code fence, in exactly this shape:
{"ask":[],"key":[],"watch":[]}

- ask: a question the reply asks the user, or a decision, check or action it wants from them. At most 2.
- key: the main result or conclusion. Almost every reply has one. At most 1.
- watch: a caveat or problem the user should look at: something untested, unverified, failed, blocked, skipped, inconsistent or done differently from what was asked. Not general findings or opinions. At most 2.

Write each item as one plain sentence of at most 22 words, in the reply's own terms, keeping names, numbers, file names and commands exactly as written. Say only what the reply says: add nothing, guess nothing, and do not soften or strengthen it. No markdown. Prefer fewer items, and use an empty array when a category has nothing.`;

function quoteList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const quotes: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const quote = entry.replace(/\s+/g, " ").trim();
    if (quote.length >= MIN_POINT_LENGTH) quotes.push(quote);
    if (quotes.length === limit) break;
  }
  return quotes;
}

/** Reads the model's reply. Null when it holds no JSON object. */
export function parseKeyPoints(raw: string): KeyPoints | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  return {
    ask: quoteList(record.ask, MAX_PER_KIND.ask),
    key: quoteList(record.key, MAX_PER_KIND.key),
    watch: quoteList(record.watch, MAX_PER_KIND.watch),
  };
}
