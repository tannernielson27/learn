import { describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { stagedCaseStudy, stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { caseStudySchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import type { AttemptSummary, StudentAssignment } from "@/lib/supabase/attempts";
import { loadAttemptPage, type AttemptPageStore } from "./attemptPage";
import type { SetItem } from "./attemptScoring";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);
const STUDENT = "00000000-0000-4000-8000-0000000208d1";
const ASSIGNMENT = "00000000-0000-4000-8000-0000000208b1";
const ATTEMPT = "00000000-0000-4000-8000-0000000208a1";
const NOW = new Date("2026-09-23T12:00:00Z");

const rowId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const setOf = (items: readonly Item[]): SetItem[] =>
  items.map((item, index) => ({ rowId: rowId(index + 1), item }));

function assignment(over: Partial<StudentAssignment> = {}): StudentAssignment {
  return {
    id: ASSIGNMENT,
    classId: "00000000-0000-4000-8000-0000000208c1",
    title: "NUR 310 — Week 5",
    opensAt: "2026-09-22T12:00:00Z",
    closesAt: "2026-09-24T12:00:00Z",
    maxAttempts: 2,
    shuffleOptions: true,
    itemSet: [rowId(1), rowId(2)],
    ...over,
  };
}

const openAttempt: AttemptSummary = {
  id: ATTEMPT,
  number: 1,
  startedAt: "2026-09-23T11:00:00Z",
  submittedAt: null,
  autoSubmitted: false,
};

function store(over: Partial<AttemptPageStore> = {}, set: SetItem[] = setOf([MC, MR])) {
  return {
    assignment: vi.fn(async () => assignment()),
    attempts: vi.fn(async () => [openAttempt]),
    answers: vi.fn(async () => ({ [rowId(1)]: { type: "multiple_choice", optionId: "opt_b" } })),
    items: vi.fn(async () => set),
    record: vi.fn(async (): Promise<{ ok: true; record: unknown } | { ok: false }> => ({
      ok: true,
      record: null,
    })),
    autoSubmit: vi.fn(async () => 0),
    ...over,
  } satisfies AttemptPageStore;
}

/** The strings only a key, a rationale or a scoring rule would put on the page. */
function secretsOf(item: Item): string[] {
  const secrets = [JSON.stringify(item.answerKey)];
  if (item.rationale.general) secrets.push(item.rationale.general.value);
  for (const text of Object.values(item.rationale.perElement ?? {})) secrets.push(text.value);
  return secrets;
}

describe("loadAttemptPage, on what the student's page is handed before close", () => {
  it("a bank: every item, the student's own answer, and no key, rationale or score", async () => {
    const fake = store();
    // The control: what the store hands the server carries every secret.
    const held = JSON.stringify(await fake.items([]));
    for (const item of [MC, MR])
      for (const secret of secretsOf(item)) expect(held).toContain(secret);

    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    expect(view.kind).toBe("taking");
    const bytes = JSON.stringify(view);
    expect(bytes).toContain(MC.id);
    expect(bytes).toContain(MR.id);
    expect(bytes).toContain('"optionId":"opt_b"');
    for (const item of [MC, MR])
      for (const secret of secretsOf(item)) expect(bytes).not.toContain(secret);
    for (const field of ['"answerKey"', '"rationale"', '"scoring"', '"score"', '"points"']) {
      expect(bytes).not.toContain(field);
    }
    expect(fake.autoSubmit).not.toHaveBeenCalled();
  });

  /** A case study assignment holding `record`, with the first `answered` steps saved. */
  function caseStore(record: unknown, answered = 0) {
    const study = caseStudySchema.parse(stagedCaseStudy);
    return store(
      {
        assignment: vi.fn(async () =>
          assignment({
            itemSet: study.items.map((_, index) => rowId(index + 1)),
            shuffleOptions: false,
          }),
        ),
        answers: vi.fn(async () =>
          Object.fromEntries(
            study.items.slice(0, answered).map((step, index) => [rowId(index + 1), savedFor(step)]),
          ),
        ),
        record: vi.fn(async () => ({ ok: true as const, record })),
      },
      setOf(study.items),
    );
  }

  it("a case study: the reached steps and each one's chart, and no step's key", async () => {
    const fake = caseStore(JSON.parse(JSON.stringify(CASE.ehr)), 1);
    const held = JSON.stringify(await fake.items([]));
    expect(held).toContain('"answerKey"');

    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    if (view.kind !== "taking") throw new Error(`expected taking, got ${view.kind}`);
    expect(fake.record).toHaveBeenCalledWith(ASSIGNMENT);
    // Step 1 saved, so step 2 is reached: two steps, two charts, and six in all.
    expect(view.items).toHaveLength(2);
    expect(view.total).toBe(6);
    expect(view.records).toEqual([CASE.ehr, CASE.ehr]);
    const bytes = JSON.stringify(view);
    expect(bytes).not.toContain('"answerKey"');
    expect(bytes).not.toContain('"rationale"');
  });

  describe("a chart that grows with the case (#335)", () => {
    const NOTE_0200 = "0200: Second large-bore IV";
    const LABS = "Serum hCG";
    const pageAfter = async (answered: number) =>
      JSON.stringify(
        await loadAttemptPage(caseStore(stagedEhr, answered), ASSIGNMENT, STUDENT, NOW),
      );

    it("sends step 1's chart and nothing a later step reveals", async () => {
      const bytes = await pageAfter(0);
      expect(bytes).toContain("0115: Pain now 8/10");
      for (const later of [
        NOTE_0200,
        "0130: Pale",
        LABS,
        "Lab Results",
        "fromStep",
        "stepAccess",
      ]) {
        expect(bytes).not.toContain(later);
      }
      // Nor the steps not yet reached.
      const study = caseStudySchema.parse(stagedCaseStudy);
      for (const step of study.items.slice(1)) expect(bytes).not.toContain(`"id":"${step.id}"`);
    });

    it("names a tab locked at a reached step and sends none of its text", async () => {
      const bytes = await pageAfter(1);
      expect(bytes).toContain('"title":"Lab Results","locked":true');
      expect(bytes).not.toContain(LABS);
    });

    it("sends each part at the step that reveals it: the controls", async () => {
      expect(await pageAfter(2)).toContain(LABS);
      expect(await pageAfter(2)).not.toContain(NOTE_0200);
      expect(await pageAfter(3)).toContain(NOTE_0200);
    });
  });

  it("a record that does not parse is left off rather than breaking the page", async () => {
    const fake = store({
      record: vi.fn(async () => ({ ok: true as const, record: { nonsense: 1 } })),
    });
    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    expect(view.kind === "taking" && view.records).toBeNull();
  });

  it("a record that could not be read fails the page rather than showing it without one", async () => {
    const fake = store({ record: vi.fn(async () => ({ ok: false as const })) });
    expect((await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW)).kind).toBe("failed");
  });
});

/** An answer of the step's own type, so it reads back as saved. */
function savedFor(step: Item): unknown {
  return FIXTURES[step.type].cases[0]?.response;
}

describe("loadAttemptPage, the header", () => {
  it("names the assignment's class, so the page can say the close in its zone (#242)", async () => {
    const view = await loadAttemptPage(store(), ASSIGNMENT, STUDENT, NOW);
    if (view.kind === "missing" || view.kind === "failed") throw new Error(view.kind);
    expect(view.assignment).toEqual({
      id: ASSIGNMENT,
      classId: "00000000-0000-4000-8000-0000000208c1",
      title: "NUR 310 — Week 5",
      closesAt: "2026-09-24T12:00:00Z",
      maxAttempts: 2,
    });
  });
});

describe("loadAttemptPage, the other states", () => {
  it("is missing when the student may not see the assignment", async () => {
    const fake = store({ assignment: vi.fn(async () => null) });
    expect(await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW)).toEqual({ kind: "missing" });
  });

  it("fails when the attempts, the items or the answers cannot be read", async () => {
    expect(
      (
        await loadAttemptPage(
          store({ attempts: vi.fn(async () => null) }),
          ASSIGNMENT,
          STUDENT,
          NOW,
        )
      ).kind,
    ).toBe("failed");
    expect(
      (await loadAttemptPage(store({ items: vi.fn(async () => null) }), ASSIGNMENT, STUDENT, NOW))
        .kind,
    ).toBe("failed");
    expect(
      (await loadAttemptPage(store({ answers: vi.fn(async () => null) }), ASSIGNMENT, STUDENT, NOW))
        .kind,
    ).toBe("failed");
  });

  it("offers a start with no attempt yet, and another after a submitted one while any are left", async () => {
    const none = await loadAttemptPage(
      store({ attempts: vi.fn(async () => []) }),
      ASSIGNMENT,
      STUDENT,
      NOW,
    );
    expect(none).toMatchObject({ kind: "summary", canStart: true, closed: false });

    const submitted = { ...openAttempt, submittedAt: "2026-09-23T11:30:00Z" };
    const one = await loadAttemptPage(
      store({ attempts: vi.fn(async () => [submitted]) }),
      ASSIGNMENT,
      STUDENT,
      NOW,
    );
    expect(one).toMatchObject({ kind: "summary", canStart: true });

    const both = await loadAttemptPage(
      store({
        attempts: vi.fn(async () => [submitted, { ...submitted, id: rowId(9), number: 2 }]),
      }),
      ASSIGNMENT,
      STUDENT,
      NOW,
    );
    expect(both).toMatchObject({ kind: "summary", canStart: false });
    // A summary carries attempts without scores: there are none to carry.
    expect(JSON.stringify(both)).not.toContain('"score"');
  });

  it("submits an open attempt at close for this student first, then reads the attempts", async () => {
    const order: string[] = [];
    const fake = store({
      assignment: vi.fn(async () => assignment({ closesAt: "2026-09-23T11:59:57Z" })),
      autoSubmit: vi.fn(async () => {
        order.push("autoSubmit");
        return 1;
      }),
      attempts: vi.fn(async () => {
        order.push("attempts");
        return [{ ...openAttempt, submittedAt: "2026-09-23T11:59:57Z", autoSubmitted: true }];
      }),
    });
    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    expect(order).toEqual(["autoSubmit", "attempts"]);
    expect(fake.autoSubmit).toHaveBeenCalledWith({ assignmentId: ASSIGNMENT, studentId: STUDENT });
    expect(view).toMatchObject({ kind: "summary", closed: true, canStart: false });
    expect(fake.items).not.toHaveBeenCalled();
  });

  it("keeps taking within the two seconds of grace", async () => {
    const fake = store({
      assignment: vi.fn(async () => assignment({ closesAt: "2026-09-23T11:59:59Z" })),
    });
    expect((await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW)).kind).toBe("taking");
    expect(fake.autoSubmit).not.toHaveBeenCalled();
  });

  it("never hands out an open attempt's items once closed, even if the submit at close failed", async () => {
    const fake = store({
      assignment: vi.fn(async () => assignment({ closesAt: "2026-09-22T12:00:00Z" })),
    });
    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    expect(view).toMatchObject({ kind: "summary", closed: true, canStart: false });
    expect(fake.items).not.toHaveBeenCalled();
  });
});
