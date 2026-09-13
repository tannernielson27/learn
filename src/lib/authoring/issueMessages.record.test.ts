import { describe, expect, it } from "vitest";
import { describeIssues } from "./issueMessages";

describe("record problems on an item", () => {
  it("words them as the record editor does, under the record's own fields", () => {
    const issues = describeIssues(
      [
        { code: "invalid_type", path: ["stem", "value"], message: "" },
        { code: "invalid_type", path: ["ehr", "patientHeader", "sex"], message: "" },
        {
          code: "too_small",
          path: ["ehr", "tabs", 0, "blocks", 0, "value"],
          message: "",
          minimum: 1,
        },
        { code: "custom", path: ["ehr", "somewhere"], message: "" },
      ],
      "matrix_multiple_choice",
    );
    expect(issues).toStrictEqual([
      { field: "stem", message: "Write the question stem." },
      { field: "ehr.patient.sex", message: "Choose the patient's sex." },
      { field: "ehr.tabs.0.blocks.0", message: "Section 1, block 1 needs text." },
      {
        field: "ehr.record",
        message: "Something in this record needs attention. Check each section.",
      },
    ]);
  });
});
