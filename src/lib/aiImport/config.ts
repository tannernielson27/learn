/**
 * AI import's own settings (#342, ADR 0008 "Model and money"). Read on the server only: nothing
 * here is `NEXT_PUBLIC_`, and `noClientAiImport.test.ts` keeps this folder out of every client
 * bundle. The model, its prices, the retries, usage and the environment switches every Claude
 * call shares are in `src/lib/ai/config.ts` (#621).
 */

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

/**
 * Per segment request, which may fill 16,000 tokens: about 80 s at the 200 tokens a second
 * #590's probe measured (8,000 in 38 s). The extract pass's answers are smaller and keep 90 s.
 */
export const SEGMENT_TIMEOUT_MS = 130_000;
/**
 * What one parse request may spend on Claude, its halves included (#590): the route's 300 s less
 * the time to load the file before and to settle and store after. Every call of the request is
 * cut to end by then, so the function is not killed with a reservation open.
 */
export const SEGMENT_BUDGET_MS = 270_000;
