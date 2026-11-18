/**
 * AI import's settings (#342, ADR 0008 "Model and money"). Read on the server only: nothing here
 * is `NEXT_PUBLIC_`, and `noClientAiImport.test.ts` keeps this folder out of every client bundle.
 */

/** Claude Sonnet 5.5, the model #333 measured. It refuses a forced `tool_choice`, so calls use
 * structured outputs (`output_config.format`) instead of a tool. */
export const AI_IMPORT_MODEL = "claude-sonnet-5-5";

/** USD per million tokens, Sonnet 5.5 list price (ADR 0008, 2026-10-01). */
export const PRICE_PER_MILLION = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } as const;

/**
 * The most a segment answer may run to. A chunk of about 8 pages can list 50 short questions or
 * more, each about 150 tokens: 8,000 was not enough for the import that stuck on 2026-10-22
 * (#590). A chunk whose answer still does not fit is read again in halves (`SEGMENT_SPLIT_DEPTH`).
 */
export const SEGMENT_MAX_TOKENS = 16_000;

/**
 * How many times a chunk may be halved when its segment answer runs out of room: once, so a chunk
 * is read as two halves at most. Each level is another round of calls inside the parse route's
 * 300 s, and a half that still overflows would have needed over 32,000 tokens whole, which is
 * more than the chunk itself holds.
 */
export const SEGMENT_SPLIT_DEPTH = 1;

/**
 * The most an extract answer may run to (#343): two questions' drafts, or one chart-heavy one,
 * with their "possible source error" notes.
 */
export const EXTRACT_MAX_TOKENS = 8_000;

/** Questions per extract call. #333: four chart-heavy ones took 30-45 s; two stay near 20 s. */
export const EXTRACT_PER_CALL = 2;

/** Staged entries per batch (ADR 0008); `ai_import_entries` refuses the 151st. */
export const MAX_ENTRIES_PER_BATCH = 150;

/** Below this the reviewer is told the type is a guess (#333). */
export const LOW_CONFIDENCE = 0.7;

/** Tries per call: the first, then two more after a 429, 529 or 5xx. */
export const MAX_ATTEMPTS = 3;
/** The wait before the second try; it doubles for the third. A `retry-after` is used up to the cap. */
export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 10_000;
/**
 * A failed try is tried again only while the call is this young: a 429 or a 529 comes back in a
 * second or two, and a failure that took longer leaves no room for another try in a function's
 * 300 s.
 */
export const RETRY_WINDOW_MS = 45_000;
/** Per request. A chunk's call took 30-45 s in #333; a request past this is given up. */
export const REQUEST_TIMEOUT_MS = 90_000;
/**
 * Per segment request, which may fill 16,000 tokens: about 80 s at the 200 tokens a second
 * #590's probe measured (8,000 in 38 s). The extract pass's answers are smaller and keep 90 s.
 */
export const SEGMENT_TIMEOUT_MS = 130_000;
/** A try is not started with less than this left before its caller's deadline. */
export const MIN_ATTEMPT_MS = 15_000;
/**
 * What one parse request may spend on Claude, its halves included (#590): the route's 300 s less
 * the time to load the file before and to settle and store after. Every call of the request is
 * cut to end by then, so the function is not killed with a reservation open.
 */
export const SEGMENT_BUDGET_MS = 270_000;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export const NO_USAGE: Usage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
});

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
});

/** Estimated cost in USD, rounded up to the ledger's six places. */
export function costOf(usage: Usage): number {
  const micro =
    usage.inputTokens * PRICE_PER_MILLION.input +
    usage.outputTokens * PRICE_PER_MILLION.output +
    usage.cacheWriteTokens * PRICE_PER_MILLION.cacheWrite +
    usage.cacheReadTokens * PRICE_PER_MILLION.cacheRead;
  return Math.ceil(micro) / 1e6;
}

/** All input tokens, whether read from the cache, written to it or neither. */
export const totalInputTokens = (usage: Usage): number =>
  usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens;

export interface AiImportEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly AI_IMPORT_ENABLED?: string;
  readonly AI_IMPORT_FAKE?: string;
  readonly VERCEL_ENV?: string;
  readonly [name: string]: string | undefined;
}

/**
 * Whether AI import may call Claude at all. `AI_IMPORT_ENABLED=false` (or `0`, `off`, `no`) turns
 * it off everywhere; otherwise it needs a key, or the fake client outside production. A
 * workspace's own switch (`orgs.ai_import_enabled`) is checked by `reserve_ai_usage`.
 */
export function aiImportEnabled(env: AiImportEnv = process.env): boolean {
  const flag = env.AI_IMPORT_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off" || flag === "no") return false;
  if (fakeClaudeWanted(env)) return true;
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

/** `AI_IMPORT_FAKE=1` swaps in the fake client, for tests and e2e. Never in production. */
export function fakeClaudeWanted(env: AiImportEnv = process.env): boolean {
  return env.AI_IMPORT_FAKE === "1" && env.VERCEL_ENV !== "production";
}
