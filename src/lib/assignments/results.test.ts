import { describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreSubmission } from "@/lib/ngn/submit";
import type { StudentAssignment } from "@/lib/supabase/attempts";
import type { MyResult, MyResultRead, ResultAttempt, ResultMark } from "@/lib/supabase/results";
import type { SetItem } from "./attemptScoring";
import { loadResultsPage, type ResultsStore } from "./results";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);
const STUDENT = "00000000-0000-4000-8000-0000000210d1";
const ASSIGNMENT = "00000000-0000-4000-8000-0000000210b1";

const rowId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const attemptId = (index: number) => `00000000-0000-4000-8000-0000000210a${index}`;
const setOf = (items: readonly Item[]): SetItem[] =>
  items.map((item, index) => ({ rowId: rowId(index + 1), item }));

/** The strings only a key or a rationale would put on the page. */
function secretsOf(item: Item): string[] {
  const secrets = [JSON.stringify(item.answerKey)];
  if (item.rationale.general) secrets.push(item.rationale.general.value);
  for (const text of Object.values(item.rationale.perElement ?? {})) secrets.push(text.value);
  return secrets;
}

const mcWrong = (item: Item): AnyResponse => {
  if (item.type !== "multiple_choice") throw new Error("not MC");
  const wrong = item.content.options.find((o) => o.id !== item.answerKey.correctOptionId);
  return { type: "multiple_choice", optionId: wrong?.id };
};
const mcRight = (item: Item): AnyResponse => {
  if (item.type !== "multiple_choice") throw new Error("not MC");
  return { type: "multiple_choice", optionId: item.answerKey.correctOptionId };
};

/** A mark as #208 records it, scored by the one scoring entry point. */
function markOf(entry: SetItem, response: AnyResponse): ResultMark {
  const { score } = scoreSubmission(entry.item, response);
  return {
    itemId: entry.rowId,
    response,
    points: score.points,
    maxPoints: score.maxPoints,
    model: score.model,
    breakdown: score.breakdown,
    groups: score.groups ?? null,
  };
}

function attempt(number: number, marks: ResultMark[], over: Partial<ResultAttempt> = {}) {
  const score = marks.reduce((sum, mark) => sum + (mark.points ?? 0), 0);
  return {
    id: attemptId(number),
    number,
    submittedAt: `2026-09-23T1${number}:00:00Z`,
    autoSubmitted: false,
    score,
    maxScore: 2,
    marks,
    ...over,
  } satisfies ResultAttempt;
}

function result(set: SetItem[], attempts: ResultAttempt[], over: Partial<MyResult> = {}): MyResult {
  return {
    assignmentId: ASSIGNMENT,
    title: "NUR 310 — Week 5",
    closesAt: "2026-09-23T12:00:00Z",
    maxAttempts: 2,
    itemSet: set.map((entry) => entry.rowId),
    patientRecord: null,
    attempts,
    ...over,
  };
}

const header: StudentAssignment = {
  id: ASSIGNMENT,
  classId: "00000000-0000-4000-8000-0000000210c1",
  title: "NUR 310 — Week 5",
  opensAt: "2026-09-22T12:00:00Z",
  closesAt: "2026-09-24T12:00:00Z",
  maxAttempts: 2,
  shuffleOptions: true,
  itemSet: [rowId(1), rowId(2)],
  patientRecord: null,
};

function store(
  read: MyResultRead,
  set: SetItem[] = setOf([MC, MR]),
  over: Partial<ResultsStore> = {},
) {
  return {
    autoSubmit: vi.fn(async () => 0),
    result: vi.fn(async () => read),
    assignment: vi.fn(async () => header),
    items: vi.fn(async () => set),
    ...over,
  } satisfies ResultsStore;
}

describe("loadResultsPage before the close", () => {
  it("hands over no key, rationale or score, and never reads the items", async () => {
    const set = setOf([MC, MR]);
    const fake = store({ kind: "withheld" }, set);
    // The control: what the store would hand the server carries every secret.
    const held = JSON.stringify(set);
    for (const item of [MC, MR])
      for (const secret of secretsOf(item)) expect(held).toContain(secret);

    const view = await loadResultsPage(fake, ASSIGNMENT, STUDENT);
    expect(view).toEqual({
      kind: "pending",
      assignment: {
        id: ASSIGNMENT,
        title: header.title,
        closesAt: header.closesAt,
        classId: header.classId,
      },
    });
    const bytes = JSON.stringify(view);
    for (const item of [MC, MR])
      for (const secret of secretsOf(item)) expect(bytes).not.toContain(secret);
    for (const field of ['"answerKey"', '"rationale"', '"score"', '"points"']) {
      expect(bytes).not.toContain(field);
    }
    expect(fake.items).not.toHaveBeenCalled();
  });

  it("is missing when nothing is released and the student cannot see the assignment", async () => {
    const fake = store({ kind: "withheld" }, undefined, { assignment: vi.fn(async () => null) });
    expect(await loadResultsPage(fake, ASSIGNMENT, STUDENT)).toEqual({ kind: "missing" });
    expect(fake.items).not.toHaveBeenCalled();
  });

  it("fails when the result cannot be read, without reading the items", async () => {
    const fake = store({ kind: "failed" });
    expect(await loadResultsPage(fake, ASSIGNMENT, STUDENT)).toEqual({ kind: "failed" });
    expect(fake.items).not.toHaveBeenCalled();
  });
});

describe("loadResultsPage after the close", () => {
  it("submits this student's open attempt at close first, then reads the result", async () => {
    const order: string[] = [];
    const set = setOf([MC, MR]);
    const fake = store({ kind: "released", result: result(set, []) }, set, {
      autoSubmit: vi.fn(async () => {
        order.push("autoSubmit");
        return 1;
      }),
      result: vi.fn(async () => {
        order.push("result");
        return { kind: "released", result: result(set, []) } as const;
      }),
      items: vi.fn(async () => {
        order.push("items");
        return set;
      }),
    });
    await loadResultsPage(fake, ASSIGNMENT, STUDENT);
    expect(order).toEqual(["autoSubmit", "result", "items"]);
    expect(fake.autoSubmit).toHaveBeenCalledWith({ assignmentId: ASSIGNMENT, studentId: STUDENT });
    expect(fake.items).toHaveBeenCalledWith([rowId(1), rowId(2)]);
  });

  it("names the assignment's class, so the page can say the close in its zone (#242)", async () => {
    const set = setOf([MC, MR]);
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, []) }, set),
      ASSIGNMENT,
      STUDENT,
    );
    expect(view.kind === "results" && view.assignment).toEqual({
      id: ASSIGNMENT,
      title: "NUR 310 — Week 5",
      closesAt: "2026-09-23T12:00:00Z",
      classId: header.classId,
    });
  });

  it("still shows the results of a student taken off the class, with no class to name", async () => {
    const set = setOf([MC, MR]);
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, []) }, set, {
        assignment: vi.fn(async () => null),
      }),
      ASSIGNMENT,
      STUDENT,
    );
    expect(view.kind).toBe("results");
    expect(view.kind === "results" && view.assignment.classId).toBeNull();
  });

  it("a bank: the best attempt, every key and rationale, and the student's own answers", async () => {
    const set = setOf([MC, MR]);
    const [mc] = set;
    if (!mc) throw new Error("no set");
    const first = attempt(1, [markOf(mc, mcWrong(MC))]);
    const second = attempt(2, [markOf(mc, mcRight(MC))]);
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, [first, second]) }, set),
      ASSIGNMENT,
      STUDENT,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.best).toEqual({ attemptNumber: 2, score: 1, maxScore: 2 });
    expect(view.attemptsMade).toBe(2);
    expect(view.record).toBeNull();
    const [one, two] = view.entries;
    expect(one?.outcome).toMatchObject({ kind: "answered", response: mcRight(MC) });
    expect(one?.outcome.kind === "answered" && one.outcome.score.points).toBe(1);
    expect(two?.outcome).toEqual({ kind: "not_answered" });

    const bytes = JSON.stringify(view);
    for (const item of [MC, MR])
      for (const secret of secretsOf(item)) expect(bytes).toContain(secret);
  });

  it("a tie goes to the earlier attempt", async () => {
    const set = setOf([MC, MR]);
    const [mc] = set;
    if (!mc) throw new Error("no set");
    const first = attempt(1, [markOf(mc, mcRight(MC))]);
    const second = attempt(2, [markOf(mc, mcRight(MC))]);
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, [first, second]) }, set),
      ASSIGNMENT,
      STUDENT,
    );
    expect(view.kind === "results" && view.best?.attemptNumber).toBe(1);
  });

  it("a student who made no attempt sees every item with its key, marked not attempted", async () => {
    const set = setOf([MC, MR]);
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, []) }, set),
      ASSIGNMENT,
      STUDENT,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.best).toBeNull();
    expect(view.attemptsMade).toBe(0);
    expect(view.entries.map((entry) => entry.outcome.kind)).toEqual([
      "not_attempted",
      "not_attempted",
    ]);
    const bytes = JSON.stringify(view);
    for (const secret of secretsOf(MR)) expect(bytes).toContain(secret);
  });

  it("an attempt not yet submitted at close is shown as not marked, with the keys", async () => {
    const set = setOf([MC]);
    const open = attempt(1, [], { submittedAt: null, score: null, maxScore: null, marks: null });
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, [open]) }, set),
      ASSIGNMENT,
      STUDENT,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.best).toBeNull();
    expect(view.entries[0]?.outcome).toEqual({ kind: "unmarked" });
  });

  it("an answer that no longer parses, or a mark that is not whole, is shown as unreadable", async () => {
    const set = setOf([MC, MR]);
    const [mc, mr] = set;
    if (!mc || !mr) throw new Error("no set");
    const garbled: ResultMark = { ...markOf(mc, mcRight(MC)), response: { type: "bowtie" } };
    const unmarked: ResultMark = {
      ...markOf(mr, { type: "multiple_response", optionIds: [] }),
      points: null,
    };
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, [attempt(1, [garbled, unmarked])]) }, set),
      ASSIGNMENT,
      STUDENT,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.entries.map((entry) => entry.outcome.kind)).toEqual(["unreadable", "unreadable"]);
  });

  it("a case study: every step's key and the patient record together", async () => {
    const set = setOf(CASE.items);
    const view = await loadResultsPage(
      store(
        {
          kind: "released",
          result: result(set, [], { patientRecord: JSON.parse(JSON.stringify(CASE.ehr)) }),
        },
        set,
      ),
      ASSIGNMENT,
      STUDENT,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.record?.patientHeader.setting).toBe(CASE.ehr.patientHeader.setting);
    expect(view.entries).toHaveLength(CASE.items.length);
    const bytes = JSON.stringify(view);
    for (const step of CASE.items)
      for (const secret of secretsOf(step)) expect(bytes).toContain(secret);
  });

  it("fails when the items cannot be read", async () => {
    const view = await loadResultsPage(
      store({ kind: "released", result: result(setOf([MC]), []) }, [], {
        items: vi.fn(async () => null),
      }),
      ASSIGNMENT,
      STUDENT,
    );
    expect(view).toEqual({ kind: "failed" });
  });

  it("still loads when the submit at close fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const set = setOf([MC]);
    const view = await loadResultsPage(
      store({ kind: "released", result: result(set, []) }, set, {
        autoSubmit: vi.fn(async () => {
          throw new Error("down");
        }),
      }),
      ASSIGNMENT,
      STUDENT,
    );
    expect(view.kind).toBe("results");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
