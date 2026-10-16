import { describe, expect, it } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { planCommit, type CommitEntryRow } from "./plan";

const question = FIXTURES.multiple_choice.canonical;

const row = (over: Partial<CommitEntryRow> = {}): CommitEntryRow => ({
  id: "00000000-0000-4000-8000-0000000000e1",
  version: 2,
  position: 0,
  kind: "item",
  status: "ready",
  item: question,
  ...over,
});

const caseRow = (over: Partial<CommitEntryRow> = {}): CommitEntryRow =>
  row({
    id: "00000000-0000-4000-8000-0000000000e2",
    version: 1,
    position: 1,
    kind: "case_study",
    item: sampleCaseStudy,
    ...over,
  });

describe("planCommit", () => {
  it("turns every ready entry into the row the database writes, at the version it read", () => {
    const plan = planCommit([row(), caseRow()]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.questions).toBe(1);
    expect(plan.caseStudies).toBe(1);
    const [first, second] = plan.entries;
    expect(first).toMatchObject({ id: row().id, version: 2 });
    expect(first && "item" in first && first.item.type).toBe("multiple_choice");
    // The draft's own id never reaches the database; it gives the question a new one.
    expect(first && "item" in first && "id" in (first.item.content as object)).toBe(false);
    expect(first && "item" in first && first.item.answer_key).toEqual(question.answerKey);
    expect(second && "case_study" in second && second.case_study.items).toHaveLength(6);
    expect(second && "case_study" in second && second.case_study.items[3]?.cjmm_step).toBe(4);
    expect(second && "case_study" in second && second.case_study.title).toBe(sampleCaseStudy.title);
  });

  it("leaves out dropped and not importable entries", () => {
    const plan = planCommit([
      row(),
      row({ id: "x-dropped", status: "dropped", item: { broken: true } }),
      row({ id: "x-not", status: "not_importable", item: null }),
    ]);
    expect(plan.ok && plan.entries.map((entry) => entry.id)).toEqual([row().id]);
  });

  it("keeps the source order", () => {
    const plan = planCommit([caseRow({ position: 5 }), row({ position: 2 })]);
    expect(plan.ok && plan.entries.map((entry) => entry.id)).toEqual([row().id, caseRow().id]);
  });

  it("refuses a kept entry that still needs an answer, before anything is sent", () => {
    expect(planCommit([row(), row({ id: "x", status: "needs_answer" })])).toEqual({
      ok: false,
      code: "not_ready",
    });
  });

  it("refuses a kept entry that needs a fix, or has no item", () => {
    expect(planCommit([row({ status: "needs_fix" })])).toEqual({ ok: false, code: "not_ready" });
    expect(planCommit([row({ item: null })])).toEqual({ ok: false, code: "not_ready" });
  });

  it("refuses an item the schemas do not accept, whatever its status says", () => {
    expect(planCommit([row({ item: { ...question, answerKey: {} } })])).toEqual({
      ok: false,
      code: "invalid_entry",
    });
    expect(planCommit([caseRow({ item: { ...sampleCaseStudy, items: [] } })])).toEqual({
      ok: false,
      code: "invalid_entry",
    });
    expect(planCommit([row({ item: { stem: "x".repeat(300_000) } })])).toEqual({
      ok: false,
      code: "invalid_entry",
    });
  });

  it("refuses a batch with nothing left to import", () => {
    expect(planCommit([])).toEqual({ ok: false, code: "nothing_to_import" });
    expect(planCommit([row({ status: "dropped" })])).toEqual({
      ok: false,
      code: "nothing_to_import",
    });
  });
});
