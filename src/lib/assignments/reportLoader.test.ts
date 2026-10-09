import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportItemInput } from "@/lib/live/report";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import type { AssignmentReportRows, ReportAssignment } from "@/lib/supabase/assignmentReport";
import { scoreAttempt } from "./attemptScoring";
import {
  AUTO_SUBMIT_BATCH,
  loadAssignmentReport,
  type AssignmentReportStore,
} from "./reportLoader";

const ASSIGNMENT: ReportAssignment = {
  id: "00000000-0000-4000-8000-0000000002a1",
  classId: "00000000-0000-4000-8000-0000000002c1",
  title: "Week 5",
  opensAt: "2026-09-21T09:00:00Z",
  closesAt: "2026-09-23T17:00:00Z",
  maxAttempts: 2,
  itemSet: ["00000000-0000-4000-8000-00000000021a"],
};
const ITEMS: ReportItemInput[] = [
  { position: 1, itemId: ASSIGNMENT.itemSet[0]!, ref: "mc", type: "multiple_choice", cjmmStep: 1 },
];
const ROWS: AssignmentReportRows = {
  released: true,
  students: [{ id: "s-ava", displayName: "Ava" }],
  attempts: [
    {
      studentId: "s-ava",
      id: "ava-1",
      number: 1,
      submittedAt: "2026-09-23T10:00:00Z",
      score: 1,
      maxScore: 1,
      marks: [{ itemId: ASSIGNMENT.itemSet[0]!, points: 1, maxPoints: 1 }],
    },
  ],
};

const OPEN = new Date("2026-09-22T12:00:00Z");
const CLOSED = new Date("2026-09-24T12:00:00Z");

function fakeStore(overrides: Partial<AssignmentReportStore> = {}) {
  const order: string[] = [];
  const store: AssignmentReportStore = {
    assignment: vi.fn(async () => {
      order.push("assignment");
      return ASSIGNMENT;
    }),
    autoSubmit: vi.fn(async () => {
      order.push("autoSubmit");
      return 0;
    }),
    items: vi.fn(async () => {
      order.push("items");
      return ITEMS;
    }),
    rows: vi.fn(async () => {
      order.push("rows");
      return ROWS;
    }),
    ...overrides,
  };
  return { store, order };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadAssignmentReport: a class with nobody in it", () => {
  const EMPTY: AssignmentReportRows = { released: false, students: [], attempts: [] };

  it("counts as released once closed, since there is no row to say so", async () => {
    const { store } = fakeStore({ rows: vi.fn(async () => EMPTY) });
    const loaded = await loadAssignmentReport(store, ASSIGNMENT.id, CLOSED);
    expect(loaded?.report.released).toBe(true);
  });

  it("stays unreleased while open", async () => {
    const { store } = fakeStore({ rows: vi.fn(async () => EMPTY) });
    const loaded = await loadAssignmentReport(store, ASSIGNMENT.id, OPEN);
    expect(loaded?.report.released).toBe(false);
  });
});

describe("loadAssignmentReport", () => {
  it("is null for an assignment this author cannot see, and does no other work", async () => {
    const { store } = fakeStore({ assignment: vi.fn(async () => null) });
    expect(await loadAssignmentReport(store, ASSIGNMENT.id, CLOSED)).toBeNull();
    expect(store.autoSubmit).not.toHaveBeenCalled();
    expect(store.rows).not.toHaveBeenCalled();
  });

  it("submits what was left open at close for this assignment before reading the scores", async () => {
    const { store, order } = fakeStore();
    const loaded = await loadAssignmentReport(store, ASSIGNMENT.id, CLOSED);
    expect(store.autoSubmit).toHaveBeenCalledWith(ASSIGNMENT.id);
    expect(order.indexOf("autoSubmit")).toBeLessThan(order.indexOf("rows"));
    expect(loaded?.assignment).toBe(ASSIGNMENT);
    expect(loaded?.report.released).toBe(true);
    expect(loaded?.report.students[0]?.best?.score).toBe(1);
    expect(store.items).toHaveBeenCalledWith(ASSIGNMENT.itemSet);
  });

  it("keeps going while a full batch was submitted, and stops after a few", async () => {
    const autoSubmit = vi
      .fn<AssignmentReportStore["autoSubmit"]>()
      .mockResolvedValue(AUTO_SUBMIT_BATCH);
    const { store } = fakeStore({ autoSubmit });
    await loadAssignmentReport(store, ASSIGNMENT.id, CLOSED);
    expect(autoSubmit).toHaveBeenCalledTimes(3);

    const short = vi
      .fn<AssignmentReportStore["autoSubmit"]>()
      .mockResolvedValueOnce(AUTO_SUBMIT_BATCH)
      .mockResolvedValueOnce(2);
    await loadAssignmentReport(fakeStore({ autoSubmit: short }).store, ASSIGNMENT.id, CLOSED);
    expect(short).toHaveBeenCalledTimes(2);
  });

  it("does not submit anything while the assignment is open", async () => {
    const { store } = fakeStore({
      rows: vi.fn(async () => ({ ...ROWS, released: false })),
    });
    const loaded = await loadAssignmentReport(store, ASSIGNMENT.id, OPEN);
    expect(store.autoSubmit).not.toHaveBeenCalled();
    expect(loaded?.report.released).toBe(false);
    expect(loaded?.report.students[0]?.best).toBeNull();
  });

  it("still shows the report when the submit at close fails, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = fakeStore({
      autoSubmit: vi.fn(async () => {
        throw new Error("service down");
      }),
    });
    const loaded = await loadAssignmentReport(store, ASSIGNMENT.id, CLOSED);
    expect(loaded?.report.students).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
      "[assignment-report] the submit at close failed",
      expect.objectContaining({ assignmentId: ASSIGNMENT.id, message: "service down" }),
    );
  });

  // #327. The report holds no key to disagree with: its item read is the name, type and step only
  // (`readReportItems`), and every figure comes from the points stored with the answer at submit.
  it("marks an answer as it was scored, whatever the item's key has since become", async () => {
    const rowId = ASSIGNMENT.itemSet[0]!;
    const keyA = itemSchema.parse(FIXTURES.multiple_choice.canonical);
    const keyB = itemSchema.parse({ ...keyA, answerKey: { correctOptionId: "opt_c" } });
    const answers = { [rowId]: { type: "multiple_choice", optionId: "opt_a" } };
    const scored = scoreAttempt([{ rowId, item: keyA }], answers);
    // The control: the same answer against today's key earns nothing.
    expect(scored.total).toBe(1);
    expect(scoreAttempt([{ rowId, item: keyB }], answers).total).toBe(0);

    const rows: AssignmentReportRows = {
      ...ROWS,
      attempts: [
        {
          ...ROWS.attempts[0]!,
          score: scored.total,
          maxScore: scored.possible,
          marks: scored.marks.map((mark) => ({
            itemId: mark.item_id,
            points: mark.points,
            maxPoints: mark.max_points,
          })),
        },
      ],
    };
    // The item is key B by the time the report is read; `items` is all the report asks of it.
    const { store } = fakeStore({ rows: vi.fn(async () => rows) });
    const loaded = await loadAssignmentReport(store, ASSIGNMENT.id, CLOSED);

    expect(loaded?.report.students[0]?.scores).toEqual([{ points: 1, maxPoints: 1 }]);
    expect(loaded?.report.students[0]?.best).toMatchObject({ score: 1, maxScore: 1, percent: 100 });
    expect(loaded?.report.items[0]).toMatchObject({ full: 1, none: 0, percentCorrect: 100 });
  });

  it("lets a failed read throw, so half a report is never shown", async () => {
    const { store } = fakeStore({
      rows: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    await expect(loadAssignmentReport(store, ASSIGNMENT.id, OPEN)).rejects.toThrow("down");
  });
});
