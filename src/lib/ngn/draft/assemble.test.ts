import { describe, expect, it } from "vitest";
import { recordAtStep } from "../chartReveal";
import { caseStudySchema, itemSchema, standaloneEhrRecordSchema } from "../schemas";
import {
  assembleCaseStudy,
  assembleImport,
  assembleQuestion,
  DEFAULT_TIME_LABEL,
  standaloneChartJsonSchema,
  standaloneRecordFrom,
  timeOrderNotes,
  type CaseStudyChartsDraft,
  type ChartDraft,
  type ChartTabDraft,
  type ItemDraft,
  type StandaloneChartDraft,
} from ".";

/*
 * #344: case study assembly. Every chart and question here is fictional, shaped like the owner's
 * Maryland samples (a six-step case whose chart repeats and grows, then a standalone item).
 */

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const mc = (stem: string, marked = 0): ItemDraft => ({
  type: "multiple_choice",
  stem,
  options: ["Option one", "Option two", "Option three", "Option four"].map((text, index) => ({
    text: index === marked ? `${text} *` : text,
  })),
});

const steps = (count: number): ItemDraft[] =>
  Array.from({ length: count }, (_, index) => mc(`Fictional step ${index + 1} question?`));

const NOTES = [
  "2200: Resting.",
  "2300: Drowsy.",
  "2015: Pale, dressing damp.",
  "0400: Dressing dry.",
];
const TIMES = ["2200", "2300", "2015", "0400"];

/** The chart as a step prints it: notes and vitals up to the `times`th time, labs when given. */
function chart(times: number, labs?: ChartTabDraft): ChartDraft {
  return {
    tabs: [
      {
        title: "Nurses' Notes",
        sections: [{ kind: "text", text: NOTES.slice(0, times).join("\n\n") }],
      },
      {
        title: "Vital Signs",
        sections: [
          {
            kind: "table",
            columns: ["", ...TIMES.slice(0, times)],
            rows: [["Heart rate", "88", "96", "118", "102"].slice(0, times + 1)],
          },
        ],
      },
      ...(labs ? [labs] : []),
    ],
  };
}

const emptyLabs: ChartTabDraft = { title: "Lab Results", sections: [] };
const labs: ChartTabDraft = {
  title: "Lab Results",
  sections: [
    { kind: "values", rows: [{ label: "Hemoglobin", value: "8.1", unit: "g/dL", flag: "L" }] },
  ],
};

const charts: CaseStudyChartsDraft = {
  title: "Unfolding Case Study: Bleeding After Surgery",
  patient: { name: "Ada Quill", age: "64", sex: "F", setting: "Surgical unit" },
  charts: [
    chart(1, emptyLabs),
    chart(2, emptyLabs),
    chart(3, labs),
    chart(3, labs),
    chart(4, labs),
    chart(4, labs),
  ],
};

const group = (count = 6, chartsOutput: unknown = charts) => ({
  title: "Unfolding Case Study: Bleeding After Surgery",
  charts: chartsOutput,
  steps: steps(count),
});

describe("assembleCaseStudy", () => {
  it("turns a group of six into one case study whose steps take their stage from position", () => {
    const entries = assembleCaseStudy(group(), { id: "imp_1", tags: ["ai-import"] });
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.kind).toBe("case_study");
    if (entry.kind !== "case_study") return;
    expect(entry.reasons).toEqual([]);
    const parsed = caseStudySchema.parse(entry.caseStudy);
    expect(parsed.id).toBe("imp_1");
    expect(parsed.tags).toEqual(["ai-import"]);
    expect(parsed.items.map((item) => [item.id, item.cjmmStep])).toEqual(
      [1, 2, 3, 4, 5, 6].map((step) => [`imp_1_step_${step}`, step]),
    );
    expect(entry.groupKey).toBe("Unfolding Case Study: Bleeding After Surgery");
  });

  it("hides the step 3 labs at step 1 and shows them at step 3", () => {
    const [entry] = assembleCaseStudy(group(), { id: "imp_1" });
    if (entry.kind !== "case_study") throw new Error("expected a case study");
    const ehr = caseStudySchema.parse(entry.caseStudy).ehr;
    const at = (step: Step) => JSON.stringify(recordAtStep(ehr, step));
    expect(at(1)).not.toContain("Hemoglobin");
    expect(at(1)).toContain("Lab Results");
    expect(at(3)).toContain("Hemoglobin");
    expect(at(1)).not.toContain("0400");
    expect(at(5)).toContain("0400");
  });

  it("keeps a time the source mistyped and flags it, without fixing it", () => {
    const [entry] = assembleCaseStudy(group(), { id: "imp_1" });
    if (entry.kind !== "case_study") throw new Error("expected a case study");
    expect(entry.caseStudy.ehr.timePoints.map((point) => point.label)).toEqual(TIMES);
    expect(entry.notes).toEqual([
      expect.objectContaining({
        code: "possible_source_error",
        path: ["ehr", "timePoints", 2],
        message: expect.stringContaining('"2015"'),
      }),
    ]);
    expect(JSON.stringify(entry.caseStudy)).not.toContain("0200");
  });

  it("uses the group's title when the chart call names none", () => {
    const [entry] = assembleCaseStudy(group(6, { ...charts, title: "  " }), { id: "imp_1" });
    if (entry.kind !== "case_study") throw new Error("expected a case study");
    expect(entry.caseStudy.title).toBe("Unfolding Case Study: Bleeding After Surgery");
  });

  it("keeps a case study whose chart call failed, flagged for the teacher", () => {
    const [entry] = assembleCaseStudy(group(6, { title: 7 }), { id: "imp_1" });
    expect(entry.kind).toBe("case_study");
    if (entry.kind !== "case_study") return;
    expect(entry.caseStudy.items).toHaveLength(6);
    expect(entry.reasons[0]).toMatchObject({ code: "needs_fix", path: ["charts"] });
    expect(entry.reasons.every((reason) => reason.code === "needs_fix")).toBe(true);
    expect(caseStudySchema.safeParse(entry.caseStudy).success).toBe(false);
  });

  it.each([5, 3, 7])("stages a group of %i as standalone questions, each with a note", (count) => {
    const entries = assembleCaseStudy(group(count), { id: "imp_2" });
    expect(entries).toHaveLength(count);
    entries.forEach((entry, index) => {
      expect(entry.kind).toBe("item");
      if (entry.kind !== "item") return;
      expect(entry.item.id).toBe(`imp_2_q_${index + 1}`);
      expect(entry.item).not.toHaveProperty("cjmmStep");
      expect(entry.item).not.toHaveProperty("ehr");
      expect(entry.groupKey).toBe("Unfolding Case Study: Bleeding After Surgery");
      expect(entry.step).toBe(index < 6 ? index + 1 : undefined);
      expect(entry.notes.map((note) => note.code)).toEqual([
        "not_a_case_study",
        "chart_not_attached",
      ]);
      expect(entry.notes[0].message).toContain(`${count} questions`);
      expect(itemSchema.safeParse(entry.item).success).toBe(true);
    });
  });

  it("says nothing about a chart when a short group has none", () => {
    const entries = assembleCaseStudy(group(2, { title: "Activity", patient: {}, charts: [] }), {
      id: "imp_3",
    });
    expect(entries.flatMap((entry) => entry.notes.map((note) => note.code))).toEqual([
      "not_a_case_study",
      "not_a_case_study",
    ]);
  });

  it("keys a group with no usable title by its id, and cuts a long one to 80 characters", () => {
    const untitled = assembleCaseStudy({ ...group(2), title: " " }, { id: "imp_4" });
    expect(untitled[0].groupKey).toBe("imp_4");
    const long = assembleCaseStudy({ ...group(2), title: "x".repeat(200) }, { id: "imp_5" });
    expect(long[0].groupKey).toHaveLength(80);
  });

  it("carries a step's own reasons onto its split question", () => {
    const unmarked: ItemDraft = {
      type: "multiple_choice",
      stem: "No key?",
      options: [{ text: "A" }, { text: "B" }],
    };
    const [entry] = assembleCaseStudy({ ...group(1), steps: [unmarked] }, { id: "imp_6" });
    expect(entry.reasons.map((reason) => reason.code)).toEqual(["needs_answer"]);
  });
});

const trendChart: StandaloneChartDraft = {
  patient: { age: "71", sex: "male", setting: "Medical unit" },
  chart: {
    tabs: [
      {
        title: "Vital Signs",
        sections: [
          {
            kind: "table",
            columns: ["", "0800", "1200", "1600"],
            rows: [["Heart rate", "92", "104", "121"]],
          },
        ],
      },
      { title: "Orders", sections: [] },
    ],
  },
};

describe("standaloneRecordFrom", () => {
  it("gives a trend its own record, with a time point for each time its flow sheet shows", () => {
    const { record, reasons, notes } = standaloneRecordFrom(trendChart);
    expect(record.timePoints.map((point) => point.label)).toEqual(["0800", "1200", "1600"]);
    expect(notes).toEqual([]);
    expect(reasons).toEqual([
      expect.objectContaining({
        code: "needs_fix",
        path: ["chart"],
        message: expect.stringContaining("Orders"),
      }),
    ]);
    expect(standaloneEhrRecordSchema.safeParse(record).success).toBe(true);
    expect(JSON.stringify(record)).not.toMatch(/fromStep|stepAccess/);
  });

  it("gives a chart with no times one time point", () => {
    const { record } = standaloneRecordFrom({
      patient: trendChart.patient,
      chart: { tabs: [{ title: "Notes", sections: [{ kind: "text", text: "Alert." }] }] },
    });
    expect(record.timePoints).toEqual([{ id: "tp_1", label: DEFAULT_TIME_LABEL }]);
  });

  it("keeps the times a source charts its tabs at", () => {
    const { record } = standaloneRecordFrom({
      patient: trendChart.patient,
      chart: {
        tabs: ["0800", "1200"].map((time) => ({
          title: "Nurses' Notes",
          time,
          sections: [{ kind: "text" as const, text: `${time}: Alert.` }],
        })),
      },
    });
    expect(record.timePoints.map((point) => point.label)).toEqual(["0800", "1200"]);
    expect(record.tabs.map((tab) => tab.timePointId)).toEqual(["tp_1", "tp_2"]);
  });

  it("flags a missing patient field rather than filling it in", () => {
    const { record, reasons } = standaloneRecordFrom({ ...trendChart, patient: { age: "71" } });
    expect(record.patientHeader).toEqual({ age: 71 });
    expect(reasons.map((reason) => reason.path)).toEqual(
      expect.arrayContaining([
        ["patient", "sex"],
        ["patient", "setting"],
      ]),
    );
  });

  it("has a JSON Schema for the call that reads a standalone chart", () => {
    const schema = standaloneChartJsonSchema();
    expect(schema).toMatchObject({ type: "object", required: ["patient", "chart"] });
    expect(JSON.stringify(schema)).not.toContain("oneOf");
  });
});

const bowtie: ItemDraft = {
  type: "bowtie",
  stem: "A fictional client is admitted.",
  actions: ["Act one *", "Act two *", "Act three", "Act four", "Act five"].map((text) => ({
    text,
  })),
  conditions: ["Cond one *", "Cond two", "Cond three", "Cond four"].map((text) => ({ text })),
  parameters: ["Par one *", "Par two *", "Par three", "Par four", "Par five"].map((text) => ({
    text,
  })),
};

describe("assembleQuestion", () => {
  it("converts a standalone question with no chart as it stands", () => {
    const entry = assembleQuestion({ draft: bowtie }, { id: "imp_7", tags: ["t"] });
    expect(entry).toMatchObject({ kind: "item", reasons: [], notes: [] });
    expect(entry.item).not.toHaveProperty("ehr");
    expect(itemSchema.parse(entry.item)).toMatchObject({
      id: "imp_7",
      type: "bowtie",
      tags: ["t"],
    });
  });

  it("attaches a standalone bowtie's own record", () => {
    const entry = assembleQuestion(
      {
        draft: bowtie,
        chart: {
          patient: trendChart.patient,
          chart: { tabs: [{ title: "Notes", sections: [{ kind: "text", text: "Alert." }] }] },
        },
      },
      { id: "imp_8" },
    );
    expect(entry.reasons).toEqual([]);
    const item = itemSchema.parse(entry.item);
    expect(item.ehr?.timePoints).toHaveLength(1);
    expect(item.cjmmStep).toBeUndefined();
  });

  it("flags a chart it cannot read and leaves the question without one", () => {
    const entry = assembleQuestion({ draft: bowtie, chart: { chart: "nope" } }, { id: "imp_9" });
    expect(entry.item).not.toHaveProperty("ehr");
    expect(entry.reasons).toEqual([
      expect.objectContaining({ code: "needs_fix", path: ["chart"] }),
    ]);
  });

  it("puts a step's chart reasons and time notes under the item's ehr", () => {
    const entry = assembleQuestion(
      {
        draft: bowtie,
        chart: {
          patient: trendChart.patient,
          chart: {
            tabs: [
              {
                title: "Vital Signs",
                sections: [
                  { kind: "table", columns: ["", "2200", "2015"], rows: [["HR", "1", "2"]] },
                ],
              },
            ],
          },
        },
      },
      { id: "imp_10" },
    );
    expect(entry.notes).toEqual([
      expect.objectContaining({ code: "possible_source_error", path: ["ehr", "timePoints", 1] }),
    ]);
  });
});

describe("assembleImport", () => {
  const source = {
    author: "  A. Fictional Author ",
    objectives: ["Recognize early bleeding.", " "],
    references: ["Course text, chapter 9."],
  };
  const result = assembleImport(
    [
      { kind: "case_study", ...group() },
      { kind: "question", draft: bowtie },
      { kind: "case_study", ...group(2, { title: "Activity", patient: {}, charts: [] }) },
    ],
    { idPrefix: "batch7", tags: ["ai-import"], source },
  );

  it("gives one case study and one bowtie, then the short group's questions, in order", () => {
    expect(result.entries.map((entry) => entry.kind)).toEqual([
      "case_study",
      "item",
      "item",
      "item",
    ]);
    expect(
      result.entries.map((entry) => (entry.kind === "item" ? entry.item.id : entry.caseStudy.id)),
    ).toEqual(["batch7_1", "batch7_2", "batch7_3_q_1", "batch7_3_q_2"]);
    const bowtieEntry = result.entries[1];
    expect(bowtieEntry.kind === "item" && bowtieEntry.item.type).toBe("bowtie");
    expect(bowtieEntry.groupKey).toBeUndefined();
  });

  it("keeps the author, objectives and references on the batch, in no item", () => {
    expect(result.source).toEqual({
      author: "A. Fictional Author",
      objectives: ["Recognize early bleeding."],
      references: ["Course text, chapter 9."],
    });
    const items = JSON.stringify(result.entries);
    for (const text of ["Fictional Author", "Recognize early bleeding", "chapter 9"]) {
      expect(items).not.toContain(text);
    }
  });

  it("keeps no source when none is given", () => {
    expect(assembleImport([], {}).source).toEqual({ objectives: [], references: [] });
  });

  it("refuses an id prefix that would make invalid ids", () => {
    expect(() => assembleImport([], { idPrefix: "no spaces" })).toThrow(/idPrefix/);
    expect(() => assembleImport([], { idPrefix: "x".repeat(41) })).toThrow(/idPrefix/);
  });
});

describe("timeOrderNotes", () => {
  const labels = (notes: ReturnType<typeof timeOrderNotes>) => notes.map((note) => note.label);

  it.each([
    [["0800", "1100", "1500"], []],
    [["2200", "2300", "0100", "0400"], []],
    [["2200", "2300", "2015", "0400"], ["2015"]],
    [["2015", "2200"], []],
    [["Day 1, 0800", "Day 2 0600", "Day 1 2000"], ["Day 1 2000"]],
    [["Day 1", "Day 3", "Day 2"], ["Day 2"]],
    [["08:00", "12:30", "11.15"], ["11.15"]],
    [["0800", "Admission", "0700"], ["0700"]],
    [["0800", "0800"], []],
    [["Result", "Range"], []],
  ])("%j flags %j", (input, flagged) => {
    expect(labels(timeOrderNotes(input))).toEqual(flagged);
  });

  it("names the time before it and points at the label's index", () => {
    const [note] = timeOrderNotes(["2200", "2300", "2015"]);
    expect(note).toMatchObject({ index: 2, label: "2015" });
    expect(note.message).toContain('after "2300"');
  });
});
