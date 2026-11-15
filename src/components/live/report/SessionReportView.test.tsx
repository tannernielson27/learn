import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildSessionReport, inCaseStudies } from "@/lib/live/report";
import { REPORT_FIXTURE } from "@/lib/live/reportFixture";
import type { StudentViewOptions } from "@/lib/live/reportFormat";
import { SessionReportView } from "./SessionReportView";

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const report = buildSessionReport(REPORT_FIXTURE);

const GRID = { layout: "grid", sort: "name" } as const;

const renderView = (
  view: "students" | "items" | "steps",
  data = report,
  studentOptions?: StudentViewOptions,
) =>
  render(
    <SessionReportView
      sessionId={SESSION}
      title="Cardiac week 3"
      closedAt="2026-09-22T10:40:00Z"
      report={data}
      view={view}
      studentOptions={studentOptions}
    />,
  );

describe("SessionReportView", () => {
  it("heads the page with the session and when it closed", () => {
    renderView("students");
    expect(screen.getByRole("heading", { level: 1, name: "Cardiac week 3" })).toBeInTheDocument();
    expect(screen.getByText(/Sep 22, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to live sessions" })).toHaveAttribute(
      "href",
      "/author/sessions",
    );
  });

  it("switches views with links that keep the view in the address", () => {
    renderView("items");
    const nav = screen.getByRole("navigation", { name: "Report views" });
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=students`,
    );
    expect(within(nav).getByRole("link", { name: "Clinical judgment steps" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=steps`,
    );
    const questions = within(nav).getByRole("link", { name: "Questions" });
    expect(questions).toHaveAttribute("href", `/live/${SESSION}/report`);
    expect(questions).toHaveAttribute("aria-current", "page");
  });

  it("puts Questions first, the view the report opens on (#565)", () => {
    renderView("items");
    const nav = screen.getByRole("navigation", { name: "Report views" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Questions", "Students", "Clinical judgment steps"]);
  });

  it("sums the session up above the tabs and links the hardest question to its row", () => {
    renderView("items");
    expect(screen.getByText("Class average")).toBeInTheDocument();
    const hardest = screen.getByText("Hardest question").parentElement as HTMLElement;
    const link = within(hardest).getByRole("link");
    expect(link.getAttribute("href")).toMatch(
      new RegExp(`^/live/${SESSION}/report#question-\\d+$`),
    );
    const anchor = link.getAttribute("href")?.split("#")[1] ?? "";
    expect(document.getElementById(anchor)?.tagName).toBe("TR");
  });

  it("has no summary when nobody joined", () => {
    renderView("items", buildSessionReport({ ...REPORT_FIXTURE, participants: [] }));
    expect(screen.queryByText("Class average")).toBeNull();
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
    renderView("students", report, GRID);
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

  it("shows each item column as its number, and names it by number, type and step", () => {
    renderView("students", report, GRID);
    const head = screen.getByRole("columnheader", {
      name: "Q1 · Multiple Choice · Recognize Cues",
    });
    expect(head).toHaveTextContent(/^Q1$/);
    // The tooltip adds the question's own words (#563); the name stays number, type and step.
    expect(head).toHaveAttribute(
      "title",
      "Q1 · Multiple Choice · Recognize Cues: Which of the client's vital signs should the nurse report to the provider first?",
    );
    // The internal id is for the CSV and a tooltip, never the column name.
    expect(screen.queryByRole("columnheader", { name: /mc-vitals/ })).toBeNull();
  });

  it("says in one line what each table shows", () => {
    renderView("students", report, GRID);
    expect(screen.getByText(/Points each student earned on each question/)).toBeInTheDocument();
  });

  it("shows a compact row per student by default: score, percent and a mark per question (#565)", () => {
    renderView("students");
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Student",
      "Score",
      "Percent",
      "Each question",
    ]);
    const row = screen.getByRole("row", { name: /^Ben/ });
    const cells = within(row).getAllByRole("cell");
    expect(cells.slice(0, 2).map((cell) => cell.textContent)).toEqual(["2 / 6", "33%"]);
    // The marks are heard once as a sentence, not one by one.
    expect(cells[2]).toHaveTextContent("0 all right, 1 some right, 1 none right, 2 not answered");
  });

  it("names each mark in a tooltip and keeps them out of the accessibility tree", () => {
    renderView("students");
    const row = screen.getByRole("row", { name: /^Ben/ });
    const marks = row.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(marks.children).toHaveLength(report.items.length);
    expect(marks.children[2]).toHaveAttribute("title", expect.stringMatching(/not answered$/));
  });

  it("sorts by score, highest first, from a link that keeps the choice in the address", () => {
    renderView("students", report, { layout: "compact", sort: "score" });
    const names = screen.getAllByRole("rowheader").map((cell) => cell.textContent);
    const percents = report.students
      .filter((student) => names.includes(student.displayName))
      .map((student) => student.percent);
    expect(percents).toHaveLength(names.length);
    const shown = names.map(
      (name) => report.students.find((student) => student.displayName === name)?.percent ?? -1,
    );
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
    const sort = screen.getByRole("navigation", { name: "Sort students" });
    expect(within(sort).getByRole("link", { name: "By score" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sort).getByRole("link", { name: "By name" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=students`,
    );
  });

  it("offers the full table of points, and the way back from it", () => {
    renderView("students");
    expect(screen.getByRole("link", { name: "Show points for every question" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=students&layout=grid`,
    );
    cleanup();
    renderView("students", report, GRID);
    expect(screen.getByRole("link", { name: "Show the summary instead" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=students`,
    );
  });

  it("shows how each item went", () => {
    renderView("items");
    const row = screen.getByRole("row", { name: /^Q2/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["1 · Recognize Cues", "2", "2.5 / 3", "83%", "1", "1", "0"]);
  });

  it("heads the questions view in plain words", () => {
    renderView("items");
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Question",
      "Step",
      "Answered (of 4)",
      "Average",
      "Average %",
      "All right",
      "Some right",
      "None right",
    ]);
    expect(screen.getByText(/How the class did on each question/)).toBeInTheDocument();
  });

  it("names each question by number and type, with its step in its own column and its id only in a tooltip", () => {
    renderView("items");
    const head = screen.getByRole("rowheader", {
      name: "Q2 · Extended Multiple Response",
    });
    expect(head).toHaveAttribute("title", "Question id: mr-assess");
    expect(screen.getByRole("rowheader", { name: "Q4 · Drop-Down Cloze" })).toBeInTheDocument();
  });

  it("shows the class at each tagged CJMM step", () => {
    renderView("steps");
    const row = screen.getByRole("row", { name: /Recognize Cues/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["2", "5", "75%"]);
    expect(screen.getByRole("columnheader", { name: "Average %" })).toBeInTheDocument();
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
    expect(screen.getByText("Nobody joined.")).toBeInTheDocument();
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
    expect(
      within(groupBody)
        .getAllByRole("rowheader")
        .map((cell) => cell.firstChild?.textContent),
    ).toEqual(["Case study: Hip arthroplasty", "Q2 · Extended Multiple Response", "Q3 · Bowtie"]);
  });

  it("heads the case study's columns with its title in the students view", () => {
    renderView("students", mixed, GRID);
    const heading = screen.getByRole("columnheader", { name: "Case study: Hip arthroplasty" });
    expect(heading).toHaveAttribute("colspan", "2");
    expect(
      screen.getByRole("columnheader", {
        name: "Q2 · Extended Multiple Response · Recognize Cues",
      }),
    ).toBeInTheDocument();
  });

  it("has no case study heading for a quiz of loose questions", () => {
    renderView("students");
    expect(screen.queryByText(/Case study:/)).toBeNull();
  });
});
