import { describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
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
    patientRecord: null,
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

  it("a case study: six steps and the patient record, and no step's key", async () => {
    const fake = store(
      {
        assignment: vi.fn(async () =>
          assignment({
            itemSet: CASE.items.map((_, index) => rowId(index + 1)),
            patientRecord: JSON.parse(JSON.stringify(CASE.ehr)),
            shuffleOptions: false,
          }),
        ),
        answers: vi.fn(async () => ({})),
      },
      setOf(CASE.items),
    );
    const held = JSON.stringify(await fake.items([]));
    expect(held).toContain('"answerKey"');

    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    if (view.kind !== "taking") throw new Error(`expected taking, got ${view.kind}`);
    expect(view.record?.patientHeader.setting).toBe(CASE.ehr.patientHeader.setting);
    expect(view.items).toHaveLength(6);
    const bytes = JSON.stringify(view);
    for (const step of CASE.items) {
      expect(bytes).toContain(step.id);
      for (const secret of secretsOf(step)) expect(bytes).not.toContain(secret);
    }
    expect(bytes).not.toContain('"answerKey"');
    expect(bytes).not.toContain('"rationale"');
  });

  it("a record that does not parse is left off rather than breaking the page", async () => {
    const fake = store({
      assignment: vi.fn(async () => assignment({ patientRecord: { nonsense: true } })),
    });
    const view = await loadAttemptPage(fake, ASSIGNMENT, STUDENT, NOW);
    expect(view.kind === "taking" && view.record).toBeNull();
  });
});

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
