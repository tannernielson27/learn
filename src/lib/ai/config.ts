/**
 * The settings every Claude call in LeaRN shares (#621, from AI import's #342; ADR 0008 "Model and
 * money", ADR 0018). Read on the server only: nothing here is `NEXT_PUBLIC_`, and
 * `noClientAi.test.ts` keeps this folder out of every client bundle.
 *
 * AI import's own settings (its passes' token limits and timeouts, its batch limits) stay in
 * `src/lib/aiImport/config.ts`.
 */

/** Claude Sonnet 5.5, the model #333 measured. It refuses a forced `tool_choice`, so calls use
 * structured outputs (`output_config.format`) instead of a tool. One model for every feature. */
export const CLAUDE_MODEL = "claude-sonnet-5-5";

/** USD per million tokens, Sonnet 5.5 list price (ADR 0008, 2026-10-01). */
export const PRICE_PER_MILLION = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } as const;

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
/** A try is not started with less than this left before its caller's deadline. */
export const MIN_ATTEMPT_MS = 15_000;

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

export interface AiEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly AI_IMPORT_ENABLED?: string;
  readonly AI_DRAFT_ENABLED?: string;
  readonly AI_IMPORT_FAKE?: string;
  readonly VERCEL_ENV?: string;
  readonly [name: string]: string | undefined;
}

const flag = (value: string | undefined) => value?.trim().toLowerCase();
const OFF = new Set(["false", "0", "off", "no"]);
const ON = new Set(["true", "1", "on", "yes"]);

/** A key to call Claude with, or the fake client outside production. */
const canCall = (env: AiEnv) => fakeClaudeWanted(env) || Boolean(env.ANTHROPIC_API_KEY?.trim());

/**
 * Whether AI import may call Claude at all. `AI_IMPORT_ENABLED=false` (or `0`, `off`, `no`) turns
 * it off everywhere; otherwise it needs a key, or the fake client outside production. A
 * workspace's own switch (`orgs.ai_import_enabled`) is checked by `reserve_ai_usage`.
 */
export function aiImportEnabled(env: AiEnv = process.env): boolean {
  if (OFF.has(flag(env.AI_IMPORT_ENABLED) ?? "")) return false;
  return canCall(env);
}

/**
 * Whether AI drafting may call Claude (ADR 0018 decision 3): off unless `AI_DRAFT_ENABLED` is
 * `true` (or `1`, `on`, `yes`), so drafting ships dark; then it needs a key, or the fake client
 * outside production, as import does. It does not follow `AI_IMPORT_ENABLED`: turning import off
 * never turns drafting on, and turning drafting on never needs import's flag. The workspace's
 * switch (`orgs.ai_import_enabled`) and the one monthly cap are still checked by
 * `reserve_ai_usage`.
 */
export function aiDraftEnabled(env: AiEnv = process.env): boolean {
  if (!ON.has(flag(env.AI_DRAFT_ENABLED) ?? "")) return false;
  return canCall(env);
}

/** `AI_IMPORT_FAKE=1` swaps in the fake client, for tests and e2e. Never in production. */
export function fakeClaudeWanted(env: AiEnv = process.env): boolean {
  return env.AI_IMPORT_FAKE === "1" && env.VERCEL_ENV !== "production";
}
