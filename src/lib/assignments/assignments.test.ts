import { describe, expect, it } from "vitest";
import {
  assignmentPath,
  assignmentReportCsvPath,
  assignmentReportPath,
  assignmentState,
  attemptProgressLabel,
  attemptsLabel,
  defaultWindow,
  formatInstant,
  formatLocalInput,
  localInputToIso,
  parseAssignmentEdit,
  parseAssignmentForm,
  parseCloseTime,
  STATE_LABEL,
  studentAssignmentPath,
  toLocalInputValue,
} from "./assignments";

const CLASS_ID = "00000000-0000-4000-8000-000000000207";
// Built from local parts, so every expectation holds in whatever zone the tests run in.
const NOW = new Date(2026, 8, 23, 9, 5, 30);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function without(fields: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([name]) => name !== key));
}

function iso(...parts: [number, number, number, number, number]): string {
  return new Date(...parts).toISOString();
}

describe("local times", () => {
  it("writes a date as a datetime-local value in the viewer's zone, to the minute", () => {
    expect(toLocalInputValue(NOW)).toBe("2026-09-23T09:05");
    expect(toLocalInputValue(new Date(2027, 0, 2, 17, 0))).toBe("2027-01-02T17:00");
  });

  it("reads a datetime-local value as the viewer's local time", () => {
    expect(localInputToIso("2026-09-23T09:05")).toBe(iso(2026, 8, 23, 9, 5));
    expect(localInputToIso("2026-09-23T09:05:00")).toBe(iso(2026, 8, 23, 9, 5));
  });

  it("refuses anything that is not a datetime-local value", () => {
    for (const value of ["", "tomorrow", "2026-09-23", "2026-13-40T99:99", "2026-09-23T09:05Z"]) {
      expect(localInputToIso(value)).toBeNull();
    }
  });

  it("defaults to opening now and closing tomorrow at 17:00", () => {
    expect(defaultWindow(NOW)).toEqual({
      opensAt: "2026-09-23T09:05",
      closesAt: "2026-09-24T17:00",
    });
  });

  it("rolls the default close over a month end", () => {
    expect(defaultWindow(new Date(2026, 8, 30, 23, 59)).closesAt).toBe("2026-10-01T17:00");
  });
});

describe("showing a time", () => {
  it("names the weekday, the date and a 24-hour time, in the viewer's zone", () => {
    expect(formatInstant(iso(2026, 8, 24, 17, 0), "local")).toBe("Thu 24 Sep 2026, 17:00");
    expect(formatInstant(iso(2027, 0, 3, 8, 7), "local")).toBe("Sun 3 Jan 2027, 08:07");
  });

  it("can say it in UTC, for the moment before the browser knows its zone", () => {
    expect(formatInstant("2026-09-24T23:00:00.000Z", "utc")).toBe("Thu 24 Sep 2026, 23:00");
  });

  it("formats a typed datetime-local value the same way", () => {
    expect(formatLocalInput("2026-09-24T17:00")).toBe("Thu 24 Sep 2026, 17:00");
    expect(formatLocalInput("not a time")).toBeNull();
  });
});

describe("assignment state", () => {
  const opens = iso(2026, 8, 23, 10, 0);
  const closes = iso(2026, 8, 24, 17, 0);

  it("is not yet open before the open time", () => {
    expect(assignmentState(opens, closes, NOW)).toBe("scheduled");
  });

  it("is open from the open time until the close time", () => {
    expect(assignmentState(opens, closes, new Date(opens))).toBe("open");
    expect(assignmentState(opens, closes, new Date(2026, 8, 24, 16, 59))).toBe("open");
  });

  it("is closed from the close time", () => {
    expect(assignmentState(opens, closes, new Date(closes))).toBe("closed");
  });

  it("has a label for every state", () => {
    expect(STATE_LABEL).toEqual({ scheduled: "Not yet open", open: "Open", closed: "Closed" });
  });
});

describe("labels and routes", () => {
  it("counts attempts", () => {
    expect(attemptsLabel(1)).toBe("1 attempt");
    expect(attemptsLabel(3)).toBe("3 attempts");
  });

  it("puts the Assign page beside its source", () => {
    expect(assignmentPath({ kind: "bank", id: "b1" })).toBe("/author/banks/b1/assign");
    expect(assignmentPath({ kind: "case_study", id: "c1" })).toBe("/author/case-studies/c1/assign");
  });

  it("puts a student's assignment under the student home (#208)", () => {
    expect(studentAssignmentPath("a1")).toBe("/learn/assignments/a1");
  });

  it("puts an assignment's report and its CSV under /author, keeping the view (#211)", () => {
    expect(assignmentReportPath("a1")).toBe("/author/assignments/a1/report");
    expect(assignmentReportPath("a1", "students")).toBe("/author/assignments/a1/report");
    expect(assignmentReportPath("a1", "steps")).toBe("/author/assignments/a1/report?view=steps");
    expect(assignmentReportCsvPath("a1")).toBe("/author/assignments/a1/report/csv");
  });

  it("says how a student's attempts stand (#208)", () => {
    expect(attemptProgressLabel(2, undefined)).toBe("2 attempts");
    expect(attemptProgressLabel(1, { submitted: 0, open: true })).toBe("In progress");
    expect(attemptProgressLabel(3, { submitted: 1, open: false })).toBe("2 attempts left");
    expect(attemptProgressLabel(2, { submitted: 1, open: false })).toBe("1 attempt left");
    expect(attemptProgressLabel(1, { submitted: 1, open: false })).toBe("Submitted");
  });
});

describe("parseAssignmentForm", () => {
  const valid = {
    classId: CLASS_ID,
    opensAt: iso(2026, 8, 23, 9, 5),
    closesAt: iso(2026, 8, 24, 17, 0),
    maxAttempts: "2",
    shuffleOptions: "on",
  };

  it("reads a whole form", () => {
    expect(parseAssignmentForm(form(valid), NOW)).toEqual({
      ok: true,
      value: {
        classId: CLASS_ID,
        opensAt: valid.opensAt,
        closesAt: valid.closesAt,
        maxAttempts: 2,
        shuffleOptions: true,
      },
    });
  });

  it("reads an unticked shuffle box as off", () => {
    const parsed = parseAssignmentForm(form(without(valid, "shuffleOptions")), NOW);
    expect(parsed.ok && parsed.value.shuffleOptions).toBe(false);
  });

  it("needs a class", () => {
    const parsed = parseAssignmentForm(form({ ...valid, classId: "nope" }), NOW);
    expect(parsed).toEqual({ ok: false, error: "Choose a class." });
  });

  it("allows 1 to 3 attempts only", () => {
    for (const attempts of ["0", "4", "1.5", "", "two"]) {
      const parsed = parseAssignmentForm(form({ ...valid, maxAttempts: attempts }), NOW);
      expect(parsed).toEqual({ ok: false, error: "Allow 1, 2 or 3 attempts." });
    }
  });

  it("needs both times", () => {
    const parsed = parseAssignmentForm(form({ ...valid, opensAt: "later" }), NOW);
    expect(parsed).toEqual({ ok: false, error: "Enter an open time and a close time." });
  });

  it("refuses a window that closes before it opens", () => {
    const parsed = parseAssignmentForm(
      form({ ...valid, closesAt: valid.opensAt, opensAt: valid.closesAt }),
      NOW,
    );
    expect(parsed).toEqual({ ok: false, error: "The close time must be after the open time." });
  });

  it("refuses a close time in the past", () => {
    const parsed = parseAssignmentForm(
      form({ ...valid, opensAt: iso(2026, 8, 20, 9, 0), closesAt: iso(2026, 8, 21, 9, 0) }),
      NOW,
    );
    expect(parsed).toEqual({ ok: false, error: "The close time has already passed." });
  });

  it("reads only the close time when the assignment has opened", () => {
    const parsed = parseCloseTime(form({ closesAt: valid.closesAt }), NOW);
    expect(parsed).toEqual({ ok: true, value: { closesAt: valid.closesAt } });
  });

  it("still refuses a past close time when only the close time changes", () => {
    const parsed = parseCloseTime(form({ closesAt: iso(2026, 8, 22, 9, 0) }), NOW);
    expect(parsed).toEqual({ ok: false, error: "The close time has already passed." });
  });

  it("does not need a class when editing", () => {
    const parsed = parseAssignmentEdit(form(without(valid, "classId")), NOW);
    expect(parsed).toEqual({
      ok: true,
      value: {
        opensAt: valid.opensAt,
        closesAt: valid.closesAt,
        maxAttempts: 2,
        shuffleOptions: true,
      },
    });
  });
});
