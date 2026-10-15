import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  ClaudeCallError,
  backoffMs,
  callStructured,
  classifyError,
  createClaudeClient,
  type MessagesClient,
  type StructuredRequest,
} from "./claude";
import { MAX_ATTEMPTS, RETRY_MAX_MS } from "./config";
import { reply } from "./testing/messages";

const REQUEST: StructuredRequest = {
  system: "the rules",
  schema: { type: "object" },
  content: [{ type: "text", text: "<document>\nQuestion text\n</document>" }],
  maxTokens: 100,
};

const overloaded = () => Object.assign(new Error("Overloaded"), { status: 529 });

function scripted(...steps: (Anthropic.Message | Error)[]) {
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    void body;
    const step = steps.shift();
    if (!step) throw new Error("no more steps");
    if (step instanceof Error) throw step;
    return step;
  });
  return { client: { messages: { create } } as MessagesClient, create };
}

const noWait = { sleep: vi.fn(async () => {}), random: () => 0 };

describe("callStructured", () => {
  it("sends structured outputs on Sonnet 5.5, with the rules cached", async () => {
    const { client, create } = scripted(reply('{"questions":[]}'));
    const answer = await callStructured(client, REQUEST, noWait);
    expect(answer).toEqual({
      value: { questions: [] },
      attempts: 1,
      usage: { inputTokens: 100, outputTokens: 20, cacheWriteTokens: 50, cacheReadTokens: 10 },
    });
    const body = create.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.max_tokens).toBe(100);
    expect(body.system).toEqual([
      { type: "text", text: "the rules", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.output_config).toEqual({
      format: { type: "json_schema", schema: { type: "object" } },
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it("tries a 529 again after a backoff, and counts only what was billed", async () => {
    const sleep = vi.fn(async () => {});
    const { client, create } = scripted(overloaded(), reply("{}"));
    const answer = await callStructured(client, REQUEST, { sleep, random: () => 0 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(answer.attempts).toBe(2);
    expect(answer.usage.inputTokens).toBe(100);
  });

  it("gives up after three 529s with the attempts and no usage", async () => {
    const { client, create } = scripted(overloaded(), overloaded(), overloaded());
    const error = await callStructured(client, REQUEST, noWait).catch((e: unknown) => e);
    expect(create).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(error).toBeInstanceOf(ClaudeCallError);
    expect(error).toMatchObject({ code: "overloaded", attempts: 3, status: 529 });
    expect((error as ClaudeCallError).usage.inputTokens).toBe(0);
  });

  it("does not try a rejected request again", async () => {
    const bad = Object.assign(new Error("invalid schema"), { status: 400 });
    const { client, create } = scripted(bad);
    await expect(callStructured(client, REQUEST, noWait)).rejects.toMatchObject({
      code: "rejected",
      status: 400,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["max_tokens", reply('{"questions": [', { stop: "max_tokens" })],
    ["refusal", reply("", { stop: "refusal" })],
    ["invalid_json", reply("Patient Jane Doe, not JSON")],
  ])("fails %s with what was billed, and never quotes the answer", async (code, message) => {
    const { client } = scripted(message);
    const error = (await callStructured(client, REQUEST, noWait).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code });
    expect((error as ClaudeCallError).usage.outputTokens).toBe(20);
    expect(error.message).not.toMatch(/Jane|questions/);
  });

  it("fails an answer with no text block", async () => {
    const empty = { ...reply("{}"), content: [] } as unknown as Anthropic.Message;
    const { client } = scripted(empty);
    await expect(callStructured(client, REQUEST, noWait)).rejects.toMatchObject({
      code: "no_answer",
    });
  });
});

describe("classifyError", () => {
  it.each([
    [{ status: 429 }, "rate_limited", true],
    [{ status: 529 }, "overloaded", true],
    [{ status: 500 }, "server", true],
    [{ status: 503 }, "server", true],
    [{ status: 401 }, "rejected", false],
    [{ name: "APIConnectionError" }, "connection", true],
    [{ name: "APIConnectionTimeoutError" }, "timeout", false],
    [new Error("boom"), "connection", false],
    ["a string", "connection", false],
  ])("%j is %s", (error, code, retryable) => {
    expect(classifyError(error)).toMatchObject({ code, retryable });
  });

  it("reads retry-after, and the backoff honours it up to the cap", () => {
    const headers = new Headers({ "retry-after": "7" });
    const classified = classifyError({ status: 429, headers });
    expect(classified.retryAfterMs).toBe(7_000);
    expect(backoffMs(1, classified.retryAfterMs, () => 0)).toBe(7_000);
    expect(backoffMs(1, 60_000, () => 0)).toBe(RETRY_MAX_MS);
    expect(backoffMs(2, null, () => 0)).toBe(4_000);
    expect(backoffMs(1, null, () => 0.999)).toBeLessThan(2_250);
  });

  it("ignores a retry-after it cannot read", () => {
    expect(
      classifyError({ status: 529, headers: new Headers({ "retry-after": "soon" }) }),
    ).toMatchObject({
      retryAfterMs: null,
    });
  });
});

describe("createClaudeClient", () => {
  it("builds the SDK client with its own retries off", () => {
    const client = createClaudeClient({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(client).toBeInstanceOf(Anthropic);
    expect((client as Anthropic).maxRetries).toBe(0);
  });

  it("refuses without a key", () => {
    expect(() => createClaudeClient({ ANTHROPIC_API_KEY: " " })).toThrow(ClaudeCallError);
    expect(() => createClaudeClient({})).toThrow(/not_configured/);
  });

  it("hands out the fake client for AI_IMPORT_FAKE=1, but never in production", () => {
    const fake = createClaudeClient({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "preview" });
    expect(fake).not.toBeInstanceOf(Anthropic);
    expect(() =>
      createClaudeClient({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "production", ANTHROPIC_API_KEY: "k" }),
    ).toThrow(/not_configured/);
  });
});
