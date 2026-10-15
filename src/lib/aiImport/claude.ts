import Anthropic from "@anthropic-ai/sdk";
import {
  AI_IMPORT_MODEL,
  MAX_ATTEMPTS,
  NO_USAGE,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  addUsage,
  fakeClaudeWanted,
  type AiImportEnv,
  type Usage,
} from "./config";
import { fakeClaudeClient } from "./fakeClaude";

/**
 * The one way AI import talks to Claude (#342). Server only: the key is read here and handed to
 * the SDK, never logged, never put in an error, and this folder never reaches a client bundle
 * (`noClientAiImport.test.ts`).
 *
 * Every call is a structured-output call (`output_config.format`, a JSON schema): Sonnet 5.5
 * refuses a forced `tool_choice` (#333), and the model has no tools that act on anything. The
 * system prompt is cached, so the chunks of one batch pay for it once.
 *
 * The SDK's own retries are off (`maxRetries: 0`) so the retries here are the only ones, and the
 * caller sees how many tries a call took. A 429, 529, other 5xx or a dropped connection is tried
 * again after a backoff; anything else fails at once.
 */

/** The one SDK method AI import uses, so tests and the fake client can stand in for the API. */
export interface MessagesClient {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export type ClaudeFailureCode =
  | "not_configured"
  | "rate_limited"
  | "overloaded"
  | "server"
  | "connection"
  | "timeout"
  | "rejected"
  | "max_tokens"
  | "refusal"
  | "no_answer"
  | "invalid_json";

/**
 * A call that did not give an answer. The message names the code and the HTTP status only, never
 * the request, the document or what the model wrote, so it is safe to log and to report.
 * `usage` is what Claude billed before it failed (a response that was cut off or not JSON).
 */
export class ClaudeCallError extends Error {
  constructor(
    readonly code: ClaudeFailureCode,
    readonly usage: Usage = NO_USAGE,
    readonly attempts = 1,
    readonly status: number | null = null,
  ) {
    super(`the Claude call failed (${code}${status === null ? "" : `, HTTP ${status}`})`);
    this.name = "ClaudeCallError";
  }
}

export type JsonSchema = Record<string, unknown>;

export interface StructuredRequest {
  /** The rules. Cached: keep it the same for every call of a pass. */
  system: string;
  schema: JsonSchema;
  content: Anthropic.ContentBlockParam[];
  maxTokens: number;
}

export interface CallOptions {
  model?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface StructuredAnswer {
  value: unknown;
  usage: Usage;
  attempts: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function usageOf(response: Anthropic.Message): Usage {
  const usage = response.usage;
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
  };
}

interface Classified {
  code: ClaudeFailureCode;
  retryable: boolean;
  status: number | null;
  retryAfterMs: number | null;
}

function retryAfter(error: { headers?: unknown }): number | null {
  const headers = error.headers as { get?: (name: string) => string | null } | undefined;
  const value = typeof headers?.get === "function" ? headers.get("retry-after") : null;
  const seconds = value === null ? NaN : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/** By shape, not class, so a test's `{ status: 529 }` is read as the SDK's error would be. */
export function classifyError(error: unknown): Classified {
  const shaped = (typeof error === "object" && error !== null ? error : {}) as {
    status?: unknown;
    name?: unknown;
    headers?: unknown;
  };
  const status = typeof shaped.status === "number" ? shaped.status : null;
  const after = retryAfter(shaped);
  if (status === 429) return { code: "rate_limited", retryable: true, status, retryAfterMs: after };
  if (status === 529) return { code: "overloaded", retryable: true, status, retryAfterMs: after };
  if (status !== null && status >= 500) {
    return { code: "server", retryable: true, status, retryAfterMs: after };
  }
  if (status !== null) return { code: "rejected", retryable: false, status, retryAfterMs: null };
  if (shaped.name === "APIConnectionTimeoutError") {
    // A request that ran out its 90 s once will not fit another try in the function's time.
    return { code: "timeout", retryable: false, status: null, retryAfterMs: null };
  }
  if (shaped.name === "APIConnectionError") {
    return { code: "connection", retryable: true, status: null, retryAfterMs: null };
  }
  return { code: "connection", retryable: false, status: null, retryAfterMs: null };
}

/** 2 s, then 4 s, or the server's `retry-after` when longer; never above 10 s; plus a jitter. */
export function backoffMs(attempt: number, retryAfterMs: number | null, random: () => number) {
  const exponential = RETRY_BASE_MS * 2 ** (attempt - 1);
  const wait = Math.min(Math.max(exponential, retryAfterMs ?? 0), RETRY_MAX_MS);
  return wait + Math.floor(random() * 250);
}

function answerOf(response: Anthropic.Message, usage: Usage, attempts: number): unknown {
  if (response.stop_reason === "max_tokens") {
    throw new ClaudeCallError("max_tokens", usage, attempts);
  }
  if (response.stop_reason === "refusal") throw new ClaudeCallError("refusal", usage, attempts);
  const text = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!text) throw new ClaudeCallError("no_answer", usage, attempts);
  try {
    return JSON.parse(text.text);
  } catch {
    // Never the parser's message: it quotes the text it could not read.
    throw new ClaudeCallError("invalid_json", usage, attempts);
  }
}

/** One structured-output call, tried up to three times. Resolves with the parsed JSON. */
export async function callStructured(
  client: MessagesClient,
  request: StructuredRequest,
  options: CallOptions = {},
): Promise<StructuredAnswer> {
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;
  const body: Anthropic.MessageCreateParamsNonStreaming = {
    model: options.model ?? AI_IMPORT_MODEL,
    max_tokens: request.maxTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: request.schema } },
    messages: [{ role: "user", content: request.content }],
  };

  let usage = NO_USAGE;
  for (let attempt = 1; ; attempt += 1) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create(body);
    } catch (error) {
      const failure = classifyError(error);
      if (!failure.retryable || attempt >= MAX_ATTEMPTS) {
        throw new ClaudeCallError(failure.code, usage, attempt, failure.status);
      }
      await sleep(backoffMs(attempt, failure.retryAfterMs, random));
      continue;
    }
    usage = addUsage(usage, usageOf(response));
    return { value: answerOf(response, usage, attempt), usage, attempts: attempt };
  }
}

/**
 * The client for this deployment: the fake one when `AI_IMPORT_FAKE=1` outside production, the
 * real one otherwise. Throws `not_configured` when there is no key, or when production asks for
 * the fake: a test switch must never answer a real teacher.
 */
export function createClaudeClient(env: AiImportEnv = process.env): MessagesClient {
  if (fakeClaudeWanted(env)) return fakeClaudeClient();
  if (env.AI_IMPORT_FAKE === "1") throw new ClaudeCallError("not_configured");
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new ClaudeCallError("not_configured");
  return new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
}
