import { describe, expect, it, vi } from "vitest";
import type { SetItem } from "@/lib/assignments/attemptScoring";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { revealOf, scoreSubmission } from "@/lib/ngn/submit";
import type { LiveAnswer, MyLiveResult, MyLiveResultRead } from "@/lib/supabase/liveResults";
import { loadLiveResultPage, type LiveResultsStore } from "./liveResultPage";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);
const SESSION = "00000000-0000-4000-8000-0000000250a1";
const ITEM_1 = "00000000-0000-4000-8000-000000000001";
const ITEM_2 = "00000000-0000-4000-8000-000000000002";
const ITEM_3 = "00000000-0000-4000-8000-000000000003";

const mcRight = (item: Item): AnyResponse => {
  if (item.type !== "multiple_choice") throw new Error("not MC");
  return { type: "multiple_choice", optionId: item.answerKey.correctOptionId };
};

function answerOf(item: Item, response: AnyResponse, reveal: unknown = revealOf(item)): LiveAnswer {
  const { score } = scoreSubmission(item, response);
  return {
    response,
    points: score.points,
    maxPoints: score.maxPoints,
    model: score.model,
    breakdown: score.breakdown,
    groups: score.groups ?? null,
    reveal,
  };
}

function result(over: Partial<MyLiveResult> = {}): MyLiveResult {
  return {
    sessionId: SESSION,
    title: "Cardiac quiz",
    classId: "c1",
    className: "NUR 310",
    closedAt: "2026-10-27T15:00:00Z",
    patientRecord: null,
    caseStudyRecords: null,
    questions: [
      { position: 1, itemId: ITEM_1, maxPoints: 1, answer: answerOf(MC, mcRight(MC)) },
      { position: 2, itemId: ITEM_2, maxPoints: 3, answer: null },
    ],
    ...over,
  };
}

function fakeStore(read: MyLiveResultRead, items: SetItem[] | null) {
  const store: LiveResultsStore = {
    result: vi.fn(async () => read),
    items: vi.fn(async () => items),
  };
  return store;
}

const SET: SetItem[] = [
  { rowId: ITEM_1, item: MC },
  { rowId: ITEM_2, item: MR },
];

describe("loadLiveResultPage", () => {
  it("is missing, and reads no item, when the database answers nothing", async () => {
    const store = fakeStore({ kind: "missing" }, SET);
    expect(await loadLiveResultPage(store, SESSION)).toEqual({ kind: "missing" });
    expect(store.items).not.toHaveBeenCalled();
  });

  it("is failed, and reads no item, when the read fails", async () => {
    const store = fakeStore({ kind: "failed" }, SET);
    expect(await loadLiveResultPage(store, SESSION)).toEqual({ kind: "failed" });
    expect(store.items).not.toHaveBeenCalled();
  });

  it("is failed when the items do not load", async () => {
    const store = fakeStore({ kind: "found", result: result() }, null);
    expect(await loadLiveResultPage(store, SESSION)).toEqual({ kind: "failed" });
  });

  it("reads only the questions the session reached, after the database has said they are theirs", async () => {
    const store = fakeStore({ kind: "found", result: result() }, SET);
    await loadLiveResultPage(store, SESSION);
    expect(store.result).toHaveBeenCalledWith(SESSION);
    expect(store.items).toHaveBeenCalledWith([ITEM_1, ITEM_2]);
  });

  it("marks each question: their answer with its score, or not answered with the key", async () => {
    const view = await loadLiveResultPage(
      fakeStore({ kind: "found", result: result() }, SET),
      SESSION,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.header).toEqual({
      id: SESSION,
      title: "Cardiac quiz",
      classId: "c1",
      className: "NUR 310",
      closedAt: "2026-10-27T15:00:00Z",
    });
    const [first, second] = view.entries;
    expect(first).toMatchObject({ rowId: "1", position: 1, outcome: { kind: "answered" } });
    if (first?.outcome.kind !== "answered") throw new Error("not answered");
    expect(first.outcome.score.points).toBe(1);
    expect(first.item.rationale).toEqual(MC.rationale);
    expect(second).toMatchObject({ rowId: "2", position: 2, outcome: { kind: "not_answered" } });
    expect(second?.item.answerKey).toEqual(MR.answerKey);
    expect(first?.record).toBeNull();
  });

  it("draws an answer against the key it was scored with, not the item as it is now", async () => {
    if (MC.type !== "multiple_choice") throw new Error("not MC");
    const other = MC.content.options.find((option) => option.id !== MC.answerKey.correctOptionId);
    const scoredWith = { ...revealOf(MC), answerKey: { correctOptionId: other?.id } };
    const view = await loadLiveResultPage(
      fakeStore(
        {
          kind: "found",
          result: result({
            questions: [
              {
                position: 1,
                itemId: ITEM_1,
                maxPoints: 1,
                answer: answerOf(MC, mcRight(MC), scoredWith),
              },
            ],
          }),
        },
        SET,
      ),
      SESSION,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.entries[0]?.item.answerKey).toEqual({ correctOptionId: other?.id });
  });

  it("says an answer that cannot be drawn is unreadable", async () => {
    const view = await loadLiveResultPage(
      fakeStore(
        {
          kind: "found",
          result: result({
            questions: [
              {
                position: 1,
                itemId: ITEM_1,
                maxPoints: 1,
                answer: { ...answerOf(MC, mcRight(MC)), model: "made_up" },
              },
              {
                position: 2,
                itemId: ITEM_2,
                maxPoints: 1,
                answer: { ...answerOf(MC, mcRight(MC)), response: { type: "nonsense" } },
              },
            ],
          }),
        },
        SET,
      ),
      SESSION,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.entries.map((entry) => entry.outcome.kind)).toEqual(["unreadable", "unreadable"]);
  });

  it("leaves out a question whose item no longer exists", async () => {
    const view = await loadLiveResultPage(
      fakeStore(
        {
          kind: "found",
          result: result({
            questions: [
              { position: 1, itemId: ITEM_1, maxPoints: 1, answer: null },
              { position: 2, itemId: ITEM_3, maxPoints: 1, answer: null },
            ],
          }),
        },
        SET,
      ),
      SESSION,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.entries.map((entry) => entry.position)).toEqual([1]);
  });

  it("gives a case-study session's question the record cut to its step, as the phone had it", async () => {
    const view = await loadLiveResultPage(
      fakeStore(
        {
          kind: "found",
          result: result({
            patientRecord: JSON.parse(JSON.stringify(CASE.ehr)),
            questions: [{ position: 2, itemId: ITEM_1, maxPoints: 1, answer: null }],
          }),
        },
        SET,
      ),
      SESSION,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.entries[0]?.record).toEqual(recordAtStep(CASE.ehr, 2));
  });

  it("gives a whole-quiz session's case study step its own record, and a loose question none", async () => {
    const view = await loadLiveResultPage(
      fakeStore(
        {
          kind: "found",
          result: result({
            caseStudyRecords: [
              {
                case_study_id: "cs1",
                title: CASE.title,
                first_position: 2,
                step_count: 6,
                record: JSON.parse(JSON.stringify(CASE.ehr)),
              },
            ],
            questions: [
              { position: 1, itemId: ITEM_1, maxPoints: 1, answer: null },
              { position: 3, itemId: ITEM_2, maxPoints: 1, answer: null },
            ],
          }),
        },
        SET,
      ),
      SESSION,
    );
    if (view.kind !== "results") throw new Error(view.kind);
    expect(view.entries[0]?.record).toBeNull();
    expect(view.entries[1]?.record).toEqual(recordAtStep(CASE.ehr, 2));
  });
});
