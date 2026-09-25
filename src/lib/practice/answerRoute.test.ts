import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  answerPracticeItem,
  type PracticeAnswerDeps,
  type PracticeAnswerStore,
} from "./answerRoute";
import { PRACTICE_ANSWER_LIMIT } from "./limits";
import type { PracticeSlot } from "./view";

const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
if (MR.type !== "multiple_response" || MC.type !== "multiple_choice") throw new Error("fixtures");

const STUDENT = "00000000-0000-4000-8000-0000000000d1";
const RUN = "00000000-0000-4000-8000-0000000000a1";
const MR_ROW = "00000000-0000-4000-8000-0000000000f1";
const MC_ROW = "00000000-0000-4000-8000-0000000000f2";

// One wrong option picked, so the reveal has something to mark.
const WRONG_SATA = { type: "multiple_response", optionIds: ["opt_c"] };

const SLOTS: PracticeSlot[] = [
  { itemId: MR_ROW, caseStudyId: null, step: null },
  { itemId: MC_ROW, caseStudyId: null, step: null },
];

function fakeStore(overrides: Partial<PracticeAnswerStore> = {}) {
  const store: PracticeAnswerStore = {
    slots: vi.fn(async () => ({ slots: SLOTS, answered: new Set<string>() })),
    items: vi.fn(async (_student: string, _runId: string, ids: readonly string[]) =>
      ids.flatMap((id) =>
        id === MR_ROW ? [{ rowId: id, item: MR }] : id === MC_ROW ? [{ rowId: id, item: MC }] : [],
      ),
    ),
    record: vi.fn(async () => "recorded" as const),
    ...overrides,
  };
  return store;
}

function deps(overrides: Partial<PracticeAnswerDeps> = {}): PracticeAnswerDeps {
  return {
    student: async () => STUDENT,
    store: fakeStore(),
    limiter: createMemoryRateLimitStore(),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/practice/answer", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const answer = (itemId = MR_ROW, response: unknown = WRONG_SATA) =>
  post({ runId: RUN, itemId, response });

/** The strings only a key, a rationale or a scoring rule would put in a payload. */
function secretsOf(item: Item): string[] {
  const secrets = [JSON.stringify(item.answerKey)];
  if (item.rationale.general) secrets.push(item.rationale.general.value);
  for (const text of Object.values(item.rationale.perElement ?? {})) secrets.push(text.value);
  return secrets;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/practice/answer, on the bytes it returns", () => {
  it("returns the answered item's key, score and rationale, and nothing of any other item", async () => {
    const store = fakeStore();
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const bytes = await response.text();

    // The answered item's secrets are there: the control that the probe can see a key.
    for (const secret of secretsOf(MR)) expect(bytes).toContain(secret);
    // Every other item of the run was handed to the route with its key, and none of it leaves.
    for (const secret of secretsOf(MC)) expect(bytes).not.toContain(secret);
    expect(bytes).not.toContain(MC.id);

    const body = JSON.parse(bytes) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["answerKey", "rationale", "score", "scoring"]);
    expect(body.answerKey).toEqual(MR.answerKey);
    expect((body.score as { points: number }).points).toBeLessThan(
      (body.score as { maxPoints: number }).maxPoints,
    );
    expect(store.items).toHaveBeenCalledWith(STUDENT, RUN, [MR_ROW]);
  });

  it("scores and reveals the run's recorded content, read for this student and run (#271)", async () => {
    // What the run recorded at start, and what the author has since saved over it.
    const recorded = { ...MR, answerKey: { correctOptionIds: ["opt_c"] } } as Item;
    const store = fakeStore({
      items: vi.fn(async (student: string, runId: string, ids: readonly string[]) =>
        student === STUDENT && runId === RUN && ids.includes(MR_ROW)
          ? [{ rowId: MR_ROW, item: recorded }]
          : [{ rowId: MR_ROW, item: MR }],
      ),
    });
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      answerKey: unknown;
      score: { points: number; maxPoints: number };
    };
    expect(body.answerKey).toEqual({ correctOptionIds: ["opt_c"] });
    expect(body.answerKey).not.toEqual(MR.answerKey);
    // opt_c alone is wrong against the current key and right against the recorded one.
    expect(body.score.points).toBe(body.score.maxPoints);
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ score: expect.objectContaining({ points: body.score.points }) }),
    );
  });

  it("records the score before it answers, as the student the session names", async () => {
    const store = fakeStore();
    await answerPracticeItem(answer(), deps({ store }));
    expect(store.slots).toHaveBeenCalledWith(STUDENT, RUN);
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({
        student: STUDENT,
        runId: RUN,
        itemId: MR_ROW,
        response: WRONG_SATA,
      }),
    );
  });

  it("returns no key when the record fails", async () => {
    const store = fakeStore({ record: vi.fn(async () => "failed" as const) });
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(500);
    const bytes = await response.text();
    for (const secret of secretsOf(MR)) expect(bytes).not.toContain(secret);
  });

  it("refuses an item this run has already answered, with no key", async () => {
    const store = fakeStore({
      slots: vi.fn(async () => ({ slots: SLOTS, answered: new Set([MR_ROW]) })),
    });
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(409);
    const bytes = await response.text();
    for (const secret of secretsOf(MR)) expect(bytes).not.toContain(secret);
    expect(JSON.parse(bytes)).toMatchObject({ refusal: "answered" });
    expect(store.record).not.toHaveBeenCalled();
  });

  it("refuses when the database says the item was answered in between", async () => {
    const store = fakeStore({ record: vi.fn(async () => "answered" as const) });
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(409);
    const bytes = await response.text();
    for (const secret of secretsOf(MR)) expect(bytes).not.toContain(secret);
  });
});

describe("POST /api/practice/answer, who may ask", () => {
  it("answers 401 without a session, and reads nothing", async () => {
    const store = fakeStore();
    const response = await answerPracticeItem(answer(), deps({ store, student: async () => null }));
    expect(response.status).toBe(401);
    expect(store.slots).not.toHaveBeenCalled();
  });

  it("answers 404 for a run that is not live for this student (not theirs, started over, or share stopped)", async () => {
    const store = fakeStore({
      slots: vi.fn(async () => ({ slots: [], answered: new Set<string>() })),
    });
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(404);
    expect(store.items).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it("answers 404 for an item that is not one of the run's", async () => {
    const store = fakeStore();
    const other = "00000000-0000-4000-8000-0000000000ff";
    const response = await answerPracticeItem(answer(other), deps({ store }));
    expect(response.status).toBe(404);
    expect(store.items).not.toHaveBeenCalled();
  });

  it("answers 404 when the database refuses the record (the share stopped mid-request)", async () => {
    const store = fakeStore({ record: vi.fn(async () => "not_found" as const) });
    const response = await answerPracticeItem(answer(), deps({ store }));
    expect(response.status).toBe(404);
    const bytes = await response.text();
    for (const secret of secretsOf(MR)) expect(bytes).not.toContain(secret);
  });

  it("answers 500 when the run cannot be read", async () => {
    const store = fakeStore({ slots: vi.fn(async () => null) });
    expect((await answerPracticeItem(answer(), deps({ store }))).status).toBe(500);
  });
});

describe("POST /api/practice/answer, reading the request", () => {
  it("refuses anything that is not JSON, before reading who asks", async () => {
    const student = vi.fn(async () => STUDENT);
    const response = await answerPracticeItem(
      post("runId=x", { "content-type": "application/x-www-form-urlencoded" }),
      deps({ student }),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["broken JSON", "{"],
    ["a list", [1]],
    ["no run", { itemId: MR_ROW, response: WRONG_SATA }],
    ["a run that is not a uuid", { runId: "../x", itemId: MR_ROW, response: WRONG_SATA }],
    ["an item that is not a uuid", { runId: RUN, itemId: "mr_1", response: WRONG_SATA }],
  ])("refuses %s with 400", async (_name, body) => {
    const store = fakeStore();
    const response = await answerPracticeItem(post(body), deps({ store }));
    expect(response.status).toBe(400);
    expect(store.slots).not.toHaveBeenCalled();
  });

  it("refuses an answer for another item type with 400, and records nothing", async () => {
    const store = fakeStore();
    const response = await answerPracticeItem(
      answer(MR_ROW, { type: "multiple_choice", optionId: "opt_a" }),
      deps({ store }),
    );
    expect(response.status).toBe(400);
    expect(store.record).not.toHaveBeenCalled();
  });

  it("refuses a body over the item size limit with 413", async () => {
    const response = await answerPracticeItem(
      post({ runId: RUN, itemId: MR_ROW, response: { type: "x", pad: "y".repeat(300_000) } }),
      deps(),
    );
    expect(response.status).toBe(413);
  });
});

describe("POST /api/practice/answer, the rate limit", () => {
  it("counts each answer per student and refuses past the limit with 429", async () => {
    const limiter = createMemoryRateLimitStore();
    for (let n = 0; n < PRACTICE_ANSWER_LIMIT.attempts; n += 1) {
      await limiter.hit("practice_answer", STUDENT, PRACTICE_ANSWER_LIMIT);
    }
    const store = fakeStore();
    const response = await answerPracticeItem(answer(), deps({ limiter, store }));
    expect(response.status).toBe(429);
    expect(store.record).not.toHaveBeenCalled();
    expect(limiter.hits().at(-1)).toEqual({ bucket: "practice_answer", key: STUDENT });
  });

  it("fails open with a warning when the limiter cannot answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = createMemoryRateLimitStore();
    limiter.failWith(new Error("down"));
    const response = await answerPracticeItem(answer(), deps({ limiter }));
    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(STUDENT);
  });
});
