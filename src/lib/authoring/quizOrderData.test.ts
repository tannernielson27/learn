import { describe, expect, it, vi } from "vitest";
import { QUIZ_ORDER_ERRORS } from "./quizOrder";
import { listQuizEntries, saveQuizOrder } from "./quizOrderData";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

function fakeClient(result: { data?: unknown; error?: { code?: string; hint?: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

const itemRow = {
  kind: "item",
  id: "i1",
  type: "multiple_choice",
  status: "published",
  title: null,
  stem: { kind: "markdown", value: "Which **finding** needs follow-up?" },
  quiz_position: 1,
};
const caseRow = {
  kind: "case_study",
  id: "c1",
  type: null,
  status: "draft",
  title: "Sepsis",
  stem: null,
  quiz_position: 2,
};

describe("listQuizEntries", () => {
  it("reads the quiz's entries in the order the database gives", async () => {
    const fake = fakeClient({ data: [caseRow, itemRow], error: null });
    const read = await listQuizEntries(fake.client, BANK);
    expect(fake.rpc).toHaveBeenCalledWith("list_quiz_entries", { target_bank: BANK });
    expect(read).toEqual({
      ok: true,
      entries: [
        { kind: "case_study", id: "c1", label: "Sepsis", format: "Case study", status: "Draft" },
        {
          kind: "item",
          id: "i1",
          label: "Which finding needs follow-up?",
          format: "Multiple Choice",
          status: "Published",
        },
      ],
    });
  });

  it("names a question with no text yet, and keeps a format it does not know", async () => {
    const fake = fakeClient({
      data: [{ ...itemRow, stem: null, type: "future_type" }],
      error: null,
    });
    const read = await listQuizEntries(fake.client, BANK);
    expect(read.ok && read.entries[0]).toMatchObject({
      label: "Untitled question",
      format: "future_type",
    });
  });

  it("skips a row it cannot read", async () => {
    const fake = fakeClient({ data: [{ ...itemRow, kind: "folder" }, caseRow], error: null });
    const read = await listQuizEntries(fake.client, BANK);
    expect(read.ok && read.entries.map((entry) => entry.id)).toEqual(["c1"]);
  });

  it("says when the database does not have the order yet", async () => {
    const fake = fakeClient({ data: null, error: { code: "PGRST202" } });
    expect(await listQuizEntries(fake.client, BANK)).toEqual({
      ok: false,
      error: QUIZ_ORDER_ERRORS.notReady,
    });
  });

  it("says when the entries cannot be read", async () => {
    const fake = fakeClient({ data: null, error: { code: "XX000" } });
    expect(await listQuizEntries(fake.client, BANK)).toEqual({
      ok: false,
      error: "The questions and case studies could not be loaded.",
    });
  });
});

describe("saveQuizOrder", () => {
  it("sends the whole order in one call", async () => {
    const fake = fakeClient({ data: null, error: null });
    expect(await saveQuizOrder(fake.client, BANK, ["c1", "i1"])).toEqual({ ok: true });
    expect(fake.rpc).toHaveBeenCalledWith("reorder_quiz", {
      target_bank: BANK,
      entry_ids: ["c1", "i1"],
    });
  });

  it("words a refusal", async () => {
    const fake = fakeClient({ data: null, error: { code: "22023", hint: "stale" } });
    expect(await saveQuizOrder(fake.client, BANK, ["c1"])).toEqual({
      ok: false,
      error: QUIZ_ORDER_ERRORS.changed,
    });
  });
});
