import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import type { ExtractUnitDeps, ExtractUnitResult } from "../extractUnit";
import type { ChunkSegment } from "../segment";
import {
  extractUnitResponse,
  unitState,
  UNIT_CLAIM_MS,
  type ExtractRouteDeps,
} from "./extractRoute";
import {
  BATCH,
  FILE,
  OFF,
  ON,
  ORG,
  USER,
  fakeClient,
  teacher,
  type Reply,
} from "./testing/fakeSupabase";

const question = (index: number, group: ChunkSegment["questions"][number]["group"] = null) => ({
  chunk: 0,
  index,
  excerpt: `Question ${index + 1} opens here.`,
  number: String(index + 1),
  page: null,
  type: "multiple_choice" as const,
  confidence: 0.9,
  group,
  scoringRule: null,
  flags: {
    instructorNote: false,
    reliesOnImage: false,
    notNgn: null,
    notInSource: false,
    ownChart: false,
  },
  sourceChecked: true,
  cutOff: false,
  continued: false,
});

function segmentOf(questions: ChunkSegment["questions"]): ChunkSegment {
  return {
    position: 0,
    pageFrom: null,
    pageTo: null,
    questions,
    answers: [],
    droppedAnswers: 0,
    source: { author: null, objectives: [], references: [] },
  };
}

type UnitReads = Pick<ExtractUnitDeps, "loadSegments" | "filePlace" | "stagedPlaces">;

function reads(questions: ChunkSegment["questions"], staged: number[] = [], place = 0): UnitReads {
  return {
    loadSegments: async () => ({
      ok: true,
      segments: [segmentOf(questions)],
      chunkIds: new Map([[0, "c1"]]),
    }),
    filePlace: async () => place,
    stagedPlaces: async () => ({ count: staged.length, positions: new Set(staged) }),
  };
}

const ok: ExtractUnitResult = {
  ok: true,
  units: 2,
  staged: [{} as never, {} as never],
  alreadyStaged: 0,
  overLimit: 1,
  usage: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 },
  costUsd: 0.00001,
};

const parsing: Reply = { data: { id: BATCH, status: "parsing", bank_id: null } };
const BODY = { batchId: BATCH, fileId: FILE, unit: 0 };

function post(body: unknown) {
  return new Request("https://learn.example/api/ai-import/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setup({
  author = teacher().author,
  batch = [parsing],
  result = ok,
  env = ON,
  unitReads = reads([question(0), question(1), question(2)]),
  claims = createMemoryRateLimitStore(),
}: {
  author?: RouteAuthor;
  batch?: Reply[];
  result?: ExtractUnitResult;
  env?: Record<string, string>;
  unitReads?: UnitReads;
  claims?: ReturnType<typeof createMemoryRateLimitStore>;
} = {}) {
  const service = fakeClient({ ai_import_batches: batch });
  const extract = vi.fn(async () => result);
  const deps: ExtractRouteDeps = {
    author: async () => author,
    env,
    service: () => service.client,
    extract,
    unitDeps: () => unitReads,
    claims: () => claims,
  };
  return { deps, service, extract, claims };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("POST /api/ai-import/extract", () => {
  it("claims the unit, extracts it as the session's teacher and answers counts only", async () => {
    const { deps, service, extract, claims } = setup();
    const response = await extractUnitResponse(post(BODY), deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, units: 2, staged: 2, alreadyStaged: 0, overLimit: 1 });
    expect(extract).toHaveBeenCalledWith(service.client, {
      orgId: ORG,
      batchId: BATCH,
      fileId: FILE,
      unit: 0,
      userId: USER,
    });
    expect(claims.hits()).toEqual([{ bucket: "ai_import_unit", key: `${BATCH}:${FILE}:0` }]);
  });

  it("answers busy to a second request for the same unit while the first holds it", async () => {
    const claims = createMemoryRateLimitStore();
    const first = setup({ claims });
    await extractUnitResponse(post(BODY), first.deps);
    const second = setup({ claims });
    const response = await extractUnitResponse(post(BODY), second.deps);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("busy");
    expect(second.extract).not.toHaveBeenCalled();
  });

  it("lets the unit be claimed again once the claim lapses (a function killed mid-unit)", async () => {
    let now = 0;
    const claims = createMemoryRateLimitStore({ now: () => now });
    await extractUnitResponse(post(BODY), setup({ claims }).deps);
    now = UNIT_CLAIM_MS + 1;
    const again = setup({ claims });
    expect((await extractUnitResponse(post(BODY), again.deps)).status).toBe(200);
    expect(again.extract).toHaveBeenCalled();
  });

  it("answers a unit staged already at once, with no claim and no call", async () => {
    const { deps, extract, claims } = setup({
      unitReads: reads([question(0), question(1)], [0, 1]),
    });
    const response = await extractUnitResponse(post(BODY), deps);
    expect(await response.json()).toEqual({
      ok: true,
      units: 1,
      staged: 0,
      alreadyStaged: 2,
      overLimit: 0,
    });
    expect(extract).not.toHaveBeenCalled();
    expect(claims.hits()).toEqual([]);
  });

  it.each([
    ["signed out", { status: "signed_out" } as RouteAuthor, 401],
    ["a student", { status: "forbidden", role: "student" } as RouteAuthor, 403],
    ["a workspace with AI import off", teacher(false).author, 404],
  ])("refuses %s", async (_name, author, status) => {
    const { deps, extract } = setup({ author });
    expect((await extractUnitResponse(post(BODY), deps)).status).toBe(status);
    expect(extract).not.toHaveBeenCalled();
  });

  it("answers 404 with AI import off for the deployment", async () => {
    const { deps, extract } = setup({ env: OFF });
    expect((await extractUnitResponse(post(BODY), deps)).status).toBe(404);
    expect(extract).not.toHaveBeenCalled();
  });

  it("answers 404 for another workspace's batch", async () => {
    const { deps, extract } = setup({ batch: [{ data: null }] });
    expect((await extractUnitResponse(post(BODY), deps)).status).toBe(404);
    expect(extract).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, code: "rate_limited" } as ExtractUnitResult, 429],
    [
      {
        ok: false,
        code: "cap_reached",
        remainingUsd: 0,
        remainingPages: null,
      } as ExtractUnitResult,
      402,
    ],
    [{ ok: false, code: "claude_failed", reason: "overloaded" } as ExtractUnitResult, 502],
    [{ ok: false, code: "incomplete" } as ExtractUnitResult, 409],
    [{ ok: false, code: "unavailable" } as ExtractUnitResult, 503],
    [{ ok: false, code: "disabled" } as ExtractUnitResult, 404],
  ])("maps %o to %i", async (result, status) => {
    const { deps } = setup({ result });
    expect((await extractUnitResponse(post(BODY), deps)).status).toBe(status);
  });

  it("answers 409 incomplete while a chunk has no segments", async () => {
    const { deps } = setup({
      unitReads: { ...reads([]), loadSegments: async () => ({ ok: false, code: "incomplete" }) },
    });
    expect((await extractUnitResponse(post(BODY), deps)).status).toBe(409);
  });

  it("answers 503 when the claim store cannot answer", async () => {
    const claims = createMemoryRateLimitStore();
    claims.failWith(new Error("down"));
    const { deps, extract } = setup({ claims });
    expect((await extractUnitResponse(post(BODY), deps)).status).toBe(503);
    expect(extract).not.toHaveBeenCalled();
  });
});

describe("unitState", () => {
  const ref = { orgId: ORG, batchId: BATCH, fileId: FILE };

  it("places a file's questions at file order times 1000", async () => {
    const state = await unitState(reads([question(0)], [1000], 1), ref, 0);
    expect(state).toEqual({ ok: true, units: 1, staged: true, questions: 1 });
  });

  it("is not staged while any standalone question of the unit is missing", async () => {
    const state = await unitState(reads([question(0), question(1)], [0]), ref, 0);
    expect(state).toMatchObject({ ok: true, staged: false });
  });

  it("counts a case study staged by its one entry", async () => {
    const steps = [1, 2, 3, 4, 5, 6].map((step, index) => question(index, { title: "Case", step }));
    const state = await unitState(reads(steps, [0]), ref, 0);
    expect(state).toMatchObject({ ok: true, staged: true });
  });

  it("treats a file with no questions as done, and a unit past the end as not found", async () => {
    expect(await unitState(reads([]), ref, 0)).toEqual({
      ok: true,
      units: 0,
      staged: true,
      questions: 0,
    });
    expect(await unitState(reads([question(0)]), ref, 5)).toEqual({ ok: false, code: "not_found" });
  });

  it("passes on unavailable reads", async () => {
    const base = reads([question(0)]);
    expect(await unitState({ ...base, filePlace: async () => "unavailable" }, ref, 0)).toEqual({
      ok: false,
      code: "unavailable",
    });
    expect(await unitState({ ...base, filePlace: async () => null }, ref, 0)).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await unitState({ ...base, stagedPlaces: async () => "unavailable" }, ref, 0)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
