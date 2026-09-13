import { describe, expect, it } from "vitest";
import { emptyRecord } from "@/lib/authoring/caseStudies";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { sampleTrendEhr } from "@/lib/ngn/fixtures/trend";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import {
  addBlock,
  addTab,
  addTableColumn,
  addTableRow,
  addTimePoint,
  addVitalsRow,
  ehrFormFromStored,
  emptyEhrForm,
  fromEhrForm,
  moveTab,
  previewRecord,
  removeBlock,
  removeTab,
  removeTableColumn,
  removeTableRow,
  removeTimePoint,
  removeVitalsRow,
  setTableCell,
  setTableHeading,
  toEhrForm,
  type EhrBlockForm,
  type EhrFormValues,
} from "./ehr";

const table = (block: EhrBlockForm) => {
  if (block.kind !== "table") throw new Error("expected a table block");
  return block;
};
const vitals = (block: EhrBlockForm) => {
  if (block.kind !== "vitals") throw new Error("expected a vitals block");
  return block;
};

/** A small complete record built through the form, used where the fixtures are too large. */
function filledForm(): EhrFormValues {
  let values = emptyEhrForm();
  values = {
    ...values,
    patient: { name: "", age: "58", sex: "female", setting: "Medical unit", admissionDate: "" },
  };
  values = addTab(values, "history_physical");
  values.tabs[0]!.blocks[0] = { kind: "markdown", value: "Admitted with chest pain." };
  return values;
}

describe("EHR form mapping", () => {
  it("round-trips the sample case study's record", () => {
    expect(fromEhrForm(toEhrForm(sampleEhr))).toStrictEqual(sampleEhr);
  });

  it("round-trips the Trend record, with its three time points", () => {
    expect(fromEhrForm(toEhrForm(sampleTrendEhr))).toStrictEqual(sampleTrendEhr);
  });

  it("starts empty with one time point and no sections, which is not a complete record", () => {
    const values = emptyEhrForm();
    expect(values.timePoints).toHaveLength(1);
    expect(values.tabs).toEqual([]);
    expect(values.patient.sex).toBe("");
    expect(ehrRecordSchema.safeParse(fromEhrForm(values)).success).toBe(false);
  });

  it("leaves out optional header fields, units and flags that are blank", () => {
    let values = filledForm();
    values = addTab(values, "vital_signs");
    const record = fromEhrForm(values) as {
      patientHeader: Record<string, unknown>;
      tabs: { timePointId?: string; blocks: { rows?: Record<string, unknown>[] }[] }[];
    };
    expect(record.patientHeader).toStrictEqual({ age: 58, sex: "female", setting: "Medical unit" });
    expect(record.tabs[0]).not.toHaveProperty("timePointId");
    const row = record.tabs[1]!.blocks[0]!.rows![0]!;
    expect(row).not.toHaveProperty("unit");
    expect(row).not.toHaveProperty("flag");
  });

  it("does not turn an age that is not a whole number from 0 to 120 into one", () => {
    const values = filledForm();
    for (const age of ["", "abc", "4.5", "-3", "121", "999"]) {
      const header = (
        fromEhrForm({ ...values, patient: { ...values.patient, age } }) as {
          patientHeader: object;
        }
      ).patientHeader;
      // Missing, so a draft never stores an age the record cannot have.
      expect(header).not.toHaveProperty("age");
    }
    for (const age of ["", "abc", "4.5", "-3", "121", "999"]) {
      const record = fromEhrForm({ ...values, patient: { ...values.patient, age } });
      expect(ehrRecordSchema.safeParse(record).success).toBe(false);
    }
    expect(ehrRecordSchema.safeParse(fromEhrForm(values)).success).toBe(true);
  });
});

describe("time points", () => {
  it("adds a time point with an id no other time point has", () => {
    const values = addTimePoint(addTimePoint(emptyEhrForm()));
    const ids = values.timePoints.map((point) => point.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("removing a time point clears it from every section that named it, so the record stays valid", () => {
    let values = addTimePoint(filledForm());
    const second = values.timePoints[1]!.id;
    values = {
      ...values,
      timePoints: values.timePoints.map((point, index) => ({ ...point, label: `Time ${index}` })),
      tabs: values.tabs.map((tab) => ({ ...tab, timePointId: second })),
    };
    const removed = removeTimePoint(values, second);
    expect(removed.timePoints.map((point) => point.id)).not.toContain(second);
    expect(removed.tabs.every((tab) => tab.timePointId === "")).toBe(true);
    expect(ehrRecordSchema.safeParse(fromEhrForm(removed)).success).toBe(true);
  });

  it("does not remove the last time point", () => {
    const values = emptyEhrForm();
    expect(removeTimePoint(values, values.timePoints[0]!.id)).toBe(values);
  });
});

describe("sections", () => {
  it("adds a section of the chosen kind, titled for it, with a block that suits it", () => {
    const values = addTab(addTab(emptyEhrForm(), "nurses_notes"), "lab_results");
    expect(values.tabs[0]).toMatchObject({ kind: "nurses_notes", title: "Nurses' Notes" });
    expect(values.tabs[0]!.blocks[0]).toStrictEqual({ kind: "markdown", value: "" });
    expect(values.tabs[1]).toMatchObject({ kind: "lab_results", title: "Lab Results" });
    expect(values.tabs[1]!.blocks[0]!.kind).toBe("vitals");
    expect(values.tabs[0]!.id).not.toBe(values.tabs[1]!.id);
  });

  it("leaves a custom section's title for the author", () => {
    expect(addTab(emptyEhrForm(), "custom").tabs[0]!.title).toBe("");
  });

  it("moves a section up or down, and not past either end", () => {
    const values = addTab(addTab(emptyEhrForm(), "history_physical"), "orders");
    const moved = moveTab(values, 1, -1);
    expect(moved.tabs.map((tab) => tab.kind)).toEqual(["orders", "history_physical"]);
    expect(moveTab(values, 0, -1)).toBe(values);
    expect(moveTab(values, 1, 1)).toBe(values);
  });

  it("removes a section, and adds and removes blocks inside one", () => {
    let values = addTab(addTab(emptyEhrForm(), "history_physical"), "orders");
    values = addBlock(values, 0, "table");
    expect(values.tabs[0]!.blocks.map((block) => block.kind)).toEqual(["markdown", "table"]);
    values = removeBlock(values, 0, 0);
    expect(values.tabs[0]!.blocks.map((block) => block.kind)).toEqual(["table"]);
    values = removeTab(values, 0);
    expect(values.tabs.map((tab) => tab.kind)).toEqual(["orders"]);
  });
});

describe("keeping sections valid", () => {
  it("keeps at least one block in a section", () => {
    const values = addTab(emptyEhrForm(), "orders");
    expect(removeBlock(values, 0, 0)).toBe(values);
  });
});

describe("table blocks", () => {
  it("starts with a heading row and one row, every row as wide as the headings", () => {
    const block = table(addBlock(addTab(emptyEhrForm(), "custom"), 0, "table").tabs[0]!.blocks[1]!);
    expect(block.columns.length).toBeGreaterThan(0);
    expect(block.rows).toHaveLength(1);
    expect(block.rows[0]).toHaveLength(block.columns.length);
  });

  it("adds and removes rows and columns, keeping every row in step", () => {
    let block = table({ kind: "table", columns: ["Test", "Result"], rows: [["Sodium", "138"]] });
    block = table(addTableColumn(block));
    expect(block.columns).toEqual(["Test", "Result", ""]);
    expect(block.rows).toEqual([["Sodium", "138", ""]]);
    block = table(addTableRow(block));
    expect(block.rows[1]).toEqual(["", "", ""]);
    block = table(setTableCell(block, 1, 0, "Potassium"));
    block = table(setTableHeading(block, 2, "Range"));
    expect(block.columns[2]).toBe("Range");
    block = table(removeTableColumn(block, 1));
    expect(block.columns).toEqual(["Test", "Range"]);
    expect(block.rows).toEqual([
      ["Sodium", ""],
      ["Potassium", ""],
    ]);
    block = table(removeTableRow(block, 0));
    expect(block.rows).toEqual([["Potassium", ""]]);
  });

  it("keeps at least one column and one row", () => {
    const block = table({ kind: "table", columns: ["Only"], rows: [["one"]] });
    expect(removeTableColumn(block, 0)).toBe(block);
    expect(removeTableRow(block, 0)).toBe(block);
  });
});

describe("vitals blocks", () => {
  it("adds and removes measures, keeping at least one", () => {
    let block = vitals({
      kind: "vitals",
      rows: [{ label: "Heart rate", value: "88", unit: "beats/min", flag: "" }],
    });
    block = vitals(addVitalsRow(block));
    expect(block.rows[1]).toStrictEqual({ label: "", value: "", unit: "", flag: "" });
    block = vitals(removeVitalsRow(block, 0));
    expect(block.rows).toHaveLength(1);
    expect(removeVitalsRow(block, 0)).toBe(block);
  });
});

describe("reopening a stored record", () => {
  it("opens a new case study's record without inventing an age or a sex", () => {
    const values = ehrFormFromStored(emptyRecord());
    expect(values.patient.age).toBe("");
    expect(values.patient.sex).toBe("");
    expect(values.timePoints).toHaveLength(1);
    expect(values.tabs).toEqual([]);
  });

  it("reopens a valid record exactly", () => {
    expect(ehrFormFromStored(sampleTrendEhr)).toStrictEqual(toEhrForm(sampleTrendEhr));
  });

  it("falls back to an empty record for anything malformed", () => {
    for (const stored of [null, 42, "text", [], { tabs: "nope", timePoints: [{}] }]) {
      const values = ehrFormFromStored(stored);
      expect(values.timePoints.length).toBeGreaterThan(0);
      expect(Array.isArray(values.tabs)).toBe(true);
    }
  });

  it("drops malformed blocks and tabs, and time points a section names that are missing", () => {
    const values = ehrFormFromStored({
      patientHeader: { age: 40, sex: "male", setting: "Clinic" },
      timePoints: [{ id: "t1", label: "Visit" }],
      tabs: [
        {
          id: "a",
          kind: "orders",
          title: "Orders",
          timePointId: "gone",
          blocks: [{ kind: "markdown", value: "Rest" }, { kind: "video" }, "bad"],
        },
        { id: "b", kind: "not-a-kind", title: "Odd", blocks: [] },
        "bad",
      ],
    });
    expect(values.tabs).toHaveLength(2);
    expect(values.tabs[0]!.timePointId).toBe("");
    expect(values.tabs[0]!.blocks).toStrictEqual([{ kind: "markdown", value: "Rest" }]);
    expect(values.tabs[1]!.kind).toBe("custom");
  });
});

describe("preview record", () => {
  it("is the record itself once it is valid", () => {
    expect(previewRecord(toEhrForm(sampleTrendEhr))).toStrictEqual(sampleTrendEhr);
  });

  it("is nothing until the patient header is complete", () => {
    const values = filledForm();
    expect(previewRecord({ ...values, patient: { ...values.patient, sex: "" } })).toBeNull();
  });

  it("shows the finished sections while another is still being written", () => {
    let values = filledForm();
    values = addTab(values, "nurses_notes");
    const preview = previewRecord(values);
    expect(preview?.tabs.map((tab) => tab.kind)).toEqual(["history_physical"]);
    expect(ehrRecordSchema.safeParse(preview).success).toBe(true);
  });

  it("names an unlabelled time point by its place, so the time selector still reads", () => {
    const values = addTimePoint(filledForm());
    const preview = previewRecord(values);
    expect(preview?.timePoints.map((point) => point.label)).toEqual(["Admission", "Time 2"]);
  });
});
