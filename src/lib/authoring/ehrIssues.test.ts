import { describe, expect, it } from "vitest";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import { describeEhrIssues } from "./ehrIssues";
import { addTab, addTimePoint, emptyEhrForm, fromEhrForm, type EhrFormValues } from "./forms/ehr";

const issuesFor = (values: EhrFormValues) => {
  const parsed = ehrRecordSchema.safeParse(fromEhrForm(values));
  return parsed.success ? [] : describeEhrIssues(parsed.error.issues);
};

const header = { name: "", age: "70", sex: "male" as const, setting: "Ward", admissionDate: "" };

describe("describeEhrIssues", () => {
  it("asks for the patient's age, sex and setting, and a tab, in plain words", () => {
    expect(issuesFor(emptyEhrForm())).toStrictEqual([
      {
        field: "patient.age",
        message: "Enter the patient's age in whole years, from 0 to 120.",
      },
      { field: "patient.sex", message: "Choose the patient's sex." },
      { field: "patient.setting", message: "Write the care setting, such as Medical unit." },
      { field: "tabs", message: "Add at least one tab." },
    ]);
  });

  it("names the time point, tab and block that need text", () => {
    let values = addTimePoint({ ...emptyEhrForm(), patient: header });
    values = addTab(addTab(values, "custom"), "vital_signs");
    expect(issuesFor(values)).toStrictEqual([
      { field: "timePoints.1.label", message: "Time point 2 needs a label." },
      { field: "tabs.0.title", message: "Tab 1 needs a title." },
      { field: "tabs.0.blocks.0", message: "Tab 1, block 1 needs text." },
      {
        field: "tabs.1.blocks.0.rows.0.label",
        message: "Tab 2, block 1, row 1 needs a measure.",
      },
      {
        field: "tabs.1.blocks.0.rows.0.value",
        message: "Tab 2, block 1, row 1 needs a value.",
      },
    ]);
  });

  it("asks for a block when a tab has none", () => {
    const values = addTab({ ...emptyEhrForm(), patient: header }, "orders");
    values.tabs[0]!.blocks = [];
    expect(issuesFor(values)).toStrictEqual([
      { field: "tabs.0.blocks", message: "Tab 1 needs at least one block." },
    ]);
  });

  it("explains a tab set to a time point the patient record no longer has", () => {
    const values = addTab({ ...emptyEhrForm(), patient: header }, "orders");
    values.tabs[0]!.blocks = [{ kind: "markdown", value: "Rest" }];
    values.tabs[0]!.timePointId = "gone";
    expect(issuesFor(values)).toStrictEqual([
      {
        field: "tabs.0.timePointId",
        message: "Tab 1 is set to a time point that was removed. Choose another time.",
      },
    ]);
  });

  it("gives one message per field, and a general one for anything unexpected", () => {
    const issues = describeEhrIssues([
      { code: "too_small", path: ["patientHeader", "age"], message: "", minimum: 0 },
      { code: "invalid_type", path: ["patientHeader", "age"], message: "" },
      { code: "custom", path: ["somewhere"], message: "" },
    ]);
    expect(issues).toStrictEqual([
      {
        field: "patient.age",
        message: "Enter the patient's age in whole years, from 0 to 120.",
      },
      {
        field: "record",
        message: "Something in this patient record needs attention. Check each tab.",
      },
    ]);
  });
});
