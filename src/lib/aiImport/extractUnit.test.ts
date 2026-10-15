import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagesClient } from "./claude";
import { ClaudeCallError } from "./claude";
import {
  POSITIONS_PER_FILE,
  extractUnit,
  extractUnitDeps,
  unitPayload,
  type ExtractUnitDeps,
  type StagedRow,
} from "./extractUnit";
import { prepareFile, type PreparedFile } from "./files/prepare";
import type { UsageRpc } from "./ledger";
import { readSegment, type ChunkSegment } from "./segment";
import { reply } from "./testing/messages";
import {
  COURSE_ACTIVITY,
  activityExtraction,
  activitySegment,
  preparedActivity,
} from "./testing/extractRecordings";
import { corpusText } from "./testing/segmentRecordings";

afterEach(() => vi.restoreAllMocks());

const ENV = { ANTHROPIC_API_KEY: "sk-ant-test" };
const REQUEST = { orgId: "org-1", batchId: "batch-1", fileId: "file-1", userId: "teacher-1" };

function ledger(refuse?: "cap_reached" | "disabled") {
  const reserves: Record<string, unknown>[] = [];
  const settles: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "reserve_ai_usage") {
      reserves.push(args);
      if (refuse) {
        return {
          data: [{ allowed: false, reason: refuse, remaining_usd: 0.01, remaining_pages: null }],
          error: null,
        };
      }
      return {
        data: [
          {
            allowed: true,
            reason: "ok",
            reservation_id: `res-${reserves.length}`,
            remaining_usd: 9,
            remaining_pages: null,
          },
        ],
        error: null,
      };
    }
    settles.push(args);
    return { data: true, error: null };
  });
  return { rpc: rpc as unknown as UsageRpc, reserves, settles };
}

function segmentsOf(text: string, answer: unknown): ChunkSegment[] {
  return [
    readSegment(
      answer,
      { position: 0, of: 1, pageFrom: null, pageTo: null },
      { type: "text", text },
    ),
  ];
}

function deps(
  options: {
    prepared?: PreparedFile;
    segments?: ChunkSegment[];
    answers?: unknown[];
    staged?: { count: number; positions: Set<number> };
    usage?: ReturnType<typeof ledger>;
  } & Partial<ExtractUnitDeps> = {},
) {
  const prepared = options.prepared ?? preparedActivity();
  const answers = [...(options.answers ?? [activityExtraction])];
  const inserted: StagedRow[] = [];
  const create = vi.fn(async () => reply(JSON.stringify(answers.shift() ?? {})));
  const usage = options.usage ?? ledger();
  const wired: ExtractUnitDeps = {
    env: ENV,
    client: () => ({ messages: { create } }) as MessagesClient,
    usageRpc: usage.rpc,
    takeExtractCall: vi.fn(async () => "ok" as const),
    loadSegments: vi.fn(async () => ({
      ok: true as const,
      segments: options.segments ?? segmentsOf(COURSE_ACTIVITY, activitySegment),
      chunkIds: new Map([[0, "chunk-0"]]),
    })),
    loadFile: vi.fn(async () => ({ ok: true as const, bytes: new Uint8Array(), prepared })),
    filePlace: vi.fn(async () => 1),
    stagedPlaces: vi.fn(async () => options.staged ?? { count: 0, positions: new Set<number>() }),
    insertEntries: vi.fn(async (_ref, rows: StagedRow[]) => {
      inserted.push(...rows);
      return "ok" as const;
    }),
    sleep: async () => {},
    random: () => 0,
    ...options,
  };
  return { wired, create, inserted, usage };
}

describe("extractUnit on the recorded course activity", () => {
  it("stages the questions with no NGN type in unit 0, with no call and no reservation", async () => {
    const { wired, create, inserted, usage } = deps();
    const result = await extractUnit(wired, { ...REQUEST, unit: 0 });
    expect(result).toMatchObject({ ok: true, units: 2, alreadyStaged: 0, overLimit: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(usage.reserves).toEqual([]);
    expect(inserted.map((row) => [row.position, row.status, row.type, row.chunk_id])).toEqual([
      [POSITIONS_PER_FILE + 2, "not_importable", null, "chunk-0"],
      [POSITIONS_PER_FILE + 3, "not_importable", null, "chunk-0"],
    ]);
    expect(inserted[0].reasons).toEqual(["not_ngn: A calculation with no answer choices."]);
  });

  it("extracts unit 1 in one call under one reservation, settled with no pages", async () => {
    const { wired, create, inserted, usage } = deps();
    const result = await extractUnit(wired, { ...REQUEST, unit: 1 });
    if (!result.ok) throw new Error(result.code);
    expect(create).toHaveBeenCalledTimes(1);
    expect(usage.reserves).toEqual([
      expect.objectContaining({ p_org: "org-1", p_batch: "batch-1", p_pages: 0 }),
    ]);
    expect(usage.settles).toEqual([
      expect.objectContaining({ p_reservation: "res-1", p_pages: 0, p_output_tokens: 20 }),
    ]);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(inserted.map((row) => [row.position, row.status, row.type])).toEqual([
      [POSITIONS_PER_FILE, "needs_answer", "matrix_multiple_choice"],
      [POSITIONS_PER_FILE + 1, "ready", "multiple_choice"],
    ]);
    expect(inserted[1].item).toMatchObject({ answerKey: { correctOptionId: "opt_b" } });
    expect(inserted[0].source_excerpt).toMatch(/^For each finding/);
  });

  it("stages nothing twice: a unit sent again makes no call", async () => {
    const positions = new Set([POSITIONS_PER_FILE, POSITIONS_PER_FILE + 1]);
    const { wired, create, inserted } = deps({ staged: { count: 2, positions } });
    expect(await extractUnit(wired, { ...REQUEST, unit: 1 })).toMatchObject({
      ok: true,
      staged: [],
      alreadyStaged: 2,
    });
    expect(create).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("stops at 150 entries per batch and reports the rest", async () => {
    const one = deps({
      staged: { count: 149, positions: new Set() },
      answers: [{ question_1: activityExtraction.question_1 }],
    });
    expect(await extractUnit(one.wired, { ...REQUEST, unit: 1 })).toMatchObject({
      ok: true,
      overLimit: 1,
    });
    expect(one.inserted).toHaveLength(1);

    const none = deps({ staged: { count: 150, positions: new Set() } });
    expect(await extractUnit(none.wired, { ...REQUEST, unit: 1 })).toMatchObject({
      ok: true,
      staged: [],
      overLimit: 2,
    });
    expect(none.create).not.toHaveBeenCalled();
  });

  it("repairs under a reservation of its own", async () => {
    const broken = {
      question_1: activityExtraction.question_1,
      question_2: {
        draft: { ...activityExtraction.question_2.draft, answer: "Answer: ✅ F." },
        sourceErrors: [],
      },
    };
    const { wired, create, usage, inserted } = deps({
      answers: [broken, { question_1: activityExtraction.question_2 }],
    });
    await extractUnit(wired, { ...REQUEST, unit: 1 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(usage.reserves).toHaveLength(2);
    expect(usage.settles).toHaveLength(2);
    expect(inserted[1].status).toBe("ready");
  });
});

describe("extractUnit on a case study group", () => {
  /** The activity with its first two questions grouped as "Patient 1": a group of two. */
  const grouped = {
    ...activitySegment,
    questions: activitySegment.questions.map((question, index) =>
      index < 2 ? { ...question, caseStudy: { title: "Patient 1" } } : question,
    ),
  };
  const segments = () => segmentsOf(COURSE_ACTIVITY, grouped);

  it("stages a group that is not six as its questions, with their places and #344's note", async () => {
    const { wired, create, inserted } = deps({
      segments: segments(),
      answers: [activityExtraction, {}],
    });
    const result = await extractUnit(wired, { ...REQUEST, unit: 1 });
    expect(result).toMatchObject({ ok: true, units: 2, overLimit: 0 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(inserted.map((row) => [row.kind, row.status, row.group_key, row.step])).toEqual([
      ["item", "needs_answer", "Patient 1", 1],
      ["item", "ready", "Patient 1", 2],
    ]);
    expect(inserted[0].reasons.some((reason) => reason.startsWith("note: "))).toBe(true);
  });

  it("stages a group whole or not at all: a group sent again makes no call", async () => {
    const { wired, create } = deps({
      segments: segments(),
      staged: { count: 1, positions: new Set([POSITIONS_PER_FILE + 1]) },
    });
    expect(await extractUnit(wired, { ...REQUEST, unit: 1 })).toMatchObject({
      ok: true,
      alreadyStaged: 2,
      staged: [],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps what fits in the batch and reports the rest", async () => {
    const { wired, inserted } = deps({
      segments: segments(),
      answers: [activityExtraction, {}],
      staged: { count: 149, positions: new Set() },
    });
    expect(await extractUnit(wired, { ...REQUEST, unit: 1 })).toMatchObject({
      ok: true,
      overLimit: 1,
    });
    expect(inserted).toHaveLength(1);
    const full = deps({ segments: segments(), staged: { count: 150, positions: new Set() } });
    expect(await extractUnit(full.wired, { ...REQUEST, unit: 1 })).toMatchObject({
      ok: true,
      overLimit: 2,
    });
    expect(full.create).not.toHaveBeenCalled();
  });
});

describe("extractUnit's checks", () => {
  it("refuses before anything when AI import is off or the teacher is over their limit", async () => {
    const off = deps({ env: { AI_IMPORT_ENABLED: "false", ANTHROPIC_API_KEY: "k" } });
    expect(await extractUnit(off.wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "disabled",
    });
    const limited = deps({ takeExtractCall: async () => "rate_limited" });
    expect(await extractUnit(limited.wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect(limited.wired.loadSegments).not.toHaveBeenCalled();
  });

  it("waits while a chunk has no segments, and refuses a unit or file it does not know", async () => {
    const waiting = deps({ loadSegments: async () => ({ ok: false, code: "incomplete" }) });
    expect(await extractUnit(waiting.wired, { ...REQUEST, unit: 0 })).toEqual({
      ok: false,
      code: "incomplete",
    });
    const { wired } = deps();
    expect(await extractUnit(wired, { ...REQUEST, unit: 9 })).toEqual({
      ok: false,
      code: "not_found",
    });
    const elsewhere = deps({ filePlace: async () => null });
    expect(await extractUnit(elsewhere.wired, { ...REQUEST, unit: 0 })).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("answers unavailable when the batch cannot be read or the entries cannot be written", async () => {
    for (const override of [
      { filePlace: async () => "unavailable" as const },
      { stagedPlaces: async () => "unavailable" as const },
      { insertEntries: async () => "unavailable" as const },
    ]) {
      const { wired } = deps(override);
      expect(await extractUnit(wired, { ...REQUEST, unit: 0 })).toEqual({
        ok: false,
        code: "unavailable",
      });
    }
  });

  it("stops at the cap before the call, staging nothing", async () => {
    const { wired, create, inserted } = deps({ usage: ledger("cap_reached") });
    expect(await extractUnit(wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "cap_reached",
      remainingUsd: 0.01,
      remainingPages: null,
    });
    expect(create).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
    const disabled = deps({ usage: ledger("disabled") });
    expect(await extractUnit(disabled.wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "disabled",
    });
  });

  it("fails the unit when Claude fails, settling what it billed", async () => {
    const usage = ledger();
    const create = vi.fn(async () => {
      throw { status: 400 };
    });
    const { wired, inserted } = deps({
      usage,
      client: () => ({ messages: { create } }) as unknown as MessagesClient,
    });
    expect(await extractUnit(wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "claude_failed",
      reason: "rejected",
    });
    expect(usage.settles).toEqual([expect.objectContaining({ p_cost_usd: 0 })]);
    expect(inserted).toEqual([]);
  });

  it("refuses a changed file, and reserves nothing without a client", async () => {
    const changed = deps({ loadFile: async () => ({ ok: false, code: "changed" }) });
    expect(await extractUnit(changed.wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "changed",
    });
    const usage = ledger();
    const keyless = deps({
      usage,
      client: () => {
        throw new ClaudeCallError("not_configured");
      },
    });
    expect(await extractUnit(keyless.wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "claude_failed",
      reason: "not_configured",
    });
    const odd = deps({
      client: () => {
        throw new Error("odd");
      },
    });
    expect(await extractUnit(odd.wired, { ...REQUEST, unit: 1 })).toMatchObject({
      reason: "not_configured",
    });
    expect(usage.reserves).toEqual([]);
  });

  it("answers unavailable when the unit's pages cannot be cut", async () => {
    const prepared: PreparedFile = {
      ...preparedActivity(),
      kind: "pdf",
      chunks: [{ position: 0, pageFrom: 1, pageTo: 2, text: null }],
    };
    const { wired } = deps({ prepared });
    expect(await extractUnit(wired, { ...REQUEST, unit: 1 })).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});

describe("the checkpoint: a .md of multiple choice and select-all questions", () => {
  it("becomes staged entries with statuses", async () => {
    const text = corpusText("01-med-surg-review.md");
    const recording = JSON.parse(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "../../../test/ai-import/recordings/01-med-surg-review.json",
        ),
        "utf8",
      ),
    ) as { questions: { opening: string; type: string; draft?: unknown; reason?: string }[] };
    const segment = {
      questions: recording.questions.map((q) => ({
        excerpt: q.opening,
        type: q.type === "not_importable" ? "not_ngn" : q.type,
        ...(q.reason ? { notNgnReason: q.reason } : {}),
        confidence: 0.9,
        instructorNote: false,
        reliesOnImage: false,
        cutOff: false,
        continued: false,
      })),
      answers: [],
    };
    const segments = segmentsOf(text, segment);
    const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
      const content = body.messages[0].content as Anthropic.TextBlockParam[];
      const asked = JSON.parse(
        /<questions>\n([\s\S]*)\n<\/questions>/.exec(content.at(-1)!.text)![1],
      );
      return reply(
        JSON.stringify(
          Object.fromEntries(
            asked.map((a: { field: string; opens: string }) => [
              a.field,
              {
                draft: recording.questions.find((q) => q.opening === a.opens)!.draft,
                sourceErrors: [],
              },
            ]),
          ),
        ),
      );
    });
    const prepared = {
      ...preparedActivity(text),
    };
    const { wired, inserted } = deps({
      prepared,
      segments,
      client: () => ({ messages: { create } }) as unknown as MessagesClient,
    });
    const first = await extractUnit(wired, { ...REQUEST, unit: 0 });
    if (!first.ok) throw new Error(first.code);
    for (let unit = 1; unit < first.units; unit += 1) {
      const result = await extractUnit(wired, { ...REQUEST, unit });
      if (!result.ok) throw new Error(result.code);
    }
    const byPosition = [...inserted].sort((a, b) => a.position - b.position);
    expect(byPosition.map((row) => [row.type, row.status])).toEqual([
      ["multiple_choice", "ready"],
      ["multiple_response", "ready"],
      ["multiple_choice", "ready"],
      ["multiple_choice", "needs_answer"],
      ["ordered_response", "ready"],
      ["highlight_table", "ready"],
      [null, "not_importable"],
      ["multiple_response_grouping", "ready"],
    ]);
  });
});

describe("unitPayload", () => {
  it("joins a question's text chunks", async () => {
    const prepared: PreparedFile = {
      ...preparedActivity(),
      chunks: [
        { position: 0, pageFrom: null, pageTo: null, text: "one " },
        { position: 1, pageFrom: null, pageTo: null, text: "two" },
      ],
    };
    expect(await unitPayload(new Uint8Array(), prepared, [0, 1])).toEqual({
      payload: { type: "text", text: "one two" },
      pages: 1,
    });
    await expect(unitPayload(new Uint8Array(), prepared, [5])).rejects.toThrow(/no chunk/);
  });

  it("cuts a PDF question's pages across its chunks", async () => {
    const bytes = new Uint8Array(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          "../../../test/ai-import/corpus/04-two-column-handout.pdf",
        ),
      ),
    );
    const prepared = await prepareFile(bytes, "handout.pdf");
    if (!prepared.ok) throw new Error(prepared.code);
    const { payload, pages } = await unitPayload(bytes, prepared, [0]);
    expect(payload.type).toBe("pdf");
    expect(pages).toBe(prepared.chunks[0].pageTo! - prepared.chunks[0].pageFrom! + 1);
  });
});

describe("extractUnitDeps", () => {
  function service(results: Record<string, { data: unknown; error: unknown }>) {
    const calls: { table: string; method: string; args: unknown[] }[] = [];
    const from = (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "upsert"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => void) => resolve(results[table]);
      return builder;
    };
    return {
      client: { from, rpc: vi.fn() } as unknown as Parameters<typeof extractUnitDeps>[0],
      calls,
    };
  }
  const ref = { orgId: "org-1", batchId: "batch-1", fileId: "file-2" };

  it("places a file by its order in the batch, and counts what is staged", async () => {
    const { client } = service({
      ai_import_files: { data: [{ id: "file-1" }, { id: "file-2" }], error: null },
      ai_import_entries: { data: [{ position: 0 }, { position: 1000 }], error: null },
    });
    const wired = extractUnitDeps(client);
    expect(await wired.filePlace(ref)).toBe(1);
    expect(await wired.filePlace({ ...ref, fileId: "other" })).toBeNull();
    expect(await wired.stagedPlaces(ref)).toEqual({ count: 2, positions: new Set([0, 1000]) });
    expect(typeof wired.client).toBe("function");
    expect(typeof wired.loadSegments).toBe("function");
    expect(typeof wired.loadFile).toBe("function");
    expect(typeof wired.takeExtractCall).toBe("function");
  });

  it("inserts each row once, ignoring a place already staged", async () => {
    const { client, calls } = service({ ai_import_entries: { data: null, error: null } });
    const row = { position: 3 } as StagedRow;
    expect(await extractUnitDeps(client).insertEntries(ref, [row])).toBe("ok");
    expect(calls.at(-1)).toEqual({
      table: "ai_import_entries",
      method: "upsert",
      args: [
        [{ position: 3, batch_id: "batch-1", org_id: "org-1" }],
        { onConflict: "batch_id,position", ignoreDuplicates: true },
      ],
    });
  });

  it("answers unavailable on a database error, logging only its code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { data: null, error: { code: "57014" } };
    const wired = extractUnitDeps(
      service({ ai_import_files: failing, ai_import_entries: failing }).client,
    );
    expect(await wired.filePlace(ref)).toBe("unavailable");
    expect(await wired.stagedPlaces(ref)).toBe("unavailable");
    expect(await wired.insertEntries(ref, [])).toBe("unavailable");
    for (const call of log.mock.calls) expect(call[1]).toEqual({ code: "57014" });
  });
});
