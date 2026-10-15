import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagesClient } from "./claude";
import type { PreparedFile } from "./files/prepare";
import { estimatePages } from "./files/text";
import { estimateSegmentCost, type UsageRpc } from "./ledger";
import { mergeSegments } from "./merge";
import { segmentChunk, segmentChunkDeps, type SegmentChunkDeps } from "./segmentChunk";
import { reply } from "./testing/messages";
import { answersAtTheBack, injectedInstruction, preparedText } from "./testing/segmentRecordings";

const ENV = { ANTHROPIC_API_KEY: "sk-ant-test" };
const REF = { orgId: "org-1", batchId: "batch-1", fileId: "file-1", userId: "teacher-1" };

/** The ledger as #340's two functions keep it, in memory: one month, one workspace. */
function fakeLedger(capUsd = 10, pageCap: number | null = null, reason = "ok") {
  const state = { reservedUsd: 0, usedUsd: 0, reservedPages: 0, usedPages: 0, calls: 0 };
  const reservations = new Map<string, { pages: number; cost: number; settled: boolean }>();
  const reserves: Record<string, unknown>[] = [];
  const settles: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "reserve_ai_usage") {
      reserves.push(args);
      const pages = args.p_pages as number;
      const cost = args.p_cost_usd as number;
      const usd = state.reservedUsd + state.usedUsd;
      const used = state.reservedPages + state.usedPages;
      const remainingPages = pageCap === null ? null : Math.max(pageCap - used, 0);
      if (reason !== "ok") return { data: [{ allowed: false, reason }], error: null };
      if (usd + cost > capUsd || (pageCap !== null && used + pages > pageCap)) {
        return {
          data: [
            {
              allowed: false,
              reason: "cap_reached",
              remaining_usd: capUsd - usd,
              remaining_pages: remainingPages,
            },
          ],
          error: null,
        };
      }
      const id = `res-${reservations.size + 1}`;
      reservations.set(id, { pages, cost, settled: false });
      state.reservedUsd += cost;
      state.reservedPages += pages;
      return {
        data: [
          {
            allowed: true,
            reason: "ok",
            reservation_id: id,
            remaining_usd: capUsd - usd - cost,
            remaining_pages: pageCap === null ? null : pageCap - used - pages,
          },
        ],
        error: null,
      };
    }
    settles.push(args);
    const reservation = reservations.get(args.p_reservation as string);
    if (!reservation || reservation.settled) return { data: false, error: null };
    reservation.settled = true;
    state.reservedUsd -= reservation.cost;
    state.reservedPages -= reservation.pages;
    state.usedUsd += args.p_cost_usd as number;
    state.usedPages += args.p_pages as number;
    state.calls += 1;
    return { data: true, error: null };
  });
  return { rpc: rpc as unknown as UsageRpc, state, reserves, settles };
}

/** Answers each request from the recording of the chunk it carries. */
function recordedClient(chunks: string[], answers: unknown[]) {
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    const sent = JSON.stringify(body.messages);
    const index = chunks.findIndex((chunk) =>
      sent.includes(JSON.stringify(chunk).slice(1, -1).slice(0, 60)),
    );
    return reply(JSON.stringify(answers[index]), { input: 2_000, output: 300 });
  });
  return { client: { messages: { create } } as MessagesClient, create };
}

function deps(
  prepared: PreparedFile,
  client: MessagesClient,
  ledger = fakeLedger(),
  overrides: Partial<SegmentChunkDeps> = {},
): SegmentChunkDeps {
  return {
    env: ENV,
    client: () => client,
    usageRpc: ledger.rpc,
    takeParseCall: vi.fn(async () => "ok" as const),
    loadFile: vi.fn(async () => ({ ok: true as const, bytes: new Uint8Array(), prepared })),
    storeSegment: vi.fn(async () => "stored" as const),
    sleep: vi.fn(async () => {}),
    random: () => 0,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("segmentChunk on recorded responses", () => {
  it("attaches the answers at the back of chunk 3 to the questions in chunk 1, and finds a split question once", async () => {
    const { chunks, answers } = answersAtTheBack();
    const prepared = preparedText(chunks);
    const { client, create } = recordedClient(chunks, answers);
    const ledger = fakeLedger();
    const d = deps(prepared, client, ledger);

    const segments = [];
    for (const position of [0, 1, 2]) {
      const result = await segmentChunk(d, { ...REF, position });
      if (!result.ok) throw new Error(result.code);
      segments.push(result.segment);
    }
    expect(create).toHaveBeenCalledTimes(3);

    const merged = mergeSegments(segments);
    expect(
      merged.questions.map((q) => [q.number, q.type, q.chunks, q.answers.map((a) => a.text)]),
    ).toEqual([
      [
        "1.",
        "dropdown_cloze",
        [0],
        ["sit the client upright; start oxygen at 1 to 2 L/min by nasal cannula"],
      ],
      [
        "2.",
        "dropdown_rationale",
        [0, 1],
        ["cardiac dysrhythmias; a serum potassium of 2.9 mEq/L"],
      ],
      ["3.", "dragdrop_cloze", [1], ["hyperkalemia; peaked T waves"]],
      ["4.", "dragdrop_rationale", [1], ["hypocalcemia; tingling around the mouth"]],
      ["5.", "multiple_response", [1], ["A, B, D"]],
    ]);
    expect(merged.questions[1]).toMatchObject({
      excerpt: "A client has been vomiting for 2 days. The serum potassium is 2.9 mEq/L.",
      scoringRule: "Scoring Rule: Rationale",
      // The read that saw the rationale rule was the surer one.
      confidence: 0.95,
    });
    expect(merged.questions.every((q) => !q.flags.notInSource)).toBe(true);
    expect(merged.unlinkedAnswers).toEqual([]);

    // One reservation and one settlement per chunk, every page charged once.
    expect(ledger.reserves).toHaveLength(3);
    expect(ledger.settles).toHaveLength(3);
    expect(ledger.state.reservedUsd).toBeCloseTo(0, 9);
    expect(ledger.state.usedPages).toBe(
      chunks.reduce((sum, chunk) => sum + estimatePages(chunk.length), 0),
    );
  });

  it("the injected instruction changes nothing: no invented answer, the same reservation", async () => {
    const { chunks, answers } = injectedInstruction();
    const prepared = preparedText(chunks);
    const { client } = recordedClient(chunks, answers);
    const ledger = fakeLedger();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await segmentChunk(deps(prepared, client, ledger), { ...REF, position: 0 });
    if (!result.ok) throw new Error(result.code);
    expect(result.segment.answers).toEqual([]);
    expect(result.segment.droppedAnswers).toBe(1);
    const merged = mergeSegments([result.segment]);
    expect(merged.questions[0]).toMatchObject({ number: "Question 4", answers: [] });
    expect(merged.questions[0].flags.notInSource).toBe(false);

    // What is reserved, and for whom, is fixed before the model reads a word.
    const payload = { type: "text" as const, text: chunks[0] };
    const pages = estimatePages(chunks[0].length);
    expect(ledger.reserves).toEqual([
      {
        p_org: "org-1",
        p_batch: "batch-1",
        p_pages: pages,
        p_cost_usd: estimateSegmentCost(payload, pages),
      },
    ]);
    expect(ledger.settles[0]).toMatchObject({
      p_pages: pages,
      p_input_tokens: 2_060,
      p_output_tokens: 300,
    });
  });
});

describe("segmentChunk's checks", () => {
  const prepared = preparedText(["## 1.\n\nWhich action first?\n"]);
  const ok = () =>
    recordedClient(
      prepared.chunks.map((c) => c.text ?? ""),
      [{ questions: [], answers: [] }],
    );

  it("stops a reservation over the cap before the call, and reports what is left", async () => {
    const { client, create } = ok();
    const ledger = fakeLedger(0.01, 40);
    const result = await segmentChunk(deps(prepared, client, ledger), { ...REF, position: 0 });
    expect(result).toEqual({
      ok: false,
      code: "cap_reached",
      remainingUsd: 0.01,
      remainingPages: 40,
    });
    expect(create).not.toHaveBeenCalled();
    expect(ledger.settles).toEqual([]);
  });

  it("stops at the page cap too, reporting the pages left", async () => {
    const { client, create } = ok();
    const ledger = fakeLedger(10, 0);
    const result = await segmentChunk(deps(prepared, client, ledger), { ...REF, position: 0 });
    expect(result).toMatchObject({ code: "cap_reached", remainingPages: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("retries a 529, then fails the chunk without charging its pages, and a retry later charges them once", async () => {
    const overloaded = Object.assign(new Error("Overloaded"), { status: 529 });
    const create = vi.fn(async (): Promise<Anthropic.Message> => {
      throw overloaded;
    });
    const ledger = fakeLedger();
    const d = deps(prepared, { messages: { create } }, ledger);

    const failed = await segmentChunk(d, { ...REF, position: 0 });
    expect(failed).toEqual({ ok: false, code: "claude_failed", reason: "overloaded" });
    expect(create).toHaveBeenCalledTimes(3);
    expect(d.sleep).toHaveBeenCalledTimes(2);
    expect(ledger.reserves).toHaveLength(1);
    expect(ledger.settles).toEqual([
      { p_reservation: "res-1", p_pages: 0, p_input_tokens: 0, p_output_tokens: 0, p_cost_usd: 0 },
    ]);
    expect(ledger.state).toMatchObject({ reservedPages: 0, usedPages: 0, usedUsd: 0 });

    create.mockImplementation(async () => reply('{"questions":[],"answers":[]}'));
    const again = await segmentChunk(d, { ...REF, position: 0 });
    expect(again.ok).toBe(true);
    expect(ledger.state.usedPages).toBe(1);
  });

  it("settles what Claude billed for an answer that does not fit the schema", async () => {
    const create = vi.fn(async () => reply('{"questions": "Jane Doe"}'));
    const ledger = fakeLedger();
    const result = await segmentChunk(deps(prepared, { messages: { create } }, ledger), {
      ...REF,
      position: 0,
    });
    expect(result).toEqual({ ok: false, code: "bad_answer" });
    expect(ledger.settles[0]).toMatchObject({ p_pages: 0, p_output_tokens: 20 });
    expect(ledger.state.usedUsd).toBeGreaterThan(0);
  });

  it("refuses before anything when AI import is off", async () => {
    const { client, create } = ok();
    const ledger = fakeLedger();
    const d = deps(prepared, client, ledger, { env: { ...ENV, AI_IMPORT_ENABLED: "false" } });
    expect(await segmentChunk(d, { ...REF, position: 0 })).toEqual({ ok: false, code: "disabled" });
    expect(d.takeParseCall).not.toHaveBeenCalled();
    expect(d.loadFile).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(ledger.reserves).toEqual([]);
  });

  it("answers disabled for a workspace with AI import off, sending nothing", async () => {
    const { client, create } = ok();
    const result = await segmentChunk(deps(prepared, client, fakeLedger(10, null, "disabled")), {
      ...REF,
      position: 0,
    });
    expect(result).toEqual({ ok: false, code: "disabled" });
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["rate_limited", "unavailable"] as const)(
    "stops when the limiter answers %s",
    async (answer) => {
      const { client, create } = ok();
      const d = deps(prepared, client, fakeLedger(), { takeParseCall: vi.fn(async () => answer) });
      expect(await segmentChunk(d, { ...REF, position: 0 })).toEqual({ ok: false, code: answer });
      expect(d.loadFile).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("refuses a file whose bytes changed, and a chunk the file does not have", async () => {
    const { client, create } = ok();
    const ledger = fakeLedger();
    const changed = deps(prepared, client, ledger, {
      loadFile: vi.fn(async () => ({ ok: false as const, code: "changed" as const })),
    });
    expect(await segmentChunk(changed, { ...REF, position: 0 })).toEqual({
      ok: false,
      code: "changed",
    });
    expect(await segmentChunk(deps(prepared, client, ledger), { ...REF, position: 4 })).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(create).not.toHaveBeenCalled();
    expect(ledger.reserves).toEqual([]);
  });

  it("answers unavailable when the chunk cannot be cut, before reserving", async () => {
    const broken: PreparedFile = {
      ...prepared,
      kind: "pdf",
      chunks: [{ position: 0, pageFrom: 1, pageTo: 2, text: null }],
    };
    const { client } = ok();
    const ledger = fakeLedger();
    const result = await segmentChunk(deps(broken, client, ledger), { ...REF, position: 0 });
    expect(result).toEqual({ ok: false, code: "unavailable" });
    expect(ledger.reserves).toEqual([]);
  });

  it("reserves nothing when there is no client to call", async () => {
    const ledger = fakeLedger();
    const d = deps(prepared, ok().client, ledger, {
      client: () => {
        throw new Error("no key");
      },
    });
    expect(await segmentChunk(d, { ...REF, position: 0 })).toEqual({
      ok: false,
      code: "claude_failed",
      reason: "not_configured",
    });
    expect(ledger.reserves).toEqual([]);
  });

  it("answers unavailable when the ledger cannot reserve", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, create } = ok();
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "57014" },
    })) as unknown as UsageRpc;
    const result = await segmentChunk(deps(prepared, client, fakeLedger(), { usageRpc: rpc }), {
      ...REF,
      position: 0,
    });
    expect(result).toEqual({ ok: false, code: "unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports the attempts, cost and what is left on success", async () => {
    const { client } = ok();
    const result = await segmentChunk(deps(prepared, client), { ...REF, position: 0 });
    expect(result).toMatchObject({ ok: true, attempts: 1, remainingPages: null });
    if (result.ok) expect(result.costUsd).toBeGreaterThan(0);
  });

  it("keeps the chunk's answer for the extract pass, under the file and position asked for", async () => {
    const { client } = ok();
    const storeSegment = vi.fn(async () => "stored" as const);
    const result = await segmentChunk(deps(prepared, client, fakeLedger(), { storeSegment }), {
      ...REF,
      position: 0,
    });
    if (!result.ok) throw new Error(result.code);
    expect(storeSegment).toHaveBeenCalledWith(
      { orgId: "org-1", batchId: "batch-1", fileId: "file-1" },
      0,
      result.segment,
    );
  });

  it("answers unavailable when the answer cannot be kept, after settling the call", async () => {
    const { client } = ok();
    const ledger = fakeLedger();
    const storeSegment = vi.fn(async () => "unavailable" as const);
    const result = await segmentChunk(deps(prepared, client, ledger, { storeSegment }), {
      ...REF,
      position: 0,
    });
    expect(result).toEqual({ ok: false, code: "unavailable" });
    expect(ledger.settles).toHaveLength(1);
  });
});

describe("segmentChunkDeps", () => {
  it("calls the ledger through the service client", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const service = { rpc } as unknown as Parameters<typeof segmentChunkDeps>[0];
    const wired = segmentChunkDeps(service);
    await wired.usageRpc("settle_ai_usage", {
      p_reservation: "r",
      p_pages: 0,
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_cost_usd: 0,
    });
    expect(rpc).toHaveBeenCalledWith(
      "settle_ai_usage",
      expect.objectContaining({ p_reservation: "r" }),
    );
    expect(typeof wired.client).toBe("function");
    expect(typeof wired.takeParseCall).toBe("function");
    expect(typeof wired.loadFile).toBe("function");
    expect(typeof wired.storeSegment).toBe("function");
  });
});
