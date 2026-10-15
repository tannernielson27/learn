import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_USAGE } from "./config";
import { estimateSegmentCost, reserveUsage, settleUsage, type UsageRpc } from "./ledger";

const REQUEST = { orgId: "org-1", batchId: "batch-1", pages: 8, costUsd: 0.15 };

function rpcAnswering(answer: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return { data: null, error: null, ...answer };
  });
  return {
    rpc: rpc as unknown as UsageRpc,
    calls: rpc.mock.calls as unknown as [string, unknown][],
  };
}

const row = (fields: Record<string, unknown>) => ({
  data: [
    {
      allowed: false,
      reason: "ok",
      reservation_id: null,
      remaining_usd: null,
      remaining_pages: null,
      ...fields,
    },
  ],
});

afterEach(() => vi.restoreAllMocks());

describe("reserveUsage", () => {
  it("reserves under the cap and passes the workspace, batch, pages and cost", async () => {
    const { rpc, calls } = rpcAnswering(
      row({
        allowed: true,
        reservation_id: "res-1",
        remaining_usd: "9.850000",
        remaining_pages: null,
      }),
    );
    await expect(reserveUsage(rpc, REQUEST)).resolves.toEqual({
      ok: true,
      reservationId: "res-1",
      remainingUsd: 9.85,
      remainingPages: null,
    });
    expect(calls[0]).toEqual([
      "reserve_ai_usage",
      { p_org: "org-1", p_batch: "batch-1", p_pages: 8, p_cost_usd: 0.15 },
    ]);
  });

  it("reports what is left when the cap is reached", async () => {
    const { rpc } = rpcAnswering(
      row({ reason: "cap_reached", remaining_usd: 0.04, remaining_pages: 3 }),
    );
    await expect(reserveUsage(rpc, REQUEST)).resolves.toEqual({
      ok: false,
      reason: "cap_reached",
      remainingUsd: 0.04,
      remainingPages: 3,
    });
  });

  it("answers disabled for a workspace with AI import off", async () => {
    const { rpc } = rpcAnswering(row({ reason: "disabled" }));
    await expect(reserveUsage(rpc, REQUEST)).resolves.toEqual({ ok: false, reason: "disabled" });
  });

  it.each([
    ["an error", { error: { code: "42501", message: "permission denied" } }],
    ["no row", { data: [] }],
    ["an unknown reason", row({ reason: "surprise" })],
    ["allowed without an id", row({ allowed: true })],
    ["a thrown call", new Error("network")],
  ])("fails closed on %s", async (_name, answer) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rpc } = rpcAnswering(answer);
    await expect(reserveUsage(rpc, REQUEST)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("settleUsage", () => {
  const usage = {
    inputTokens: 1000,
    outputTokens: 500,
    cacheWriteTokens: 2000,
    cacheReadTokens: 0,
  };

  it("settles every input token and the real cost", async () => {
    const { rpc, calls } = rpcAnswering({ data: true });
    await expect(settleUsage(rpc, "res-1", { pages: 8, usage })).resolves.toBe("settled");
    expect(calls[0]).toEqual([
      "settle_ai_usage",
      {
        p_reservation: "res-1",
        p_pages: 8,
        p_input_tokens: 3000,
        p_output_tokens: 500,
        p_cost_usd: 0.012,
      },
    ]);
  });

  it("settles a failed call with zeros", async () => {
    const { rpc, calls } = rpcAnswering({ data: true });
    await settleUsage(rpc, "res-1", { pages: 0, usage: NO_USAGE });
    expect(calls[0][1]).toMatchObject({
      p_pages: 0,
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_cost_usd: 0,
    });
  });

  it("knows a reservation settled already", async () => {
    const { rpc } = rpcAnswering({ data: false });
    await expect(settleUsage(rpc, "res-1", { pages: 0, usage: NO_USAGE })).resolves.toBe(
      "already_settled",
    );
  });

  it.each([[{ error: { code: "P0002" } }], [new Error("network")]])(
    "reports %j as unavailable",
    async (answer) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { rpc } = rpcAnswering(answer);
      await expect(settleUsage(rpc, "res-1", { pages: 0, usage: NO_USAGE })).resolves.toBe(
        "unavailable",
      );
    },
  );
});

describe("estimateSegmentCost", () => {
  it("reserves a PDF chunk by its pages and a text chunk by its length", () => {
    const pdf = estimateSegmentCost({ type: "pdf", bytes: new Uint8Array() }, 8);
    expect(pdf).toBeCloseTo(((3000 + 8 * 3200) * 2.5 + 8000 * 10) / 1e6, 6);
    const text = estimateSegmentCost({ type: "text", text: "x".repeat(30_000) }, 10);
    expect(text).toBeCloseTo(((3000 + 10_000) * 2.5 + 8000 * 10) / 1e6, 6);
  });

  it("stays well inside what one reservation may be", () => {
    expect(estimateSegmentCost({ type: "text", text: "x".repeat(32_000) }, 11)).toBeLessThan(1);
  });
});
