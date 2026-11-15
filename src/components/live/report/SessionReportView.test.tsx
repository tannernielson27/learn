import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildSessionReport, inCaseStudies } from "@/lib/live/report";
import { REPORT_FIXTURE } from "@/lib/live/reportFixture";
import { SessionReportView } from "./SessionReportView";

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const report = buildSessionReport(REPORT_FIXTURE);

const renderView = (view: "students" | "items" | "steps", data = report) =>
  render(
    <SessionReportView
      sessionId={SESSION}
      title="Cardiac week 3"
      closedAt="2026-09-22T10:40:00Z"
      report={data}
      view={view}
    />,
  );

describe("SessionReportView", () => {
  it("heads the page with the session and when it closed", () => {
    renderView("students");
    expect(screen.getByRole("heading", { level: 1, name: "Cardiac week 3" })).toBeInTheDocument();
    expect(screen.getByText(/Sep 22, 2026/)).toBeInTheDocument();
  });

  it("switches views with links that keep the view in the address", () => {
    renderView("items");
    const nav = screen.getByRole("navigation", { name: "Report views" });
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report`,
    );
    expect(within(nav).getByRole("link", { name: "Clinical judgment steps" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=steps`,
    );
    expect(within(nav).getByRole("link", { name: "Questions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("offers the CSV as a download", () => {
    renderView("students");
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report/csv`,
    );
  });

  it("puts every table in a named region that can be scrolled from the keyboard", () => {
    renderView("students");
    const region = screen.getByRole("region", { name: "Scores by student" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-x-auto");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });

  it("shows each student's score per item, a dash where they did not answer, and the total", () => {
    renderView("students");
    const row = screen.getByRole("row", { name: /^Ben/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["0", "2", "–", "–", "2 / 6", "33%"]);
  });

  it("shows a formula-looking display name as plain text", () => {
    renderView("students");
    expect(screen.getByRole("rowheader", { name: "=cmd|' /C calc'!A0" })).toBeInTheDocument();
  });

  // #563: a teacher knows a question by its text, not by the ref an author never sees.
  it("names each question column by its number and the start of its text", () => {
    renderView("students");
    const full =
      "Q1 Which of the client's vital signs should the nurse report to the provider first?";
    const head = screen.getByRole("columnheader", { name: full });
    expect(head).toHaveAttribute("scope", "col");
    expect(head).toHaveAttribute("title", full);
    // The eye reads the number over about 60 characters of the text, cut with an ellipsis.
    const shown = head.querySelector("[aria-hidden='true']");
    expect(shown).toHaveTextContent(
      "Q1 Which of the client's vital signs should the nurse report t…",
    );
    expect(screen.queryByText(/mc-vitals/)).toBeNull();
  });

  it("names a question whose text was not read by its number and ref, as before", () => {
    renderView("students");
    expect(screen.getByRole("columnheader", { name: "Q4 untagged" })).toHaveAttribute(
      "title",
      "Q4 untagged",
    );
  });

  it("keeps every column header in one row when no case study was played", () => {
    renderView("students");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const head = rows[0] as HTMLElement;
    expect(head.closest("thead")?.querySelectorAll("tr")).toHaveLength(1);
    expect(within(head).queryAllByRole("cell")).toEqual([]);
  });

  it("shows how each item went", () => {
    renderView("items");
    const row = screen.getByRole("row", { name: /^Q2/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["Step 1", "2 of 4", "2.5 / 3", "83%", "1", "1", "0"]);
  });

  it("shows the class at each tagged CJMM step", () => {
    renderView("steps");
    const row = screen.getByRole("row", { name: /Recognize Cues/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["2", "5", "75%"]);
    expect(screen.queryByRole("row", { name: /Analyze Cues/ })).toBeNull();
    expect(screen.getByText(/1 question without a step is left out/)).toBeInTheDocument();
  });

  it("says so when no item carries a step", () => {
    renderView(
      "steps",
      buildSessionReport({
        ...REPORT_FIXTURE,
        items: REPORT_FIXTURE.items.map((item) => ({ ...item, cjmmStep: null })),
      }),
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByText("No questions are tagged with a clinical judgment step."),
    ).toBeInTheDocument();
  });

  it("says so when nobody joined", () => {
    renderView("students", buildSessionReport({ ...REPORT_FIXTURE, participants: [] }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Nobody joined" })).toBeInTheDocument();
  });
});

describe("SessionReportView for a quiz that played a case study in place (#469)", () => {
  const mixed = buildSessionReport({
    ...REPORT_FIXTURE,
    items: inCaseStudies(REPORT_FIXTURE.items, [
      { caseStudyId: "c-1", title: "Hip arthroplasty", firstPosition: 2, stepCount: 2 },
    ]),
  });

  it("groups the case study's steps under its title in the questions view", () => {
    renderView("items", mixed);
    const table = screen.getByRole("table");
    const group = within(table).getByRole("rowheader", { name: "Case study: Hip arthroplasty" });
    expect(group).toHaveAttribute("scope", "rowgroup");
    const groupBody = group.closest("tbody") as HTMLElement;
    const names = within(groupBody).getAllByRole("rowheader");
    expect(names).toHaveLength(3);
    expect(names[0]).toHaveAccessibleName("Case study: Hip arthroplasty");
    expect(names[1]).toHaveAccessibleName("Q2 Select the findings that need follow-up.");
    expect(names[2]).toHaveAccessibleName(
      "Q3 Complete the diagram: the condition, two actions, and two parameters to monitor.",
    );
  });

  it("heads the case study's columns with its title in the students view", () => {
    renderView("students", mixed);
    const heading = screen.getByRole("columnheader", { name: "Case study: Hip arthroplasty" });
    expect(heading).toHaveAttribute("colspan", "2");
    expect(
      screen.getByRole("columnheader", { name: "Q2 Select the findings that need follow-up." }),
    ).toBeInTheDocument();
  });

  // #563: no empty band over the other columns; each of them heads both rows.
  it("spans every other header over both rows, so no header row has an empty cell", () => {
    renderView("students", mixed);
    const head = screen.getByRole("table").querySelector("thead") as HTMLElement;
    expect(head.querySelectorAll("tr")).toHaveLength(2);
    expect(head.querySelectorAll("td")).toHaveLength(0);
    for (const name of ["Student", "Total", "Percent", "Q4 untagged"]) {
      expect(within(head).getByRole("columnheader", { name })).toHaveAttribute("rowspan", "2");
    }
    expect(within(head).getByRole("columnheader", { name: "Student" })).toHaveClass("sticky");
  });

  it("has no case study heading for a quiz of loose questions", () => {
    renderView("students");
    expect(screen.queryByText(/Case study:/)).toBeNull();
  });
});
