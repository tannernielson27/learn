import { describe, expect, it } from "vitest";
import {
  answerNotes,
  editHref,
  importConfirmation,
  importedSentence,
  REVIEW_FILTERS,
  filterCounts,
  groupByFile,
  importSummary,
  isDuplicate,
  matchesFilter,
  needsAttention,
  parseReviewFilter,
  readStoredReasons,
  reviewHref,
  restoredStatus,
  retypeChoices,
  type ReviewEntryView,
} from "./aiImportReview";

const entry = (over: Partial<ReviewEntryView> = {}): ReviewEntryView => ({
  id: over.id ?? "e1",
  version: 1,
  position: 0,
  kind: "item",
  type: "multiple_choice",
  status: "ready",
  reasons: [],
  sourceExcerpt: "A client reports pain.",
  item: null,
  group: null,
  ...over,
});

describe("readStoredReasons", () => {
  it("splits each stored reason into its code and message", () => {
    expect(
      readStoredReasons(["needs_answer: Add the key.", "duplicate: Same as question 2."]),
    ).toEqual([
      { code: "needs_answer", message: "Add the key." },
      { code: "duplicate", message: "Same as question 2." },
    ]);
  });

  it("keeps text that is not `code: message` as a plain note", () => {
    expect(readStoredReasons(["no separator here"])).toEqual([
      { code: "note", message: "no separator here" },
    ]);
  });
});

describe("filters", () => {
  const entries = [
    entry({ id: "a", status: "ready" }),
    entry({ id: "b", status: "needs_answer" }),
    entry({ id: "c", status: "needs_fix", reasons: [{ code: "unmarked_key", message: "m" }] }),
    entry({ id: "d", status: "not_importable", type: null }),
    entry({ id: "e", status: "ready", reasons: [{ code: "duplicate", message: "m" }] }),
    entry({ id: "f", status: "dropped", reasons: [{ code: "duplicate", message: "m" }] }),
  ];

  it("counts every filter, and a dropped duplicate only as dropped", () => {
    expect(filterCounts(entries)).toEqual({
      all: 6,
      ready: 2,
      needs_answer: 1,
      needs_fix: 1,
      not_importable: 1,
      duplicate: 1,
      dropped: 1,
    });
  });

  it("matches by status, by the duplicate reason, or everything", () => {
    expect(entries.filter((e) => matchesFilter(e, "all"))).toHaveLength(6);
    expect(entries.filter((e) => matchesFilter(e, "needs_fix")).map((e) => e.id)).toEqual(["c"]);
    expect(entries.filter((e) => matchesFilter(e, "duplicate")).map((e) => e.id)).toEqual(["e"]);
    expect(entries.filter((e) => matchesFilter(e, "dropped")).map((e) => e.id)).toEqual(["f"]);
    expect(isDuplicate(entries[4]!)).toBe(true);
    expect(isDuplicate(entries[0]!)).toBe(false);
  });

  it("names every filter in the interface's words", () => {
    expect(REVIEW_FILTERS.map((filter) => filter.label)).toEqual([
      "All",
      "Ready",
      "Needs an answer",
      "Needs a fix",
      "Not importable",
      "Duplicate",
      "Dropped",
    ]);
  });
});

describe("restoredStatus", () => {
  it("is not importable with no NGN type", () => {
    expect(
      restoredStatus({
        kind: "item",
        type: null,
        item: null,
        reasons: [{ code: "not_ngn", message: "Open prompt" }],
      }),
    ).toBe("not_importable");
  });

  it("needs a fix with no item, or with a reason that stops the import", () => {
    expect(restoredStatus({ kind: "item", type: "bowtie", item: null, reasons: [] })).toBe(
      "needs_fix",
    );
    for (const code of [
      "needs_fix",
      "unmarked_key",
      "not_in_source",
      "relies_on_image",
      "cut_off",
    ]) {
      expect(
        restoredStatus({
          kind: "item",
          type: "bowtie",
          item: {},
          reasons: [{ code, message: "" }],
        }),
      ).toBe("needs_fix");
    }
  });

  it("needs an answer when the source marked none, and is ready otherwise", () => {
    expect(
      restoredStatus({
        kind: "item",
        type: "multiple_choice",
        item: {},
        reasons: [{ code: "needs_answer", message: "" }],
      }),
    ).toBe("needs_answer");
    expect(
      restoredStatus({
        kind: "case_study",
        type: null,
        item: {},
        reasons: [
          { code: "warning", message: "" },
          { code: "duplicate", message: "" },
        ],
      }),
    ).toBe("ready");
  });
});

describe("importSummary", () => {
  it("counts the kept questions and case studies and says what blocks the import", () => {
    const summary = importSummary([
      entry({ status: "ready" }),
      entry({ status: "ready", kind: "case_study", type: null }),
      entry({ status: "needs_answer" }),
      entry({ status: "needs_fix" }),
      entry({ status: "needs_fix" }),
      entry({ status: "not_importable" }),
      entry({ status: "dropped" }),
    ]);
    expect(summary).toEqual({
      questions: 4,
      caseStudies: 1,
      label: "Import 4 questions and 1 case study",
      blockers: [
        "1 question needs an answer. Add its key or drop it.",
        "2 questions need a fix. Fix them or drop them.",
      ],
    });
  });

  it("has nothing to block once every kept entry is ready", () => {
    expect(importSummary([entry(), entry({ status: "dropped" })])).toEqual({
      questions: 1,
      caseStudies: 0,
      label: "Import 1 question",
      blockers: [],
    });
  });

  it("says when nothing is left to import", () => {
    const summary = importSummary([
      entry({ status: "dropped" }),
      entry({ status: "not_importable" }),
    ]);
    expect(summary.label).toBe("Import 0 questions");
    expect(summary.blockers).toEqual(["Nothing is left to import. Restore a question first."]);
  });

  it("counts a case study that needs an answer as a blocker", () => {
    const summary = importSummary([
      entry({ kind: "case_study", type: null, status: "needs_answer" }),
    ]);
    expect(summary.label).toBe("Import 1 case study");
    expect(summary.blockers).toEqual(["1 case study needs an answer. Add its key or drop it."]);
  });
});

describe("groupByFile", () => {
  it("groups entries under their file in source order, by `file order * 1000 + place`", () => {
    const groups = groupByFile(
      [
        entry({ id: "b2", position: 1001 }),
        entry({ id: "a1", position: 3 }),
        entry({ id: "b1", position: 1000 }),
      ],
      ["one.md", "two.docx"],
    );
    expect(groups.map((group) => [group.name, group.entries.map((e) => e.id)])).toEqual([
      ["one.md", ["a1"]],
      ["two.docx", ["b1", "b2"]],
    ]);
  });

  it("keeps entries whose file is gone under a group of their own, and drops empty files", () => {
    const groups = groupByFile([entry({ id: "x", position: 5003 })], ["one.md"]);
    expect(groups).toEqual([
      { name: "Another file", entries: [expect.objectContaining({ id: "x" })] },
    ]);
  });
});

describe("retypeChoices", () => {
  it("offers every other NGN type for a question, and none for a case study", () => {
    const choices = retypeChoices(entry({ type: "multiple_choice" }));
    expect(choices).toHaveLength(13);
    expect(choices.some((choice) => choice.value === "multiple_choice")).toBe(false);
    expect(choices[0]).toEqual({ value: "multiple_response", label: "Extended multiple response" });
    expect(retypeChoices(entry({ kind: "case_study", type: null }))).toEqual([]);
    expect(retypeChoices(entry({ status: "not_importable", type: null }))).toHaveLength(14);
  });
});

// #592: what the review page says about answers that reached no question.
describe("answerNotes", () => {
  it("says nothing when every answer reached a question", () => {
    expect(answerNotes({ unmatched: 0, dropped: 0 })).toEqual([]);
  });

  it("gives one plain sentence for each count, singular and plural", () => {
    expect(answerNotes({ unmatched: 3, dropped: 0 })).toEqual([
      "3 answers in the document could not be matched to a question. Check the questions that need an answer.",
    ]);
    expect(answerNotes({ unmatched: 1, dropped: 1 })).toEqual([
      "1 answer in the document could not be matched to a question. Check the questions that need an answer.",
      "1 answer the AI reported was not found in the document, so it was left out.",
    ]);
    expect(answerNotes({ unmatched: 0, dropped: 2 })).toEqual([
      "2 answers the AI reported were not found in the document, so they were left out.",
    ]);
  });
});

describe("importedSentence", () => {
  it("says what went into the quiz", () => {
    expect(importedSentence(3, 1, "Cardiac")).toBe(
      "3 questions and 1 case study were added to Cardiac as drafts.",
    );
    expect(importedSentence(1, 0, "Cardiac")).toBe("1 question was added to Cardiac as a draft.");
    expect(importedSentence(0, 2, "Renal")).toBe("2 case studies were added to Renal as drafts.");
  });
});

describe("the review's place in the address (#593)", () => {
  const base = "/author/banks/b/ai-import/batch";

  it("reads the filter from the address, and falls back to all", () => {
    expect(parseReviewFilter("needs_fix")).toBe("needs_fix");
    expect(parseReviewFilter("duplicate")).toBe("duplicate");
    for (const other of [undefined, "", "nonsense", ["needs_fix"], 3]) {
      expect(parseReviewFilter(other)).toBe("all");
    }
  });

  it("writes the filter and the card to return to", () => {
    expect(reviewHref(base, "all")).toBe(base);
    expect(reviewHref(base, "needs_answer")).toBe(`${base}?show=needs_answer`);
    expect(reviewHref(base, "needs_fix", "e9")).toBe(`${base}?show=needs_fix#entry-e9`);
    expect(reviewHref(base, "all", "e9")).toBe(`${base}#entry-e9`);
  });

  it("carries the filter, and a case study's step, to an entry's editor", () => {
    expect(editHref(base, "e9", "all")).toBe(`${base}/e9`);
    expect(editHref(base, "e9", "needs_answer")).toBe(`${base}/e9?show=needs_answer`);
    expect(editHref(base, "e9", "all", 4)).toBe(`${base}/e9?step=4`);
    expect(editHref(base, "e9", "needs_fix", 4)).toBe(`${base}/e9?step=4&show=needs_fix`);
  });
});

describe("needsAttention", () => {
  it("is what blocks the import: an answer or a fix still needed", () => {
    expect(
      (["ready", "needs_answer", "needs_fix", "not_importable", "dropped"] as const).map((status) =>
        needsAttention({ status }),
      ),
    ).toEqual([false, true, true, false, false]);
  });
});

describe("importConfirmation (#593)", () => {
  it("says what goes into which quiz, what is left out, and that the files are deleted", () => {
    expect(
      importConfirmation(
        [
          entry({ id: "a" }),
          entry({ id: "b" }),
          entry({ id: "c", kind: "case_study", type: null }),
          entry({ id: "d", status: "dropped" }),
          entry({ id: "e", status: "dropped" }),
          entry({ id: "f", status: "not_importable", type: null }),
        ],
        "Cardiac",
      ),
    ).toEqual([
      "2 questions and 1 case study will be added to Cardiac as drafts.",
      "Left out: 2 dropped and 1 not importable.",
      "The uploaded files are then deleted.",
    ]);
  });

  it("says nothing about what was left out when nothing was", () => {
    expect(importConfirmation([entry()], "Cardiac")).toEqual([
      "1 question will be added to Cardiac as a draft.",
      "The uploaded files are then deleted.",
    ]);
  });
});
