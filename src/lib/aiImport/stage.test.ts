import { describe, expect, it } from "vitest";
import type { MergedQuestion } from "./merge";
import {
  MAX_REASONS,
  NOT_BUILT,
  caseIssueReasons,
  convertDraft,
  fixReason,
  formatReason,
  needsRepair,
  readReason,
  sourceOf,
  stageCaseStudy,
  stageQuestion,
  stepPrefix,
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
    flags: {
      instructorNote: false,
      reliesOnImage: false,
      notNgn: null,
      notInSource: false,
      ownChart: false,
    },
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
        flags: {
          instructorNote: false,
          reliesOnImage: true,
          notNgn: null,
          notInSource: true,
          ownChart: false,
        },
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
    // #593: no score, which meant nothing to a teacher.
    expect(entry.reasons[3].message).toBe(
      "The AI was not sure of this question's type. Change it if it is wrong.",
    );
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

  // #592, owner decision 2026-11-17: a key marked only by formatting is kept, with a check.
  describe("a key the document marks only with formatting", () => {
    const stem = "Which action first?";
    const checkOf = (region: string) => {
      const entry = stageQuestion(input(choice, { region }));
      return {
        status: entry.status,
        keyed: entry.item !== null,
        checks: entry.reasons.filter((reason) => reason.code === "check_key"),
        codes: entry.reasons.map((reason) => reason.code),
      };
    };

    it.each([
      ["bold", `${stem}\n\n**A. Assess**\nB. Document\nC. Call\nD. Wait\n`],
      ["underline", `${stem}\n\nA. <u>Assess</u>\nB. Document\nC. Call\nD. Wait\n`],
      ["font colour", `${stem}\n\nA. ==Assess=={color #C00000}\nB. Document\nC. Call\nD. Wait\n`],
      [
        "bold in a matrix cell",
        `${stem}\n\n| Action | Indicated | Contraindicated |\n| --- | --- | --- |\n| Assess | **yes** | |\n| Wait | | **yes** |\n`,
      ],
    ])("stages a %s-only key as ready, with the reason to check it", (_, region) => {
      const staged = checkOf(region);
      expect(staged).toMatchObject({ status: "ready", keyed: true });
      expect(staged.checks).toEqual([
        {
          code: "check_key",
          message:
            "The key was read from bold, underlined or coloured text, which may not mark an answer. Check it.",
        },
      ]);
    });

    it.each([
      ["bold in the stem", `**${stem}**\n\nA. Assess\nB. Document\nC. Call\nD. Wait\n`],
      ["a bold heading", `${stem}\n\nA. Assess\nB. Document\n\n## **Unit 2**\n`],
      ["a bold label", `${stem}\n\nA. Assess\nB. Document\n\n**Question 2**\n`],
      ["bold on every option's letter", `${stem}\n\n**A.** Assess\n**B.** Document\n**C.** Call\n`],
      [
        "a table's bold header row",
        `${stem}\n\n| **Action** | **First** |\n| --- | --- |\n| Assess | |\n`,
      ],
      [
        "a grey header row",
        `${stem}\n\n| {shaded #D9D9D9} Action | {shaded #D9D9D9} First |\n| --- | --- |\n| Assess | |\n`,
      ],
    ])("refuses a key when the only formatting is %s", (_, region) => {
      const staged = checkOf(region);
      expect(staged).toMatchObject({ status: "needs_fix", keyed: false });
      expect(staged.codes).toEqual(["unmarked_key"]);
    });

    it("asks for no check when the document also prints a real mark", () => {
      const staged = checkOf(`${stem}\n\n**A. Assess** *\nB. Document\nC. Call\nD. Wait\n`);
      expect(staged).toMatchObject({ status: "ready", checks: [] });
    });

    it("leaves an unkeyed draft needing an answer, formatting or not", () => {
      const unkeyed = {
        ...choice,
        options: choice.options.map((o) => ({ text: o.text.replace(" *", "") })),
      };
      const entry = stageQuestion(
        input(unkeyed, { region: `${stem}\n\n**A. Assess**\nB. Document\nC. Call\nD. Wait\n` }),
      );
      expect(entry.status).toBe("needs_answer");
      expect(entry.reasons.map((reason) => reason.code)).not.toContain("check_key");
    });
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
          flags: {
            instructorNote: false,
            reliesOnImage: false,
            notNgn: "",
            notInSource: false,
            ownChart: false,
          },
        }),
      }),
    );
    expect(entry.reasons).toEqual([
      { code: "not_ngn", message: "This is not a question type LeaRN can import." },
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

describe("the source shown beside a question (#593)", () => {
  it("is the question's whole part of a text document, options and marks included", () => {
    const entry = stageQuestion(input(choice));
    expect(entry.sourceExcerpt).toBe("Which action first?\n\nA. Assess *\nB. Document");
    expect(entry.opening).toBe("Which action first?");
  });

  it("is the opening words for a PDF, and for a question that was not found", () => {
    const pdf = stageQuestion(input(choice, { source: "pdf", region: null }));
    expect(pdf.sourceExcerpt).toBe("Which action first?");
    expect(sourceOf("   ", "Opening")).toBe("Opening");
  });

  it("is cut to what the column holds, and says it was cut", () => {
    const long = sourceOf("x".repeat(30_000), "Opening");
    expect(long.length).toBeLessThanOrEqual(20_000);
    expect(long.endsWith("\n[…]")).toBe(true);
    expect(sourceOf("x".repeat(20_000), "Opening")).toHaveLength(20_000);
  });
});

describe("reasons in plain words (#593)", () => {
  it("names a case study's step from 1, and no other part of a draft's path", () => {
    expect(stepPrefix(["steps", 2, "options", 1])).toBe("Step 3: ");
    expect(stepPrefix(["patient", "age"])).toBe("");
    expect(stepPrefix()).toBe("");
    expect(fixReason({ path: ["steps", 0], message: "The sentence has no blanks." })).toEqual({
      code: "needs_fix",
      message: "Step 1: The sentence has no blanks.",
    });
    expect(fixReason({ path: ["answer"], message: "The key names no option." }).message).toBe(
      "The key names no option.",
    );
  });

  it("never shows a schema's own message for a question that could not be built", () => {
    const entry = stageQuestion(input({ ...choice, options: [{ text: "Only *" }] }));
    expect(entry.status).toBe("needs_fix");
    expect(entry.reasons).toEqual([NOT_BUILT]);
    expect(entry.reasons[0].message).not.toMatch(/expected|invalid|content\./i);
  });

  it("says which step or the patient record a case study's schema refused, each once", () => {
    expect(
      caseIssueReasons([
        { path: ["items", 2, "answerKey"] },
        { path: ["items", 2, "content", "options"] },
        { path: ["ehr", "patientHeader", "age"] },
        { path: ["title"] },
      ]).map((reason) => reason.message),
    ).toEqual([
      "Step 3 is not complete yet.",
      "The patient record is not complete yet.",
      "The case study is not complete yet.",
    ]);
  });

  it("says a case study's patient record could not be read, with no draft path", () => {
    const unmarked = {
      ...choice,
      options: choice.options.map(({ text }) => ({ text: text.replace(" *", "") })),
    };
    const steps = Array.from({ length: 6 }, (_, index) => {
      const draft = index === 2 ? unmarked : choice;
      return {
        question: question({ position: index, excerpt: `Step question ${index + 1}?` }),
        extracted: { draft, sourceErrors: [] },
        converted: convertDraft(draft),
        region: "Which action first?\nA. Assess *\n",
      };
    });
    const [entry] = stageCaseStudy({ title: "A case", steps, charts: undefined, source: "text" });
    expect(entry.kind).toBe("case_study");
    const reasons = entry.reasons.map((reason) => reason.message);
    // The patient record could not be read here, so the case study needs a fix; no reason names
    // a draft path such as "steps.2" or says "chart".
    expect(reasons.join("\n")).not.toMatch(/steps\.\d|chart/i);
    expect(reasons[0]).toBe(
      "The patient record could not be read, so the case study has none yet.",
    );
  });
});
