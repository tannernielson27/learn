import { describe, expect, it } from "vitest";
import {
  NO_USAGE,
  addUsage,
  aiDraftEnabled,
  aiImportEnabled,
  costOf,
  totalInputTokens,
  fakeClaudeWanted,
} from "./config";

describe("aiImportEnabled", () => {
  it.each([
    [{ ANTHROPIC_API_KEY: "sk-ant" }, true],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_IMPORT_ENABLED: "true" }, true],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_IMPORT_ENABLED: "false" }, false],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_IMPORT_ENABLED: " FALSE " }, false],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_IMPORT_ENABLED: "0" }, false],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_IMPORT_ENABLED: "off" }, false],
    [{ ANTHROPIC_API_KEY: "  " }, false],
    [{}, false],
    [{ AI_IMPORT_FAKE: "1" }, true],
    [{ AI_IMPORT_FAKE: "1", AI_IMPORT_ENABLED: "false" }, false],
    [{ AI_IMPORT_FAKE: "1", VERCEL_ENV: "production" }, false],
  ])("%j -> %s", (env, enabled) => {
    expect(aiImportEnabled(env)).toBe(enabled);
  });

  it("never uses the fake client in production", () => {
    expect(fakeClaudeWanted({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(fakeClaudeWanted({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(fakeClaudeWanted({ AI_IMPORT_FAKE: "true" })).toBe(false);
  });
});

describe("aiDraftEnabled", () => {
  it("is off unless AI_DRAFT_ENABLED is set, whatever else is", () => {
    expect(aiDraftEnabled({})).toBe(false);
    expect(aiDraftEnabled({ ANTHROPIC_API_KEY: "sk-ant" })).toBe(false);
    expect(aiDraftEnabled({ ANTHROPIC_API_KEY: "sk-ant", AI_IMPORT_ENABLED: "true" })).toBe(false);
    expect(aiDraftEnabled({ AI_IMPORT_FAKE: "1" })).toBe(false);
  });

  it.each([
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: "true" }, true],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: " TRUE " }, true],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: "1" }, true],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: "on" }, true],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: "false" }, false],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: "" }, false],
    [{ ANTHROPIC_API_KEY: "sk-ant", AI_DRAFT_ENABLED: "maybe" }, false],
    [{ ANTHROPIC_API_KEY: "  ", AI_DRAFT_ENABLED: "true" }, false],
    [{ AI_DRAFT_ENABLED: "true" }, false],
    [{ AI_IMPORT_FAKE: "1", AI_DRAFT_ENABLED: "true" }, true],
    [{ AI_IMPORT_FAKE: "1", AI_DRAFT_ENABLED: "true", VERCEL_ENV: "production" }, false],
  ])("%j -> %s", (env, enabled) => {
    expect(aiDraftEnabled(env)).toBe(enabled);
  });

  it("is apart from import's flag: turning import off neither turns drafting on nor off", () => {
    const key = { ANTHROPIC_API_KEY: "sk-ant" };
    expect(aiDraftEnabled({ ...key, AI_IMPORT_ENABLED: "false" })).toBe(false);
    expect(aiDraftEnabled({ ...key, AI_IMPORT_ENABLED: "false", AI_DRAFT_ENABLED: "true" })).toBe(
      true,
    );
    expect(aiImportEnabled({ ...key, AI_DRAFT_ENABLED: "true", AI_IMPORT_ENABLED: "false" })).toBe(
      false,
    );
  });
});

describe("costOf", () => {
  it("prices each kind of token at Sonnet 5.5's list price", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    };
    expect(costOf(usage)).toBeCloseTo(2 + 1 + 2.5 + 0.2, 6);
    expect(costOf(NO_USAGE)).toBe(0);
    expect(totalInputTokens(usage)).toBe(3_000_000);
  });

  it("rounds up to the ledger's six places", () => {
    expect(costOf({ ...NO_USAGE, inputTokens: 1 })).toBe(0.000002);
    expect(costOf({ ...NO_USAGE, cacheReadTokens: 1 })).toBe(0.000001);
  });

  it("adds usage without changing either side", () => {
    const a = { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 };
    expect(addUsage(a, a)).toEqual({
      inputTokens: 2,
      outputTokens: 4,
      cacheWriteTokens: 6,
      cacheReadTokens: 8,
    });
    expect(a.inputTokens).toBe(1);
  });
});
