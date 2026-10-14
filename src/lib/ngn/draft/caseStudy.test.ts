import { describe, expect, it } from "vitest";
import { recordAtStep, type EhrRecordView } from "../chartReveal";
import { sampleCaseStudy } from "../fixtures";
import { stagedCaseStudy } from "../fixtures/chart-reveal";
import { caseStudySchema, type CaseStudy, type EhrRecord } from "../schemas";
import {
  DEFAULT_TIME_LABEL,
  fromCaseStudyDraft,
  mergeOrdered,
  recordFromCharts,
  tabKindOf,
  toCaseStudyDraft,
  toDraft,
  type CaseStudyDraft,
  type ChartDraft,
  type ChartTabDraft,
} from ".";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const STEPS: Step[] = [1, 2, 3, 4, 5, 6];

/** A step's view with ids replaced by what a student reads, so two records compare by content. */
function readable(view: EhrRecordView) {
  const labels = new Map(view.timePoints.map((point) => [point.id, point.label]));
  return {
    patientHeader: view.patientHeader,
    timePoints: view.timePoints.map((point) => point.label),
    tabs: view.tabs.map((tab) => ({
      title: tab.title,
      kind: tab.kind,
      time: tab.timePointId === undefined ? undefined : labels.get(tab.timePointId),
      ...("locked" in tab ? { locked: true } : { blocks: tab.blocks }),
    })),
  };
}

const viewsOf = (record: EhrRecord) => STEPS.map((step) => readable(recordAtStep(record, step)));

describe("round trip: fromCaseStudyDraft(toCaseStudyDraft(case study))", () => {
  it.each([
    ["the sample case study", sampleCaseStudy],
    ["the staged chart", stagedCaseStudy],
  ])("%s shows the same chart at every step and the same six questions", (_name, input) => {
    const fixture = caseStudySchema.parse(input) as CaseStudy;
    const draft = toCaseStudyDraft(fixture);
    const { caseStudy, reasons } = fromCaseStudyDraft(draft, {
      id: "cs_imported",
      tags: fixture.tags,
    });
    expect(reasons).toEqual([]);
    const parsed = caseStudySchema.parse(caseStudy);
    expect(parsed.title).toBe(fixture.title);
    expect(parsed.tags).toEqual(fixture.tags);
    expect(viewsOf(parsed.ehr)).toEqual(viewsOf(fixture.ehr));
    parsed.items.forEach((item, index) => {
      expect(item.id).toBe(`cs_imported_step_${index + 1}`);
      expect(item.cjmmStep).toBe(index + 1);
      expect(toDraft(item as never)).toEqual(toDraft(fixture.items[index] as never));
    });
  });

  it("rebuilds the staged chart's locked labs as stepAccess", () => {
    const fixture = caseStudySchema.parse(stagedCaseStudy) as CaseStudy;
    const { caseStudy } = fromCaseStudyDraft(toCaseStudyDraft(fixture));
    const labs = caseStudy.ehr.tabs.find((tab) => tab.title === "Lab Results");
    expect(labs?.stepAccess).toEqual(["hidden", "locked", "open", "open", "open", "open"]);
    expect(caseStudy.id).toBe("ai_draft");
    expect(caseStudy).not.toHaveProperty("tags");
  });
});

// Fictional, shaped like the owner's Ectopic case: the chart repeats with each step and grows.
const hp: ChartTabDraft = {
  title: "History and Physical",
  sections: [{ kind: "text", text: "29-year-old with lower abdominal pain for four hours." }],
};
const NOTES = [
  "0100: Cramping pain, 6/10.",
  "0115: Pain 8/10 and constant.",
  "0130: Pale and diaphoretic.",
  "0200: Second IV placed. Fluid bolus running.",
];
const VITALS = [
  ["Heart rate", "98", "112", "128", "122"],
  ["Blood pressure", "112/70", "104/64", "88/52", "94/58"],
];
const TIMES = ["0100", "0115", "0130", "0200"];

/** The chart as a step of the source prints it: notes and vitals up to the `times`th time. */
function ectopicChart(times: number, extra: ChartTabDraft[] = []): ChartDraft {
  return {
    tabs: [
      hp,
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
            rows: VITALS.map((row) => row.slice(0, times + 1)),
          },
        ],
      },
      ...extra,
    ],
  };
}

const labs: ChartTabDraft = {
  title: "Lab Results",
  sections: [
    {
      kind: "values",
      rows: [
        { label: "Serum hCG", value: "2,400", unit: "mIU/mL", flag: "H" },
        { label: "Hemoglobin", value: "9.4", unit: "g/dL", flag: "L" },
      ],
    },
  ],
};

const ectopicCharts: ChartDraft[] = [
  ectopicChart(2),
  ectopicChart(2, [{ title: "Lab Results", sections: [] }]),
  ectopicChart(3, [labs]),
  ectopicChart(4, [labs]),
  ectopicChart(4, [labs]),
  ectopicChart(4, [labs]),
];

const view = (record: Pick<EhrRecord, "timePoints" | "tabs">, step: Step) =>
  recordAtStep({ patientHeader: { age: 29, sex: "female", setting: "ED" }, ...record }, step);

const notesAt = (record: Pick<EhrRecord, "timePoints" | "tabs">, step: Step) => {
  const notes = view(record, step).tabs.find((tab) => tab.title === "Nurses' Notes");
  return notes && "blocks" in notes
    ? notes.blocks.map((block) => ("value" in block ? block.value : ""))
    : [];
};

describe("recordFromCharts", () => {
  const record = recordFromCharts(ectopicCharts);

  it("merges six growing charts into one record that stops at 0115 at step 1", () => {
    expect(record.reasons).toEqual([]);
    const first = view(record, 1);
    expect(first.timePoints.map((point) => point.label)).toEqual(["0100", "0115"]);
    expect(notesAt(record, 1)).toEqual(NOTES.slice(0, 2));
    const vitals = first.tabs.find((tab) => tab.title === "Vital Signs");
    expect(vitals && "blocks" in vitals && vitals.blocks[0]).toEqual({
      kind: "table",
      columns: ["", "0100", "0115"],
      rows: [
        ["Heart rate", "98", "112"],
        ["Blood pressure", "112/70", "104/64"],
      ],
    });
    expect(first.tabs.map((tab) => tab.title)).not.toContain("Lab Results");
  });

  it("has the 0200 note at step 6, each note once", () => {
    expect(notesAt(record, 6)).toEqual(NOTES);
    expect(view(record, 6).timePoints.map((point) => point.label)).toEqual(TIMES);
  });

  it("sets fromStep where content first appears, and locks a tab shown empty", () => {
    expect(record.timePoints).toEqual([
      { id: "tp_1", label: "0100" },
      { id: "tp_2", label: "0115" },
      { id: "tp_3", label: "0130", fromStep: 3 },
      { id: "tp_4", label: "0200", fromStep: 4 },
    ]);
    const labsTab = record.tabs.find((tab) => tab.title === "Lab Results");
    expect(labsTab).toMatchObject({
      kind: "lab_results",
      stepAccess: ["hidden", "locked", "open", "open", "open", "open"],
      blocks: [{ kind: "vitals", fromStep: 3 }],
    });
    expect(view(record, 2).tabs.find((tab) => tab.title === "Lab Results")).toMatchObject({
      locked: true,
    });
  });

  it("reads a step with no chart as the step before", () => {
    const short = recordFromCharts(ectopicCharts.slice(0, 3));
    expect(notesAt(short, 6)).toEqual(NOTES.slice(0, 3));
  });

  it("puts rows and results that arrive later in their own blocks", () => {
    const later = recordFromCharts([
      {
        tabs: [
          {
            title: "Labs",
            sections: [
              { kind: "table", columns: ["Test", "Result"], rows: [["Hgb", "9.4"]] },
              { kind: "values", rows: [{ label: "INR", value: "1.1" }] },
            ],
          },
        ],
      },
      {
        tabs: [
          {
            title: "Labs",
            sections: [
              {
                kind: "table",
                columns: ["Test", "Result"],
                rows: [
                  ["Hgb", "9.4"],
                  ["Plt", "212"],
                ],
              },
              {
                kind: "values",
                rows: [
                  { label: "INR", value: "1.1" },
                  { label: "INR", value: "1.4", unit: " " },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(later.reasons).toEqual([]);
    expect(later.tabs[0].blocks).toEqual([
      { kind: "table", columns: ["Test", "Result"], rows: [["Hgb", "9.4"]] },
      { kind: "table", columns: ["Test", "Result"], rows: [["Plt", "212"]], fromStep: 2 },
      { kind: "vitals", rows: [{ label: "INR", value: "1.1" }] },
      { kind: "vitals", rows: [{ label: "INR", value: "1.4" }], fromStep: 2 },
    ]);
    // Nothing is named as a time, so the record opens on the default time point.
    expect(later.timePoints).toEqual([{ id: "tp_1", label: DEFAULT_TIME_LABEL }]);
  });

  it("keeps the first value of a cell a later chart contradicts, and says so", () => {
    const { tabs, reasons } = recordFromCharts([
      {
        tabs: [
          {
            title: "Vitals",
            sections: [{ kind: "table", columns: ["", "0100"], rows: [["HR", "98"]] }],
          },
        ],
      },
      {
        tabs: [
          {
            title: "Vitals",
            sections: [{ kind: "table", columns: ["", "0100"], rows: [["HR", "99", "extra"]] }],
          },
        ],
      },
    ]);
    expect(tabs[0].blocks[0]).toEqual({
      kind: "table",
      columns: ["", "0100", ""],
      rows: [["HR", "98", "extra"]],
    });
    expect(reasons).toEqual([
      expect.objectContaining({
        code: "needs_fix",
        path: ["charts", 1, "tabs", 0, "sections", 0],
      }),
    ]);
    expect(reasons[0].message).toContain('"99"');
  });

  it("hides a tab again when a later chart leaves it out, and names a tab's time", () => {
    const note = (time: string): ChartTabDraft => ({
      title: "Nurses' Notes",
      time,
      sections: [{ kind: "text", text: `${time}: seen.` }],
    });
    const { tabs, timePoints } = recordFromCharts([
      { tabs: [hp, note("0800")] },
      { tabs: [hp, note("0800"), note("1400")] },
      { tabs: [hp, note("1400")] },
    ]);
    expect(timePoints).toEqual([
      { id: "tp_1", label: "0800" },
      { id: "tp_2", label: "1400", fromStep: 2 },
    ]);
    expect(tabs.map((tab) => [tab.title, tab.timePointId, tab.stepAccess])).toEqual([
      ["History and Physical", undefined, undefined],
      ["Nurses' Notes", "tp_1", ["open", "open", "hidden", "hidden", "hidden", "hidden"]],
      ["Nurses' Notes", "tp_2", undefined],
    ]);
  });

  it("opens on a default time when the only named time arrives later", () => {
    const { timePoints } = recordFromCharts([
      { tabs: [hp] },
      {
        tabs: [
          hp,
          { title: "Diagnostics", time: "0130", sections: [{ kind: "text", text: "Scan." }] },
        ],
      },
    ]);
    expect(timePoints).toEqual([
      { id: "tp_1", label: DEFAULT_TIME_LABEL },
      { id: "tp_2", label: "0130", fromStep: 2 },
    ]);
  });

  it("leaves out a tab that never shows anything, with a reason", () => {
    const { tabs, reasons } = recordFromCharts([
      { tabs: [hp, { title: "MAR", sections: [{ kind: "text", text: "  " }] }] },
    ]);
    expect(tabs.map((tab) => tab.title)).toEqual(["History and Physical"]);
    expect(reasons[0].message).toBe('The tab "MAR" never shows anything, so it was left out.');
  });

  it("returns nothing for no charts", () => {
    expect(recordFromCharts([]).tabs).toEqual([]);
  });
});

describe("helpers", () => {
  it("mergeOrdered places new keys after the key before them", () => {
    expect(mergeOrdered(["a", "c"], ["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
    expect(mergeOrdered(["b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it.each([
    ["History & Physical", "history_physical"],
    ["Nurses' Notes", "nurses_notes"],
    ["Vital Signs", "vital_signs"],
    ["Laboratory Results", "lab_results"],
    ["Medication Administration Record", "mar"],
    ["Provider Orders", "orders"],
    ["Imaging", "diagnostics"],
    ["Intake and Output", "custom"],
  ])("tabKindOf(%s) is %s", (title, kind) => {
    expect(tabKindOf(title)).toBe(kind);
  });
});

describe("fromCaseStudyDraft", () => {
  const steps = (caseStudySchema.parse(sampleCaseStudy) as CaseStudy).items.map(
    (item) => toDraft(item as never) as CaseStudyDraft["steps"][number],
  );
  const base: CaseStudyDraft = {
    title: "  Ectopic   pregnancy ",
    patient: {
      age: "29 years",
      sex: "Female",
      setting: "Emergency department",
      name: "J. Doe",
      admissionDate: "Day 0",
    },
    charts: ectopicCharts,
    steps,
  };

  it("builds the header from the source's words and numbers the steps itself", () => {
    const { caseStudy, reasons } = fromCaseStudyDraft(base, { id: "cs_ect" });
    expect(reasons).toEqual([]);
    const parsed = caseStudySchema.parse(caseStudy);
    expect(parsed.title).toBe("Ectopic pregnancy");
    expect(parsed.ehr.patientHeader).toEqual({
      name: "J. Doe",
      age: 29,
      sex: "female",
      setting: "Emergency department",
      admissionDate: "Day 0",
    });
    expect(parsed.items.map((item) => item.cjmmStep)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ["M", "male"],
    ["boy", "male"],
    ["nonbinary", "other"],
  ])("reads sex %s as %s", (sex, expected) => {
    expect(
      fromCaseStudyDraft({ ...base, patient: { ...base.patient, sex } }).caseStudy.ehr.patientHeader
        .sex,
    ).toBe(expected);
  });

  it("flags what the header lacks rather than filling it in", () => {
    const { caseStudy, reasons } = fromCaseStudyDraft({
      ...base,
      patient: { age: "unknown", sex: " " },
    });
    expect(reasons.map((reason) => reason.path)).toEqual([
      ["patient", "age"],
      ["patient", "sex"],
      ["patient", "setting"],
    ]);
    expect(caseStudy.ehr.patientHeader).toEqual({});
    expect(caseStudySchema.safeParse(caseStudy).success).toBe(false);
    expect(
      fromCaseStudyDraft({ ...base, patient: { ...base.patient, age: "130" } }).reasons[0].path,
    ).toEqual(["patient", "age"]);
  });

  it("flags a case that is not six steps, and converts no step past the sixth", () => {
    const short = fromCaseStudyDraft({
      ...base,
      charts: base.charts.slice(0, 5),
      steps: steps.slice(0, 5),
    });
    expect(short.reasons.map((reason) => reason.path)).toEqual([["charts"], ["steps"]]);
    const long = fromCaseStudyDraft({ ...base, steps: [...steps, steps[0]] });
    expect(long.reasons[0].message).toContain("Those past the sixth were left out.");
    expect(long.caseStudy.items).toHaveLength(6);
  });

  it("passes a step's reasons on under its position", () => {
    const unkeyed = {
      type: "multiple_choice" as const,
      stem: "Which?",
      options: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
    };
    const { reasons } = fromCaseStudyDraft({ ...base, steps: [unkeyed, ...steps.slice(1)] });
    expect(reasons).toEqual([
      expect.objectContaining({ code: "needs_answer", path: ["steps", 0] }),
    ]);
  });
});
