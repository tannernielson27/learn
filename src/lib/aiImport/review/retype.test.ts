import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagesClient } from "../claude";
import { ClaudeCallError } from "../claude";
import type { UsageRpc } from "../ledger";
import { readSegment, type ChunkSegment } from "../segment";
import { reply } from "../testing/messages";
import {
  COURSE_ACTIVITY,
  activitySegment,
  checkAnswerDraft,
  preparedActivity,
} from "../testing/extractRecordings";
import type { EntryRow } from "./read";
import { fakeClient } from "../upload/testing/fakeSupabase";
import { asType, retypeDeps, retypeEntry, type RetypeDeps, type RetypePatch } from "./retype";

afterEach(() => vi.restoreAllMocks());

const ENV = { ANTHROPIC_API_KEY: "sk-ant-test" };
const REQUEST = {
  orgId: "org-1",
  batchId: "batch-1",
  entryId: "entry-1",
  version: 2,
  type: "multiple_response" as const,
  userId: "teacher-1",
};

/** Question 2 of the activity ("Which food..."), the file's second question, in the batch's second file. */
const entryRow = (over: Partial<EntryRow> = {}): EntryRow => ({
  id: "entry-1",
  version: 2,
  position: 1001,
  kind: "item",
  type: "multiple_choice",
  status: "ready",
  reasons: ["check_key: Check it.", "duplicate: The same as question 4."],
  source_excerpt: "Which food should the nurse suggest first?",
  item: {},
  group_key: null,
  step: null,
  ...over,
});

function ledger(refuse?: "cap_reached") {
  const reserves: Record<string, unknown>[] = [];
  const settles: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "reserve_ai_usage") {
      reserves.push(args);
      return refuse
        ? {
            data: [{ allowed: false, reason: refuse, remaining_usd: 0.01, remaining_pages: null }],
            error: null,
          }
        : {
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

const segments = (): ChunkSegment[] => [
  readSegment(
    activitySegment,
    { position: 0, of: 1, pageFrom: null, pageTo: null },
    { type: "text", text: COURSE_ACTIVITY },
  ),
];

const RETYPED = {
  question_1: {
    draft: { ...checkAnswerDraft, type: "multiple_response" },
    sourceErrors: [],
  },
};

function deps(
  options: Partial<RetypeDeps> & { usage?: ReturnType<typeof ledger>; answers?: unknown[] } = {},
) {
  const usage = options.usage ?? ledger();
  const answers = [...(options.answers ?? [RETYPED])];
  const create = vi.fn(async () => reply(JSON.stringify(answers.shift() ?? {})));
  const writes: { version: number; patch: RetypePatch }[] = [];
  const wired: RetypeDeps = {
    env: ENV,
    client: () => ({ messages: { create } }) as MessagesClient,
    usageRpc: usage.rpc,
    takeExtractCall: vi.fn(async () => "ok" as const),
    loadSegments: vi.fn(async () => ({
      ok: true as const,
      segments: segments(),
      chunkIds: new Map([[0, "chunk-0"]]),
    })),
    loadFile: vi.fn(async () => ({
      ok: true as const,
      bytes: new Uint8Array(),
      prepared: preparedActivity(),
    })),
    readEntry: vi.fn(async () => entryRow()),
    batchInReview: vi.fn(async () => true),
    fileAt: vi.fn(async (_org, _batch, place: number) => (place === 1 ? "file-2" : null)),
    writeEntry: vi.fn(async (_org, _batch, _entry, version: number, patch: RetypePatch) => {
      writes.push({ version, patch });
      return { version: version + 1 };
    }),
    sleep: async () => {},
    random: () => 0,
    ...options,
  };
  return { wired, create, usage, writes };
}

describe("retypeEntry", () => {
  it("reads the one question again as the chosen type, under a reservation, at the version shown", async () => {
    const { wired, create, usage, writes } = deps();
    const result = await retypeEntry(wired, REQUEST);
    expect(result).toMatchObject({ ok: true, version: 3, status: "needs_fix" });
    if (!result.ok) throw new Error(result.code);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(create).toHaveBeenCalled();
    // The question asked for is the second one, as a multiple response question.
    const asked = JSON.stringify(create.mock.calls[0]);
    expect(asked).toContain("multiple_response");
    expect(asked).toContain("Which food should the nurse suggest first");
    expect(usage.reserves[0]).toMatchObject({ p_org: "org-1", p_batch: "batch-1", p_pages: 0 });
    expect(usage.settles).toHaveLength(usage.reserves.length);
    expect(wired.fileAt).toHaveBeenCalledWith("org-1", "batch-1", 1);
    expect(wired.loadSegments).toHaveBeenCalledWith({
      orgId: "org-1",
      batchId: "batch-1",
      fileId: "file-2",
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.version).toBe(2);
    expect(writes[0]!.patch.type).toBe("multiple_response");
    // Read as the new type, the four options are too few for it: a fix the teacher makes (#347).
    expect(writes[0]!.patch.reasons[0]).toMatch(/^needs_fix: content.options/);
    // The batch's duplicate flag is kept; the old reading's reasons are not.
    expect(writes[0]!.patch.reasons).toContain("duplicate: The same as question 4.");
    expect(writes[0]!.patch.reasons).not.toContain("check_key: Check it.");
  });

  it("takes the teacher's word for the type: sure, and with no 'no NGN type' reason", () => {
    const [question] = segments()[0]!.questions;
    const typed = asType({ ...question!, position: 2, chunks: [0], answers: [] }, "bowtie");
    expect(typed).toMatchObject({ type: "bowtie", confidence: 1, flags: { notNgn: null } });
  });

  it("refuses an entry another tab changed, before any call", async () => {
    const { wired, create } = deps({ readEntry: vi.fn(async () => entryRow({ version: 3 })) });
    expect(await retypeEntry(wired, REQUEST)).toEqual({ ok: false, code: "entry_changed" });
    expect(create).not.toHaveBeenCalled();
    expect(wired.takeExtractCall).not.toHaveBeenCalled();
  });

  it("reports a change that lands while Claude reads it, and writes nothing over it", async () => {
    const { wired } = deps({ writeEntry: vi.fn(async () => "changed" as const) });
    expect(await retypeEntry(wired, REQUEST)).toEqual({ ok: false, code: "entry_changed" });
  });

  it("refuses a dropped question before any call: it stays dropped until restored", async () => {
    const { wired, create } = deps({
      readEntry: vi.fn(async () => entryRow({ status: "dropped" })),
    });
    expect(await retypeEntry(wired, REQUEST)).toEqual({ ok: false, code: "not_retypable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("writes nothing once the batch has left review while Claude was reading", async () => {
    const { wired, writes } = deps({ batchInReview: vi.fn(async () => false) });
    expect(await retypeEntry(wired, REQUEST)).toEqual({ ok: false, code: "not_review" });
    expect(writes).toEqual([]);
    const broken = deps({ batchInReview: vi.fn(async () => "unavailable" as const) });
    expect(await retypeEntry(broken.wired, REQUEST)).toEqual({ ok: false, code: "unavailable" });
  });

  it("refuses a case study, which has no single type", async () => {
    const { wired, create } = deps({
      readEntry: vi.fn(async () => entryRow({ kind: "case_study", type: null })),
    });
    expect(await retypeEntry(wired, REQUEST)).toEqual({ ok: false, code: "not_retypable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("is not found for an entry, file or question that is not there", async () => {
    expect(await retypeEntry(deps({ readEntry: vi.fn(async () => null) }).wired, REQUEST)).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await retypeEntry(deps({ fileAt: vi.fn(async () => null) }).wired, REQUEST)).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(
      await retypeEntry(
        deps({ readEntry: vi.fn(async () => entryRow({ position: 1050 })) }).wired,
        REQUEST,
      ),
    ).toEqual({ ok: false, code: "not_found" });
  });

  it("passes on what stops it before a call: off, the allowance, the reads", async () => {
    expect(await retypeEntry(deps({ env: { AI_IMPORT_ENABLED: "false" } }).wired, REQUEST)).toEqual(
      {
        ok: false,
        code: "disabled",
      },
    );
    expect(
      await retypeEntry(
        deps({ takeExtractCall: vi.fn(async () => "rate_limited" as const) }).wired,
        REQUEST,
      ),
    ).toEqual({ ok: false, code: "rate_limited" });
    expect(
      await retypeEntry(
        deps({ readEntry: vi.fn(async () => "unavailable" as const) }).wired,
        REQUEST,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
    expect(
      await retypeEntry(deps({ fileAt: vi.fn(async () => "unavailable" as const) }).wired, REQUEST),
    ).toEqual({ ok: false, code: "unavailable" });
    expect(
      await retypeEntry(
        deps({
          loadSegments: vi.fn(async () => ({ ok: false as const, code: "incomplete" as const })),
        }).wired,
        REQUEST,
      ),
    ).toEqual({ ok: false, code: "incomplete" });
    expect(
      await retypeEntry(
        deps({ loadFile: vi.fn(async () => ({ ok: false as const, code: "changed" as const })) })
          .wired,
        REQUEST,
      ),
    ).toEqual({ ok: false, code: "changed" });
    expect(
      await retypeEntry(
        deps({ writeEntry: vi.fn(async () => "unavailable" as const) }).wired,
        REQUEST,
      ),
    ).toEqual({ ok: false, code: "unavailable" });
  });

  it("refuses at the cap with nothing called", async () => {
    const { wired, create } = deps({ usage: ledger("cap_reached") });
    expect(await retypeEntry(wired, REQUEST)).toMatchObject({ ok: false, code: "cap_reached" });
    expect(create).not.toHaveBeenCalled();
  });

  it("names Claude's failure, and settles what the failed call spent", async () => {
    const usage = ledger();
    const failing = vi.fn(async () => {
      throw new ClaudeCallError("overloaded", { input_tokens: 5, output_tokens: 0 } as never);
    });
    const { wired } = deps({
      usage,
      client: () => ({ messages: { create: failing } }) as unknown as MessagesClient,
    });
    expect(await retypeEntry(wired, REQUEST)).toMatchObject({ ok: false, code: "claude_failed" });
    expect(usage.settles).toHaveLength(usage.reserves.length);
  });

  it("names a client that cannot be built", async () => {
    const { wired } = deps({
      client: () => {
        throw new Error("no key");
      },
    });
    expect(await retypeEntry(wired, REQUEST)).toEqual({
      ok: false,
      code: "claude_failed",
      reason: "not_configured",
    });
  });
});

describe("retypeDeps, the production wiring", () => {
  it("names the workspace, the batch and the version in every query", async () => {
    const service = fakeClient({
      ai_import_entries: [
        { data: entryRow() },
        { data: [{ version: 3 }] },
        { data: [] },
        { error: { code: "XX000" } },
        { error: { code: "XX000" } },
      ],
      ai_import_batches: [
        { data: { status: "review" } },
        { data: { status: "imported" } },
        { error: { code: "XX000" } },
      ],
      ai_import_files: [
        { data: [{ id: "file-1" }, { id: "file-2" }] },
        { data: [] },
        { error: { code: "XX000" } },
      ],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wired = retypeDeps(service.client);
    expect(await wired.readEntry("org-1", "batch-1", "entry-1")).toMatchObject({ id: "entry-1" });
    const patch: RetypePatch = {
      type: "bowtie",
      status: "ready",
      reasons: [],
      draft: null,
      item: null,
    };
    expect(await wired.writeEntry("org-1", "batch-1", "entry-1", 2, patch)).toEqual({ version: 3 });
    expect(await wired.writeEntry("org-1", "batch-1", "entry-1", 2, patch)).toBe("changed");
    expect(await wired.writeEntry("org-1", "batch-1", "entry-1", 2, patch)).toBe("unavailable");
    expect(await wired.readEntry("org-1", "batch-1", "entry-1")).toBe("unavailable");
    expect(await wired.batchInReview("org-1", "batch-1")).toBe(true);
    expect(await wired.batchInReview("org-1", "batch-1")).toBe(false);
    expect(await wired.batchInReview("org-1", "batch-1")).toBe("unavailable");
    expect(service.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", "org-1"]);
    expect(await wired.fileAt("org-1", "batch-1", 1)).toBe("file-2");
    expect(await wired.fileAt("org-1", "batch-1", 0)).toBeNull();
    expect(await wired.fileAt("org-1", "batch-1", 0)).toBe("unavailable");
    for (const table of ["ai_import_entries", "ai_import_files"]) {
      const orgFilters = service.stepsOn(table, "eq").filter(([column]) => column === "org_id");
      expect(orgFilters.length).toBeGreaterThan(0);
      expect(orgFilters.every(([, value]) => value === "org-1")).toBe(true);
    }
    expect(service.stepsOn("ai_import_entries", "eq")).toContainEqual(["version", 2]);
  });
});
