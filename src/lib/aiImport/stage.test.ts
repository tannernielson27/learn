import { describe, expect, it } from "vitest";
import type { MergedQuestion } from "./merge";
import {
  MAX_REASONS,
  convertDraft,
  formatReason,
  needsRepair,
  readReason,
  stageQuestion,
  type StageInput,
} from "./stage";

const choice = {
  type: "multiple_choice",
  stem: "Which action first?",
  options: [{ text: "Assess *" }, { text: "Document" }, { text: "Call" }, { text: "Wait" }],
  rationale: "Assessment comes first.",
};

function question(fields: Partial<MergedQuestion> = {}): MergedQuestion {
  return {
    chunk: 0,
    index: 0,
    position: 0,
    chunks: [0],
    excerpt: "Which action first?",
    number: "1",
    page: null,
    type: "multiple_choice",
    confidence: 0.9,
    group: null,
    scoringRule: null,
    flags: { instructorNote: false, reliesOnImage: false, notNgn: null, notInSource: false },
    sourceChecked: true,
    cutOff: false,
    continued: false,
    answers: [],
    ...fields,
  };
}

const input = (draft: unknown, fields: Partial<StageInput> = {}): StageInput => ({
  question: question(),
  extracted: { draft, sourceErrors: [] },
  converted: convertDraft(draft),
  source: "text",
  region: "Which action first?\n\nA. Assess *\nB. Document\n",
  ...fields,
});

describe("convertDraft", () => {
  it("converts a keyed draft into a valid item", () => {
    const converted = convertDraft(choice);
    expect(converted).toMatchObject({ ok: true, keyed: true, problems: [] });
    expect(needsRepair(converted)).toBe(false);
  });

  it("lists the paths of a draft that does not parse", () => {
    const converted = convertDraft({ type: "multiple_choice", stem: 1 });
    expect(converted.ok).toBe(false);
    expect(needsRepair(converted)).toBe(true);
    if (!converted.ok) expect(converted.problems.map((p) => p.path[0])).toContain("stem");
  });

  it("lists what itemSchema refuses in a keyed draft", () => {
    const converted = convertDraft({ ...choice, options: [{ text: "Only *" }] });
    expect(converted.ok && converted.problems.length).toBeGreaterThan(0);
  });
});

describe("stageQuestion", () => {
  it("is ready with the quality warnings as reasons", () => {
    const entry = stageQuestion(input({ ...choice, rationale: undefined, stem: "Pick one" }));
    expect(entry.status).toBe("ready");
    expect(entry.type).toBe("multiple_choice");
    expect(entry.reasons.map((r) => r.code)).toEqual(["warning", "warning"]);
  });

  it("keeps the type and flags needs_fix for a question not found in the source", () => {
    const entry = stageQuestion({
      ...input(choice),
      question: question({
        flags: { instructorNote: false, reliesOnImage: true, notNgn: null, notInSource: true },
        cutOff: true,
        confidence: 0.55,
      }),
    });
    expect(entry.status).toBe("needs_fix");
    expect(entry.item).not.toBeNull();
    expect(entry.reasons.map((r) => r.code)).toEqual([
      "not_in_source",
      "relies_on_image",
      "cut_off",
      "low_confidence",
    ]);
    expect(entry.reasons[3].message).toContain("0.55");
  });

  it("believes a key printed elsewhere, and asks for a check when it came from a PDF page", () => {
    const answered = question({
      answers: [
        { chunk: 2, number: "1", caseStudy: null, kind: "answer", text: "A", sourceChecked: false },
      ],
    });
    const entry = stageQuestion({
      ...input(choice),
      question: answered,
      region: "Which action first?",
    });
    expect(entry.status).toBe("ready");
    expect(entry.reasons.map((r) => r.code)).toContain("check_key");
  });

  it("refuses a key in a region that shows none, even with the region missing", () => {
    expect(stageQuestion(input(choice, { region: null })).reasons[0].code).toBe("unmarked_key");
  });

  it("keeps a stated scoring rule the type cannot use as a reason", () => {
    const entry = stageQuestion(input({ ...choice, statedScoring: "Scoring Rule: +/-" }));
    expect(entry.status).toBe("ready");
    expect(entry.reasons.map((r) => r.code)).toContain("scoring_conflict");
  });

  it("stages a question with no draft as needs_fix, typed as segmented", () => {
    const entry = stageQuestion({ ...input(choice), extracted: undefined, converted: undefined });
    expect(entry).toMatchObject({ status: "needs_fix", type: "multiple_choice", draft: null });
  });

  it("gives a not-importable question a default reason", () => {
    const entry = stageQuestion(
      input(null, {
        question: question({
          type: null,
          flags: { instructorNote: false, reliesOnImage: false, notNgn: "", notInSource: false },
        }),
      }),
    );
    expect(entry.reasons).toEqual([
      { code: "not_ngn", message: "This question has no NGN item type." },
    ]);
  });

  it("keeps at most 20 reasons", () => {
    const extracted = {
      draft: choice,
      sourceErrors: Array.from({ length: 30 }, (_, i) => `n${i}`),
    };
    expect(stageQuestion({ ...input(choice), extracted }).reasons).toHaveLength(MAX_REASONS);
  });
});

describe("formatReason and readReason", () => {
  it("round-trip a reason, and refuse text that is not one", () => {
    const reason = { code: "duplicate" as const, message: "Twice: here" };
    expect(readReason(formatReason(reason))).toEqual(reason);
    expect(readReason("no colon")).toBeNull();
    expect(readReason("other: x")).toBeNull();
    expect(formatReason({ code: "warning", message: "x".repeat(600) })).toHaveLength(500);
  });
});
