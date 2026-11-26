import { describe, expect, it, vi } from "vitest";
import type { StructuredRequest } from "./claude";
import { AI_USAGE_KINDS, estimateRequestCost, reserveUsage, type UsageRpc } from "./ledger";

/**
 * What #621 adds to the shared ledger: a reservation's kind, and the estimate for a call that
 * sends no document chunk. AI import's own ledger tests (`src/lib/aiImport/ledger.test.ts`) hold
 * what it did before, unchanged.
 */

const OK_ROW = {
  data: [
    {
      allowed: true,
      reason: "ok",
      reservation_id: "res-1",
      remaining_usd: "9.90",
      remaining_pages: null,
    },
  ],
  error: null,
};

function recordingRpc(answer: { data: unknown; error: unknown } = OK_ROW) {
  const rpc = vi.fn(async () => answer);
  return {
    rpc: rpc as unknown as UsageRpc,
    calls: rpc.mock.calls as unknown as [string, Record<string, unknown>][],
  };
}

describe("reserveUsage, by kind", () => {
  it("names the three kinds the database accepts", () => {
    expect(AI_USAGE_KINDS).toEqual(["import", "draft_rationale", "draft_variant"]);
  });

  it("sends no kind when none is given, so the database records import as before", async () => {
    const { rpc, calls } = recordingRpc();
    await reserveUsage(rpc, { orgId: "org-1", batchId: "batch-1", pages: 8, costUsd: 0.15 });
    expect(calls[0][1]).not.toHaveProperty("p_kind");
    expect(calls[0][1]).toEqual({
      p_org: "org-1",
      p_batch: "batch-1",
      p_pages: 8,
      p_cost_usd: 0.15,
    });
  });

  it.each(["draft_rationale", "draft_variant"] as const)(
    "reserves a %s call with no batch and no pages, on the same cap",
    async (kind) => {
      const { rpc, calls } = recordingRpc();
      await expect(
        reserveUsage(rpc, { orgId: "org-1", pages: 0, costUsd: 0.05, kind }),
      ).resolves.toEqual({
        ok: true,
        reservationId: "res-1",
        remainingUsd: 9.9,
        remainingPages: null,
      });
      expect(calls).toEqual([
        ["reserve_ai_usage", { p_org: "org-1", p_pages: 0, p_cost_usd: 0.05, p_kind: kind }],
      ]);
    },
  );

  it("reads a draft refused because import spent the month as cap_reached", async () => {
    const { rpc } = recordingRpc({
      data: [
        {
          allowed: false,
          reason: "cap_reached",
          reservation_id: null,
          remaining_usd: "0.000000",
          remaining_pages: null,
        },
      ],
      error: null,
    });
    await expect(
      reserveUsage(rpc, { orgId: "org-1", pages: 0, costUsd: 0.05, kind: "draft_variant" }),
    ).resolves.toEqual({ ok: false, reason: "cap_reached", remainingUsd: 0, remainingPages: null });
  });
});

const DRAFT_REQUEST: StructuredRequest = {
  system: "r".repeat(3_000),
  schema: { type: "object", properties: { draft_rationale: { type: "string" } } },
  content: [
    { type: "text", text: "<document>\n" + "q".repeat(2_989) + "\n</document>" },
    { type: "text", text: "x".repeat(1_500) },
  ],
  maxTokens: 2_000,
};

describe("estimateRequestCost", () => {
  it("counts the rules, the schema and the question text, priced as a cache write, plus all of maxTokens", () => {
    const schemaChars = JSON.stringify(DRAFT_REQUEST.schema).length;
    const chars = 3_000 + schemaChars + 3_012 + 1_500;
    const inputTokens = 200 + Math.ceil(chars / 3);
    // Rounded up to the ledger's six places, as a chunk's estimate is.
    expect(estimateRequestCost(DRAFT_REQUEST)).toBe(
      Math.ceil(inputTokens * 2.5 + 2_000 * 10) / 1e6,
    );
  });

  it("grows with the question text and with the schema", () => {
    const base = estimateRequestCost(DRAFT_REQUEST);
    const longer = estimateRequestCost({
      ...DRAFT_REQUEST,
      content: [...DRAFT_REQUEST.content, { type: "text", text: "y".repeat(3_000) }],
    });
    expect(longer).toBeCloseTo(base + (1_000 * 2.5) / 1e6, 6);
    const widerSchema = estimateRequestCost({
      ...DRAFT_REQUEST,
      schema: { ...DRAFT_REQUEST.schema, description: "z".repeat(3_000) },
    });
    expect(widerSchema).toBeGreaterThan(base);
  });

  it("never reserves less than a cent", () => {
    expect(estimateRequestCost({ system: "", schema: {}, content: [], maxTokens: 1 })).toBe(0.01);
  });

  it("refuses a document or image block: a chunk is estimated by its pages, by import", () => {
    expect(() =>
      estimateRequestCost({
        ...DRAFT_REQUEST,
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" },
          },
        ],
      }),
    ).toThrow(/text only, not a document block/);
  });

  it("stays well inside what one reservation may be, for a long case study step", () => {
    expect(
      estimateRequestCost({
        ...DRAFT_REQUEST,
        content: [{ type: "text", text: "x".repeat(60_000) }],
        maxTokens: 8_000,
      }),
    ).toBeLessThan(1);
  });
});
