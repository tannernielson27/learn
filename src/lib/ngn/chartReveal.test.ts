import { describe, expect, it } from "vitest";
import {
  isStagedRecord,
  reachedStep,
  recordAtStep,
  recordsThrough,
  stepAtPosition,
  tabAccessAt,
  type EhrRecordView,
  type EhrTabView,
} from "./chartReveal";
import { FIXTURES, sampleCaseStudy, sampleEhr, sampleTrendEhr, sampleTrendItem } from "./fixtures";
import { stagedCaseStudy, stagedEhr } from "./fixtures/chart-reveal";
import {
  CASE_STUDY_STEP_COUNT,
  caseStudySchema,
  ehrRecordSchema,
  itemSchema,
  type EhrRecord,
} from "./schemas";
import type { CjmmStep } from "./types";

const STEPS: CjmmStep[] = [1, 2, 3, 4, 5, 6];

const staged = ehrRecordSchema.parse(stagedEhr);
const tab = (view: EhrRecordView, id: string): EhrTabView | undefined =>
  view.tabs.find((entry) => entry.id === id);
const tabIds = (view: EhrRecordView) => view.tabs.map((entry) => entry.id);
const timeIds = (view: EhrRecordView) => view.timePoints.map((point) => point.id);
const blocksOf = (view: EhrRecordView, id: string) => {
  const found = tab(view, id);
  if (!found || found.locked) throw new Error(`"${id}" should be open`);
  return found.blocks;
};
/** The clock time each revealed note opens with. */
const noteTimes = (view: EhrRecordView) =>
  blocksOf(view, "staged_notes").map((block) =>
    block.kind === "markdown" ? block.value.slice(0, 4) : block.kind,
  );
const vitalsColumns = (view: EhrRecordView) => {
  const [table] = blocksOf(view, "staged_vitals");
  if (table?.kind !== "table") throw new Error("the vitals section holds a table");
  return table;
};

describe("the schema", () => {
  it("has one step count, and it is six", () => {
    expect(CASE_STUDY_STEP_COUNT).toBe(STEPS.length);
  });

  it("accepts a staged record and keeps both fields", () => {
    expect(staged.timePoints[2]).toEqual({ id: "tp_0130", label: "0130", fromStep: 3 });
    expect(staged.tabs[1]?.blocks[2]?.fromStep).toBe(3);
    expect(staged.tabs[3]?.stepAccess).toEqual([
      "hidden",
      "locked",
      "open",
      "open",
      "open",
      "open",
    ]);
  });

  it("leaves a record with neither field exactly as it was", () => {
    expect(ehrRecordSchema.parse(sampleEhr)).toEqual(sampleEhr);
    expect(ehrRecordSchema.parse(sampleTrendEhr)).toEqual(sampleTrendEhr);
  });

  it.each([0, 7, 2.5, "3"])("refuses a fromStep of %j", (fromStep) => {
    const onTime = {
      ...stagedEhr,
      timePoints: [...stagedEhr.timePoints, { id: "tp_late", label: "0500", fromStep }],
    };
    const onBlock = {
      ...sampleEhr,
      tabs: sampleEhr.tabs.map((entry, index) =>
        index === 0 ? { ...entry, blocks: [{ ...entry.blocks[0], fromStep }] } : entry,
      ),
    };
    expect(ehrRecordSchema.safeParse(onTime).success).toBe(false);
    expect(ehrRecordSchema.safeParse(onBlock).success).toBe(false);
  });

  it.each([
    ["no values", []],
    ["five values", ["open", "open", "open", "open", "open"]],
    ["seven values", ["open", "open", "open", "open", "open", "open", "open"]],
    ["a value that is not an access", ["open", "open", "open", "open", "open", "shut"]],
  ])("refuses stepAccess with %s", (_name, stepAccess) => {
    const record = {
      ...sampleEhr,
      tabs: sampleEhr.tabs.map((entry, index) => (index === 0 ? { ...entry, stepAccess } : entry)),
    };
    const result = ehrRecordSchema.safeParse(record);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.slice(0, 3)).toEqual(["tabs", 0, "stepAccess"]);
  });

  it("refuses a record with no time to read at step 1", () => {
    const record = {
      ...sampleEhr,
      timePoints: sampleEhr.timePoints.map((point) => ({ ...point, fromStep: 2 })),
    };
    const result = ehrRecordSchema.safeParse(record);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["timePoints"]);
  });
});

describe("only a case study's record is staged", () => {
  const standalone = (ehr: unknown) => itemSchema.safeParse({ ...FIXTURES.bowtie.canonical, ehr });
  const paths = (ehr: unknown) =>
    standalone(ehr).error?.issues.map((issue) => issue.path.join(".")) ?? [];

  it("accepts both fields on a case study", () => {
    expect(caseStudySchema.safeParse(stagedCaseStudy).success).toBe(true);
  });

  it("still accepts a standalone and a trend item with a plain record", () => {
    expect(standalone(sampleEhr).success).toBe(true);
    expect(itemSchema.safeParse(sampleTrendItem).success).toBe(true);
  });

  it("refuses a standalone item's fromStep on a time point, naming it", () => {
    const ehr = {
      ...sampleEhr,
      timePoints: sampleEhr.timePoints.map((point, index) =>
        index === 1 ? { ...point, fromStep: 3 } : point,
      ),
    };
    expect(paths(ehr)).toEqual(["ehr.timePoints.1.fromStep"]);
  });

  it("refuses a standalone item's fromStep on a block, naming it", () => {
    const ehr = {
      ...sampleEhr,
      tabs: sampleEhr.tabs.map((entry, index) =>
        index === 4
          ? {
              ...entry,
              blocks: entry.blocks.map((block, at) =>
                at === 1 ? { ...block, fromStep: 1 } : block,
              ),
            }
          : entry,
      ),
    };
    expect(paths(ehr)).toEqual(["ehr.tabs.4.blocks.1.fromStep"]);
  });

  it("refuses a standalone item's stepAccess, naming it", () => {
    const stepAccess = ["open", "open", "open", "open", "open", "open"];
    const ehr = {
      ...sampleEhr,
      tabs: sampleEhr.tabs.map((entry, index) => (index === 2 ? { ...entry, stepAccess } : entry)),
    };
    expect(paths(ehr)).toEqual(["ehr.tabs.2.stepAccess"]);
  });

  it("refuses a trend item carrying the staged record, with a message that says why", () => {
    const result = itemSchema.safeParse({ ...sampleTrendItem, ehr: stagedEhr });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/only on a case study/);
  });

  it("refuses a staged record on a step inside a case study too", () => {
    const items = sampleCaseStudy.items.map((item, index) =>
      index === 0 ? { ...item, ehr: stagedEhr } : item,
    );
    expect(caseStudySchema.safeParse({ ...sampleCaseStudy, items }).success).toBe(false);
  });
});

describe("recordAtStep: a chart revealed at steps 1, 3, 4 and 6", () => {
  const views = STEPS.map((step) => recordAtStep(staged, step));
  const at = (step: CjmmStep) => views[step - 1]!;

  it("shows the time points each step has reached", () => {
    expect(views.map(timeIds)).toEqual([
      ["tp_0100", "tp_0115"],
      ["tp_0100", "tp_0115"],
      ["tp_0100", "tp_0115", "tp_0130"],
      ["tp_0100", "tp_0115", "tp_0130", "tp_0200"],
      ["tp_0100", "tp_0115", "tp_0130", "tp_0200"],
      ["tp_0100", "tp_0115", "tp_0130", "tp_0200", "tp_0400"],
    ]);
  });

  it("shows the sections each step has reached, in the author's order", () => {
    expect(views.map(tabIds)).toEqual([
      ["staged_hp", "staged_notes", "staged_vitals"],
      ["staged_hp", "staged_notes", "staged_vitals", "staged_labs"],
      ["staged_hp", "staged_notes", "staged_vitals", "staged_labs", "staged_diagnostics"],
      [
        "staged_hp",
        "staged_notes",
        "staged_vitals",
        "staged_labs",
        "staged_diagnostics",
        "staged_orders",
      ],
      [
        "staged_hp",
        "staged_notes",
        "staged_vitals",
        "staged_labs",
        "staged_diagnostics",
        "staged_orders",
      ],
      [
        "staged_hp",
        "staged_notes",
        "staged_vitals",
        "staged_labs",
        "staged_diagnostics",
        "staged_orders",
      ],
    ]);
  });

  it("shows the notes written so far and no later one", () => {
    expect(views.map(noteTimes)).toEqual([
      ["0100", "0115"],
      ["0100", "0115"],
      ["0100", "0115", "0130"],
      ["0100", "0115", "0130", "0200"],
      ["0100", "0115", "0130", "0200"],
      ["0100", "0115", "0130", "0200", "0400"],
    ]);
  });

  it("drops a section left with no blocks, and brings it back as its blocks arrive", () => {
    expect(tab(at(3), "staged_orders")).toBeUndefined();
    expect(blocksOf(at(4), "staged_orders")).toHaveLength(1);
    expect(blocksOf(at(6), "staged_orders")).toHaveLength(2);
  });

  it("drops a section charted at a time the step has not reached", () => {
    expect(tab(at(2), "staged_diagnostics")).toBeUndefined();
    expect(tab(at(3), "staged_diagnostics")).toMatchObject({ timePointId: "tp_0130" });
  });

  it("hides a vitals table's columns for the time points still hidden", () => {
    expect(vitalsColumns(at(1))).toEqual({
      kind: "table",
      columns: ["", "0100", "0115"],
      rows: [
        ["Heart rate", "98", "112"],
        ["Blood pressure", "112/70", "104/64"],
        ["Respiratory rate", "18", "22"],
        ["SpO2", "99% RA", "98% RA"],
      ],
    });
    expect(vitalsColumns(at(3)).columns).toEqual(["", "0100", "0115", "0130"]);
    expect(vitalsColumns(at(4)).rows[0]).toEqual(["Heart rate", "98", "112", "128", "122"]);
    expect(vitalsColumns(at(6))).toEqual(staged.tabs[2]?.blocks[0]);
  });

  it("puts nothing from a later step anywhere in an earlier view", () => {
    const early = JSON.stringify(at(2));
    for (const later of ["0130", "ectopic", "salpingectomy", "crossmatch", "88/52", "hCG"]) {
      expect(early).not.toContain(later);
    }
    // The control: the same search finds every one of them once the case has ended.
    const whole = JSON.stringify(at(6));
    for (const later of ["0130", "ectopic", "salpingectomy", "crossmatch", "88/52", "hCG"]) {
      expect(whole).toContain(later);
    }
  });

  it("says nothing about when the rest arrives", () => {
    for (const view of views) {
      expect(JSON.stringify(view)).not.toMatch(/fromStep|stepAccess/);
    }
  });

  it("leaves the record it was given unchanged", () => {
    const before = JSON.stringify(staged);
    STEPS.forEach((step) => recordAtStep(staged, step));
    expect(JSON.stringify(staged)).toBe(before);
  });
});

describe("recordAtStep: a tab hidden at 1, locked at 2 and open from 3", () => {
  const labs = staged.tabs[3]!;
  const labText = ["Drawn 0115", "hCG", "2,400", "Hemoglobin", "O negative", "mIU/mL"];

  it("is absent at step 1", () => {
    expect(tab(recordAtStep(staged, 1), "staged_labs")).toBeUndefined();
  });

  it("is its id, kind and title at step 2, marked as locked", () => {
    expect(tab(recordAtStep(staged, 2), "staged_labs")).toEqual({
      id: "staged_labs",
      kind: "lab_results",
      title: "Lab Results",
      locked: true,
    });
  });

  it("holds none of its block text while locked", () => {
    const locked = JSON.stringify(recordAtStep(staged, 2));
    for (const text of labText) expect(locked).not.toContain(text);
    expect(locked).not.toContain('blocks":[]');
    // The control: every one of those strings is in the view once the tab opens.
    const open = JSON.stringify(recordAtStep(staged, 3));
    for (const text of labText) expect(open).toContain(text);
  });

  it("is whole from step 3", () => {
    for (const step of [3, 4, 5, 6] as const) {
      expect(tab(recordAtStep(staged, step), "staged_labs")).toEqual({
        id: labs.id,
        kind: labs.kind,
        title: labs.title,
        blocks: labs.blocks,
      });
    }
  });

  it("keeps a locked tab's time, so it is listed only at the time it was charted", () => {
    const record: EhrRecord = {
      ...staged,
      tabs: staged.tabs.map((entry) =>
        entry.id === "staged_labs" ? { ...entry, timePointId: "tp_0115" } : entry,
      ),
    };
    expect(tab(recordAtStep(record, 2), "staged_labs")).toEqual({
      id: "staged_labs",
      kind: "lab_results",
      title: "Lab Results",
      timePointId: "tp_0115",
      locked: true,
    });
  });

  it("stays locked, by name only, when none of its blocks has arrived yet", () => {
    const record: EhrRecord = {
      ...staged,
      tabs: staged.tabs.map((entry) =>
        entry.id === "staged_labs"
          ? { ...entry, blocks: entry.blocks.map((block) => ({ ...block, fromStep: 5 as const })) }
          : entry,
      ),
    };
    expect(tab(recordAtStep(record, 2), "staged_labs")?.locked).toBe(true);
    // Open, with nothing in it yet, is the same as any other section left with no blocks.
    expect(tab(recordAtStep(record, 3), "staged_labs")).toBeUndefined();
    expect(blocksOf(recordAtStep(record, 5), "staged_labs")).toHaveLength(2);
  });

  it("is dropped, locked or not, while its time point is hidden", () => {
    const record: EhrRecord = {
      ...staged,
      tabs: staged.tabs.map((entry) =>
        entry.id === "staged_labs" ? { ...entry, timePointId: "tp_0200" } : entry,
      ),
    };
    expect(tab(recordAtStep(record, 2), "staged_labs")).toBeUndefined();
    expect(tab(recordAtStep(record, 3), "staged_labs")).toBeUndefined();
    expect(tab(recordAtStep(record, 4), "staged_labs")?.locked).toBeUndefined();
  });
});

describe("recordAtStep: a record with neither field", () => {
  it.each([
    ["the sample case study's record", sampleEhr],
    ["the trend record", sampleTrendEhr],
  ])("%s is the same at every step, and is the record itself", (_name, record) => {
    for (const step of STEPS) expect(recordAtStep(record, step)).toEqual(record);
  });
});

describe("recordAtStep: edges", () => {
  it.each([0, 7, 2.5, Number.NaN])("refuses step %s rather than guess", (step) => {
    expect(() => recordAtStep(staged, step as CjmmStep)).toThrow(RangeError);
  });

  it("hides a column whose label a hidden and a visible time point share", () => {
    // Which of the two the column belongs to cannot be told, so it is hidden until both are out.
    const record: EhrRecord = {
      ...staged,
      timePoints: [
        { id: "tp_a", label: "0100" },
        { id: "tp_b", label: "0100", fromStep: 4 },
      ],
      tabs: [staged.tabs[2]!],
    };
    const all = ["", "0100", "0115", "0130", "0200", "0400"];
    expect(vitalsColumns(recordAtStep(record, 1)).columns).toEqual(all.filter((c) => c !== "0100"));
    expect(vitalsColumns(recordAtStep(record, 4)).columns).toEqual(all);
  });

  it("matches a heading to a label whatever its case and the space around it", () => {
    const record: EhrRecord = {
      ...staged,
      timePoints: [
        { id: "tp_a", label: "Day 1" },
        { id: "tp_b", label: "Day 2", fromStep: 3 },
      ],
      tabs: [
        {
          id: "flow",
          kind: "vital_signs",
          title: "Vital Signs",
          blocks: [
            {
              kind: "table",
              columns: ["", "Day 1", " DAY 2 "],
              rows: [["Heart rate", "98", "128"]],
            },
          ],
        },
      ],
    };
    expect(blocksOf(recordAtStep(record, 2), "flow")).toEqual([
      { kind: "table", columns: ["", "Day 1"], rows: [["Heart rate", "98"]] },
    ]);
    expect(JSON.stringify(recordAtStep(record, 2))).not.toContain("128");
    expect(JSON.stringify(recordAtStep(record, 3))).toContain("128");
  });

  it("is a copy: nothing done to the view reaches the record", () => {
    const before = JSON.stringify(staged);
    const view = recordAtStep(staged, 6);
    view.patientHeader.setting = "changed";
    view.timePoints[0]!.label = "changed";
    for (const entry of view.tabs) {
      if (entry.locked) continue;
      for (const block of entry.blocks) {
        if (block.kind === "markdown") block.value = "changed";
        else if (block.kind === "table") block.rows[0]![0] = block.columns[0] = "changed";
        else block.rows[0]!.value = "changed";
      }
    }
    expect(JSON.stringify(staged)).toBe(before);
  });

  it("carries no key the schema does not name, should a record arrive unparsed", () => {
    const unparsed = {
      ...staged,
      tabs: staged.tabs.map((entry) => ({
        ...entry,
        authorNote: "the answer is ectopic",
        blocks: entry.blocks.map((block) => ({ ...block, authorNote: "the answer is ectopic" })),
      })),
    } as EhrRecord;
    expect(JSON.stringify(recordAtStep(unparsed, 6))).not.toContain("authorNote");
  });

  it("drops a table whose every column belongs to a hidden time point", () => {
    const record: EhrRecord = {
      ...staged,
      tabs: [
        staged.tabs[0]!,
        {
          id: "late_only",
          kind: "custom",
          title: "Later readings",
          blocks: [{ kind: "table", columns: ["0130", "0200"], rows: [["a", "b"]] }],
        },
      ],
    };
    expect(tabIds(recordAtStep(record, 1))).toEqual(["staged_hp"]);
    expect(tabIds(recordAtStep(record, 3))).toEqual(["staged_hp", "late_only"]);
  });

  it("keeps a cell that has no column to be hidden with", () => {
    const record: EhrRecord = {
      ...staged,
      tabs: [
        {
          id: "ragged",
          kind: "custom",
          title: "Ragged",
          blocks: [{ kind: "table", columns: ["", "0130"], rows: [["Heart rate", "128", "note"]] }],
        },
      ],
    };
    expect(blocksOf(recordAtStep(record, 1), "ragged")).toEqual([
      { kind: "table", columns: [""], rows: [["Heart rate", "note"]] },
    ]);
  });
});

describe("tabAccessAt", () => {
  it("is open at every step when the tab says nothing", () => {
    for (const step of STEPS) expect(tabAccessAt(staged.tabs[0]!, step)).toBe("open");
  });

  it("reads the step's own value", () => {
    expect(STEPS.map((step) => tabAccessAt(staged.tabs[3]!, step))).toEqual(
      staged.tabs[3]!.stepAccess,
    );
  });

  it("hides a tab whose list stops short of the step, since it was never parsed", () => {
    const short = { ...staged.tabs[3]!, stepAccess: ["open" as const] };
    expect(tabAccessAt(short, 1)).toBe("open");
    expect(tabAccessAt(short, 2)).toBe("hidden");
  });
});

describe("the step a chart is at (#335)", () => {
  it.each([
    [null, 1],
    [0, 1],
    [-2, 1],
    [1, 1],
    [3, 3],
    [6, 6],
    [9, 6],
    [Number.NaN, 1],
  ])("a live room at position %j shows step %i's chart", (position, step) => {
    expect(stepAtPosition(position)).toBe(step);
  });

  it.each([
    [[], 1],
    [[false, false, false, false, false, false], 1],
    [[true], 2],
    [[true, true, false, true], 3],
    [[false, true, true, true, true, true], 1],
    [[true, true, true, true, true, false], 6],
    [[true, true, true, true, true, true], 6],
  ])("a student who has answered %j has reached step %i", (answered, step) => {
    expect(reachedStep(answered)).toBe(step);
  });

  it("lists each reached step's view, step 1 first, and none past it", () => {
    const views = recordsThrough(staged, 3);
    expect(views).toEqual([1, 2, 3].map((step) => recordAtStep(staged, step as CjmmStep)));
    expect(JSON.stringify(views)).not.toContain("0200: Second large-bore IV");
    expect(JSON.stringify(recordsThrough(staged, 4))).toContain("0200: Second large-bore IV");
  });

  it("refuses a reached step outside 1 to 6", () => {
    expect(() => recordsThrough(staged, 0 as CjmmStep)).toThrow(RangeError);
  });

  it("tells a staged record from one with neither field", () => {
    expect(isStagedRecord(staged)).toBe(true);
    expect(isStagedRecord(ehrRecordSchema.parse(sampleEhr))).toBe(false);
    const [first] = sampleEhr.tabs;
    const onlyBlock = ehrRecordSchema.parse({
      ...sampleEhr,
      tabs: [{ ...first, blocks: [{ ...first!.blocks[0], fromStep: 2 }] }],
    });
    expect(isStagedRecord(onlyBlock)).toBe(true);
  });
});
