import { describe, expect, it } from "vitest";
import { stepIsKeyed, stepsNeedingAttention } from "@/lib/authoring/aiImportCaseStudy";
import { readStoredReasons } from "@/lib/authoring/aiImportReview";
import { toCaseStudyDraft } from "@/lib/ngn/draft";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema } from "@/lib/ngn/schemas";
import { planCommit } from "../commit/plan";
import { draftWithSaved, placeSteps, splitSteps, withStepSaved } from "./caseStudy";

// The fictional sample case study (post-operative pulmonary embolism), as staging holds one.
const whole = caseStudySchema.parse(sampleCaseStudy);
const NEEDS_ANSWER =
  "The source marks no answer. Add the key before this question can be imported.";

/** The case study with the given steps' keys taken out, as an unmarked step is staged. */
function staged(unkeyed: readonly number[]) {
  return {
    ...whole,
    items: whole.items.map((item, index) => {
      if (!unkeyed.includes(index + 1)) return item;
      return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
    }),
  };
}

const answerReasons = (steps: readonly number[]) =>
  steps.map((step) => `needs_answer: Step ${step}: ${NEEDS_ANSWER}`);

describe("withStepSaved (#593, add the key per step)", () => {
  it("completes a case study with one unkeyed step, and the import takes it", () => {
    const item = staged([4]);
    expect(stepIsKeyed(item.items[3])).toBe(false);
    const saved = withStepSaved({ item, reasons: answerReasons([4]) }, 4, whole.items[3]!);
    expect(saved?.status).toBe("ready");
    expect(saved?.reasons.some((reason) => reason.startsWith("needs_answer"))).toBe(false);
    expect(caseStudySchema.safeParse(saved?.item).success).toBe(true);

    // What the import (#348) does with the entry: validated again, and taken.
    const plan = planCommit([
      { id: "e", version: 2, position: 0, kind: "case_study", status: "ready", item: saved!.item },
    ]);
    expect(plan).toMatchObject({ ok: true, questions: 0, caseStudies: 1 });
  });

  it("still needs an answer while another step has no key, and says which", () => {
    const item = staged([2, 4]);
    const saved = withStepSaved({ item, reasons: answerReasons([2, 4]) }, 4, whole.items[3]!);
    expect(saved?.status).toBe("needs_answer");
    expect(saved?.reasons.filter((reason) => reason.startsWith("needs_answer"))).toEqual(
      answerReasons([2]),
    );
  });

  it("keeps the step's own id and place, whatever the form sent, and no record of its own", () => {
    const item = staged([4]);
    const form = {
      ...whole.items[3]!,
      id: "from_the_browser",
      cjmmStep: 1 as const,
      ehr: whole.ehr,
    };
    const saved = withStepSaved({ item, reasons: [] }, 4, form);
    const step = (saved!.item.items as Record<string, unknown>[])[3]!;
    expect(step.id).toBe(whole.items[3]!.id);
    expect(step.cjmmStep).toBe(4);
    expect(step).not.toHaveProperty("ehr");
  });

  it("answers the saved step's flags and leaves the other steps' and the batch's", () => {
    const reasons = [
      ...answerReasons([4]),
      "cut_off: Step 4: The question runs past the end of what was read.",
      "source_error: Step 4: Possible source error: a typo.",
      "cut_off: Step 2: The question runs past the end of what was read.",
      "duplicate: The same question is earlier in this import. Keep one of them.",
    ];
    const saved = withStepSaved({ item: staged([4]), reasons }, 4, whole.items[3]!);
    expect(saved?.reasons).not.toContain(reasons[1]);
    expect(saved?.reasons).toEqual(expect.arrayContaining([reasons[2], reasons[3], reasons[4]]));
    // Step 2 is still flagged, so the case study still needs a fix, and step 2 can be opened.
    expect(saved?.status).toBe("needs_fix");
    expect(
      stepsNeedingAttention({
        item: saved!.item,
        reasons: readStoredReasons(saved!.reasons),
      }),
    ).toEqual([{ step: 2, why: "check" }]);
  });

  it("reads a batch staged before #593, whose reasons name a step by its draft path", () => {
    const old = [
      `needs_answer: steps.3: ${NEEDS_ANSWER}`,
      `needs_answer: steps.1: ${NEEDS_ANSWER}`,
    ];
    const saved = withStepSaved({ item: staged([2, 4]), reasons: old }, 4, whole.items[3]!);
    expect(saved?.reasons.filter((r) => r.startsWith("needs_answer"))).toEqual(answerReasons([2]));
  });

  it("says in words when every step is keyed and the whole still does not pass", () => {
    const noRecord = Object.fromEntries(
      Object.entries(staged([4])).filter(([key]) => key !== "ehr"),
    );
    const saved = withStepSaved({ item: noRecord, reasons: [] }, 4, whole.items[3]!);
    expect(saved?.status).toBe("needs_fix");
    expect(saved?.reasons).toContain("needs_fix: The patient record is not complete yet.");
    expect(saved?.reasons.join(" ")).not.toMatch(/expected|invalid|ehr/i);
  });

  it("is null for an entry that holds no step questions", () => {
    expect(withStepSaved({ item: null, reasons: [] }, 1, whole.items[0]!)).toBeNull();
    expect(withStepSaved({ item: { title: "x" }, reasons: [] }, 1, whole.items[0]!)).toBeNull();
    expect(withStepSaved({ item: staged([]), reasons: [] }, 7, whole.items[0]!)).toBeNull();
  });
});

describe("splitSteps (#593, split into separate questions)", () => {
  const title = "Pulmonary embolism";
  const NOTE = `note: Split from the case study "${title}". The patient record was not attached.`;

  it("makes six questions from the case study's own steps, each with the plain note", () => {
    const steps = splitSteps({
      item: staged([4]),
      draft: null,
      reasons: answerReasons([4]),
      title,
      pdf: false,
    });
    expect(steps?.map((step) => [step.step, step.type, step.status])).toEqual([
      [1, "highlight_text", "ready"],
      [2, "matrix_multiple_response", "ready"],
      [3, "dropdown_rationale", "ready"],
      [4, "multiple_response", "needs_answer"],
      [5, "ordered_response", "ready"],
      [6, "matrix_multiple_choice", "ready"],
    ]);
    for (const step of steps!) expect(step.reasons).toContain(NOTE);
    expect(steps![3]!.reasons).toContain(`needs_answer: ${NEEDS_ANSWER}`);
    // A ready step is a whole question; the unkeyed one keeps its content and has no key.
    expect(itemSchema.safeParse(steps![0]!.item).success).toBe(true);
    expect(steps![3]!.item).not.toHaveProperty("answerKey");
    expect(JSON.stringify(steps)).not.toContain('"ehr"');
  });

  it("keeps a key the teacher added to a step before splitting", () => {
    const keyed = withStepSaved(
      { item: staged([4]), reasons: answerReasons([4]) },
      4,
      whole.items[3]!,
    );
    const steps = splitSteps({ ...keyed!, draft: null, title, pdf: false });
    expect(steps!.every((step) => step.status === "ready")).toBe(true);
  });

  it("carries each step's own flags, without the step in front, and a PDF's check", () => {
    const steps = splitSteps({
      item: staged([]),
      draft: null,
      reasons: [
        "check_key: The key was read from a PDF, which could not be checked against its text. Check it.",
        "cut_off: Step 2: The question runs past the end of what was read.",
        "warning: Step 2: An old warning.",
      ],
      title,
      pdf: true,
    });
    expect(steps![1]!.status).toBe("needs_fix");
    expect(steps![1]!.reasons).toContain(
      "cut_off: The question runs past the end of what was read.",
    );
    expect(steps![1]!.reasons.join(" ")).not.toContain("An old warning");
    expect(steps![0]!.status).toBe("ready");
    expect(steps![0]!.reasons.some((reason) => reason.startsWith("check_key: "))).toBe(true);
  });

  describe("a case study with no item (its patient record could not be built)", () => {
    const draft = toCaseStudyDraft(whole);
    const stored = (over: Record<string, unknown> = {}) => ({
      title: draft.title,
      charts: null,
      steps: draft.steps,
      keys: ["shown", "shown", "formatting", "none", "shown", "shown"],
      unchecked: [false, true, false, false, false, false],
      ...over,
    });

    it("stages each step from the model's draft as a single question is staged", () => {
      const steps = splitSteps({ item: null, draft: stored(), reasons: [], title, pdf: false });
      expect(steps?.map((step) => step.status)).toEqual([
        "ready",
        "ready",
        "ready",
        "needs_fix",
        "ready",
        "ready",
      ]);
      // Extract only (ADR 0008): a key the document does not show is never converted.
      expect(steps![3]!.item).toBeNull();
      expect(steps![3]!.reasons[0]).toMatch(/^unmarked_key: The AI marked an answer/);
      expect(steps![3]!.draft).toEqual(draft.steps[3]);
      expect(steps![1]!.reasons[0]).toMatch(/^check_key: The key was read from a PDF/);
      expect(steps![2]!.reasons[0]).toMatch(/^check_key: The key was read from bold/);
      for (const step of steps!) expect(step.reasons).toContain(NOTE);
    });

    it("treats an older batch's named step, and every keyed step after it, as unshown", () => {
      const steps = splitSteps({
        item: null,
        draft: stored({ keys: undefined, unchecked: undefined }),
        reasons: ["unmarked_key: Step 3: The AI marked an answer this part does not show."],
        title,
        pdf: false,
      });
      expect(steps?.map((step) => step.status)).toEqual([
        "ready",
        "ready",
        "needs_fix",
        "needs_fix",
        "needs_fix",
        "needs_fix",
      ]);
      expect(steps!.slice(2).every((step) => step.item === null)).toBe(true);
    });

    it("asks for a check on every key of an older batch read from a PDF", () => {
      const steps = splitSteps({
        item: null,
        draft: stored({ keys: undefined, unchecked: undefined }),
        reasons: [],
        title,
        pdf: true,
      });
      expect(steps!.every((step) => step.reasons[0]!.startsWith("check_key: "))).toBe(true);
    });

    it("stages an unmarked step as needing an answer, with its content", () => {
      const unmarked = {
        type: "multiple_choice",
        stem: "Which finding matters most?",
        options: [{ text: "Pain" }, { text: "Fever" }, { text: "Rash" }, { text: "Cough" }],
      };
      const steps = splitSteps({
        item: null,
        draft: stored({ steps: [unmarked, ...draft.steps.slice(1)] }),
        reasons: [],
        title,
        pdf: false,
      });
      expect(steps![0]).toMatchObject({ type: "multiple_choice", status: "needs_answer" });
      expect(steps![0]!.item).not.toBeNull();
    });
  });

  it("cannot split a case study whose steps were not kept or cannot be read", () => {
    expect(splitSteps({ item: null, draft: null, reasons: [], title, pdf: false })).toBeNull();
    expect(
      splitSteps({ item: null, draft: { steps: [1, 2, 3] }, reasons: [], title, pdf: false }),
    ).toBeNull();
    expect(
      splitSteps({
        item: null,
        draft: { steps: Array.from({ length: 6 }, () => ({ nonsense: true })) },
        reasons: [],
        title,
        pdf: false,
      }),
    ).toBeNull();
    const odd = { ...staged([]), items: whole.items.map((item) => ({ ...item, type: "essay" })) };
    expect(splitSteps({ item: odd, draft: null, reasons: [], title, pdf: false })).toBeNull();
  });
});

describe("placeSteps", () => {
  it("gives the five places after the case study, which its steps never used", () => {
    expect(placeSteps(2003, new Set([2000, 2001, 2002, 2003, 2009]))).toEqual([
      2004, 2005, 2006, 2007, 2008,
    ]);
  });

  it("steps over a place another question holds", () => {
    expect(placeSteps(4, new Set([4, 6]))).toEqual([5, 7, 8, 9, 10]);
  });

  it("never leaves the file's thousand, and refuses when it has no five places left", () => {
    expect(placeSteps(1996, new Set([1996]))).toBeNull();
    expect(placeSteps(1994, new Set([1994]))).toEqual([1995, 1996, 1997, 1998, 1999]);
  });
});

describe("what a teacher saved is theirs (#593 review)", () => {
  const title = "Pulmonary embolism";

  it("notes each saved step on the draft, once, whatever the draft was", () => {
    expect(draftWithSaved({ title, steps: [] }, 4)).toEqual({ title, steps: [], saved: [4] });
    expect(draftWithSaved({ saved: [4, 2] }, 4)).toEqual({ saved: [2, 4] });
    expect(draftWithSaved({ saved: [4, "x"] }, 1)).toEqual({ saved: [1, 4] });
    expect(draftWithSaved(null, 3)).toEqual({ saved: [3] });
    expect(draftWithSaved(["not", "a", "draft"], 3)).toEqual({ saved: [3] });
  });

  it("does not ask the teacher to check again a key they marked and saved themselves", () => {
    // Read from a PDF, so every key was unchecked; the teacher then keyed and saved step 4.
    const draft = draftWithSaved({ unchecked: Array(6).fill(true) }, 4);
    const steps = splitSteps({
      item: staged([]),
      draft,
      reasons: ["check_key: Step 4: The key was read from bold, underlined or coloured text."],
      title,
      pdf: true,
    });
    const checked = steps!.map((step) => step.reasons.some((r) => r.startsWith("check_key: ")));
    expect(checked).toEqual([true, true, true, false, true, true]);
  });

  it("names a step the whole case study's schema refuses as a step, so it can be opened", () => {
    // Every step is keyed, but step 3 carries another step's place: only the whole says so.
    const item = {
      ...staged([]),
      items: whole.items.map((step, index) => (index === 2 ? { ...step, cjmmStep: 1 } : step)),
    };
    const saved = withStepSaved({ item, reasons: [] }, 4, whole.items[3]!);
    expect(saved?.status).toBe("needs_fix");
    expect(saved?.reasons).toContain("needs_fix: Step 3: This step is not complete yet.");
    expect(
      stepsNeedingAttention({ item: saved!.item, reasons: readStoredReasons(saved!.reasons) }),
    ).toEqual([{ step: 3, why: "check" }]);
    // Opening that step and saving it puts its place right, and the case study is ready.
    const again = withStepSaved(saved!, 3, whole.items[2]!);
    expect(again?.status).toBe("ready");
  });
});
