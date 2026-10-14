import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import { describeEhrIssues, describeEmptySteps } from "./ehrIssues";
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

  it("says where a step is wrong, and that one time point must show from Step 1 (#336)", () => {
    expect(
      describeEhrIssues([
        { code: "custom", path: ["timePoints"], message: "" },
        { code: "invalid_union", path: ["timePoints", 1, "fromStep"], message: "" },
        { code: "too_small", path: ["tabs", 2, "stepAccess"], message: "" },
        { code: "invalid_union", path: ["tabs", 0, "blocks", 1, "fromStep"], message: "" },
      ]),
    ).toStrictEqual([
      {
        field: "timePoints.0.fromStep",
        message: "One time point must show from Step 1. Set time point 1 to Step 1.",
      },
      {
        field: "timePoints.1.fromStep",
        message: "Time point 2 must show from one of Steps 1 to 6.",
      },
      {
        field: "tabs.2.stepAccess.0",
        message: "Tab 3 needs Hidden, Locked or Open for each of Steps 1 to 6.",
      },
      {
        field: "tabs.0.blocks.1.fromStep",
        message: "Tab 1, block 2 must show from one of Steps 1 to 6.",
      },
    ]);
  });

  it("names each step at which students would see no tab (#336)", () => {
    const record = ehrRecordSchema.parse({
      ...sampleEhr,
      tabs: [
        {
          ...sampleEhr.tabs[0]!,
          stepAccess: ["open", "hidden", "locked", "open", "hidden", "open"],
        },
      ],
    });
    expect(describeEmptySteps(record)).toStrictEqual([
      { field: "tabs.0.stepAccess.1", message: "At Step 2, students see no tab." },
      { field: "tabs.0.stepAccess.4", message: "At Step 5, students see no tab." },
    ]);
    // A locked tab is a tab students see; the staged sample shows something at every step.
    expect(describeEmptySteps(ehrRecordSchema.parse(stagedEhr))).toStrictEqual([]);
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
