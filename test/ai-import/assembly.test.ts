import { describe, expect, it } from "vitest";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import {
  assembleImport,
  itemDraftSchema,
  type AssembledCaseStudy,
  type AssembledItem,
  type ImportPart,
} from "@/lib/ngn/draft";
import { caseStudySchema, itemSchema, type CaseStudy } from "@/lib/ngn/schemas";
import { loadRecordings, NOT_IMPORTABLE, type Recording } from "./files";

/**
 * #344's acceptance tests, on the recorded corpus: the drafts a faithful model returns for the
 * fictional documents shaped like the owner's Maryland samples, put through the assembly #343
 * will call. Nothing here calls the API.
 */

const recordings = loadRecordings();

/** A recording as the parts #343 hands the assembly: case study groups, then the questions. */
function partsOf(recording: Recording): ImportPart[] {
  const groups = recording.caseStudies.map(({ draft }) => {
    const { title, steps, ...charts } = draft as { title: string; steps: unknown[] };
    return {
      kind: "case_study" as const,
      title,
      charts: { title, ...charts },
      steps: steps.map((step) => itemDraftSchema.parse(step)),
    };
  });
  const questions = recording.questions
    .filter((question) => question.type !== NOT_IMPORTABLE)
    .map((question) => ({
      kind: "question" as const,
      draft: itemDraftSchema.parse(question.draft),
      ...(question.chart !== undefined ? { chart: question.chart } : {}),
    }));
  return [...groups, ...questions];
}

function assemble(document: string) {
  const recording = recordings.get(document);
  if (!recording) throw new Error(`no recording for ${document}`);
  return assembleImport(partsOf(recording), { idPrefix: "corpus" }).entries;
}

const caseStudies = (entries: ReturnType<typeof assemble>) =>
  entries.filter((entry): entry is AssembledCaseStudy => entry.kind === "case_study");
const items = (entries: ReturnType<typeof assemble>) =>
  entries.filter((entry): entry is AssembledItem => entry.kind === "item");

describe("06: a case study of six and a standalone bowtie", () => {
  const entries = assemble("06-case-study-and-bowtie.md");

  it("gives one case study and one bowtie", () => {
    expect(entries.map((entry) => entry.kind)).toEqual(["case_study", "item"]);
    const [caseStudy] = caseStudies(entries);
    expect(caseStudy.reasons).toEqual([]);
    expect(caseStudySchema.safeParse(caseStudy.caseStudy).success).toBe(true);
    const [bowtie] = items(entries);
    expect(bowtie.item.type).toBe("bowtie");
    expect(itemSchema.safeParse(bowtie.item).success).toBe(true);
  });

  it("hides the step 3 labs at step 1, showing only the tab's name", () => {
    const ehr = (caseStudySchema.parse(caseStudies(entries)[0].caseStudy) as CaseStudy).ehr;
    const atStep = (step: 1 | 2 | 3) => recordAtStep(ehr, step);
    const labs = (step: 1 | 2 | 3) => atStep(step).tabs.find((tab) => tab.title === "Lab Results");
    expect(labs(1)).toMatchObject({ locked: true });
    expect(JSON.stringify(atStep(1))).not.toContain("Lactate");
    expect(JSON.stringify(atStep(2))).not.toContain("Lactate");
    expect(JSON.stringify(atStep(3))).toContain("Lactate");
  });

  it("takes each step's stage from its position", () => {
    const steps = caseStudies(entries)[0].caseStudy.items as { id: string; cjmmStep: number }[];
    expect(steps.map((item) => item.cjmmStep)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.map((item) => item.id)).toEqual(
      [1, 2, 3, 4, 5, 6].map((step) => `corpus_1_step_${step}`),
    );
  });
});

describe("07: a night-shift case study, a standalone trend and a short activity", () => {
  const entries = assemble("07-night-shift-case-and-trend.md");

  it("gives one case study, the activity's three questions on their own, and the trend", () => {
    expect(entries.map((entry) => entry.kind)).toEqual([
      "case_study",
      "item",
      "item",
      "item",
      "item",
    ]);
    const [activity1, activity2, activity3] = items(entries);
    for (const entry of [activity1, activity2, activity3]) {
      expect(entry.groupKey).toBe("Activity: Two Clients With Poor Intake");
      expect(entry.notes.map((note) => note.code)).toEqual([
        "not_a_case_study",
        "chart_not_attached",
      ]);
      expect(entry.item).not.toHaveProperty("cjmmStep");
    }
  });

  it("keeps the source's mistyped time (2015 for 0200) and flags it, without fixing it", () => {
    const [caseStudy] = caseStudies(entries);
    expect(caseStudy.caseStudy.ehr.timePoints.map((point) => point.label)).toEqual([
      "2200",
      "2300",
      "2015",
      "0400",
    ]);
    expect(caseStudy.reasons).toEqual([]);
    expect(caseStudy.notes).toEqual([
      expect.objectContaining({
        code: "possible_source_error",
        path: ["ehr", "timePoints", 2],
        message: expect.stringContaining('"2015"'),
      }),
    ]);
  });

  it("gives the trend its own record with three time points, not the case study's", () => {
    const trend = items(entries).at(-1)!;
    const item = itemSchema.parse(trend.item);
    expect(item.ehr?.timePoints.map((point) => point.label)).toEqual(["0800", "1200", "1600"]);
    expect(JSON.stringify(item.ehr)).not.toContain("Rosa Delacroix");
    expect(trend.notes).toEqual([]);
  });
});
