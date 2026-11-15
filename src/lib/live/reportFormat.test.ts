import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDENT_VIEW,
  REPORT_VIEWS,
  SESSIONS_PATH,
  formatPercent,
  formatPoints,
  parseReportView,
  parseStudentViewOptions,
  questionAnchor,
  reportCsvPath,
  reportPath,
  studentsPath,
} from "./reportFormat";

const SESSION = "00000000-0000-4000-8000-0000000000a1";

describe("report addresses", () => {
  it("puts the report beside the session's console", () => {
    expect(reportPath(SESSION)).toBe(`/live/${SESSION}/report`);
    expect(reportCsvPath(SESSION)).toBe(`/live/${SESSION}/report/csv`);
  });

  it("keeps the chosen view in the address, and the default view (questions) out of it", () => {
    expect(reportPath(SESSION, "items")).toBe(`/live/${SESSION}/report`);
    expect(reportPath(SESSION, "students")).toBe(`/live/${SESSION}/report?view=students`);
    expect(reportPath(SESSION, "steps")).toBe(`/live/${SESSION}/report?view=steps`);
  });

  it("lists sessions under the author area", () => {
    expect(SESSIONS_PATH).toBe("/author/sessions");
  });
});

describe("parseReportView", () => {
  it.each(REPORT_VIEWS)("accepts %s", (view) => {
    expect(parseReportView(view)).toBe(view);
  });

  it.each([undefined, "", "STEPS", "admin", ["items", "steps"]])(
    "falls back to the student view for %j",
    (value) => {
      expect(parseReportView(value)).toBe("students");
    },
  );

  it("falls back to the view the report asks for (#565)", () => {
    expect(parseReportView(undefined, "items")).toBe("items");
    expect(parseReportView("steps", "items")).toBe("steps");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(83.333)).toBe("83%");
    expect(formatPercent(66.5)).toBe("67%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("writes a dash for no value", () => {
    expect(formatPercent(null)).toBe("–");
  });
});

describe("formatPoints", () => {
  it("drops trailing zeroes and keeps at most two places", () => {
    expect(formatPoints(3)).toBe("3");
    expect(formatPoints(2.5)).toBe("2.5");
    expect(formatPoints(2 / 3)).toBe("0.67");
  });

  it("writes a dash for no value", () => {
    expect(formatPoints(null)).toBe("–");
  });
});

describe("students view options (#565)", () => {
  it("reads the compact view sorted by name when nothing is asked for", () => {
    expect(parseStudentViewOptions({})).toEqual(DEFAULT_STUDENT_VIEW);
    expect(parseStudentViewOptions({ layout: "table", sort: "random" })).toEqual(
      DEFAULT_STUDENT_VIEW,
    );
  });

  it("reads the full grid and the score order", () => {
    expect(parseStudentViewOptions({ layout: ["grid", "compact"], sort: "score" })).toEqual({
      layout: "grid",
      sort: "score",
    });
  });

  it("writes only what differs from the defaults", () => {
    expect(studentsPath(SESSION, DEFAULT_STUDENT_VIEW)).toBe(
      `/live/${SESSION}/report?view=students`,
    );
    expect(studentsPath(SESSION, { layout: "grid", sort: "score" })).toBe(
      `/live/${SESSION}/report?view=students&layout=grid&sort=score`,
    );
  });

  it("anchors a question's row by its position", () => {
    expect(questionAnchor(7)).toBe("question-7");
  });
});
