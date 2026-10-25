import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CLASS_PAGE_FIXTURE_CLASS } from "@/lib/classes/classPageFixture";
import { PROGRESS_FIXTURE, PROGRESS_FIXTURE_EMPTY } from "@/lib/classes/classProgressFixture";
import { buildClassProgress, type ProgressSort } from "@/lib/classes/progress";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import { ClassProgressPanel } from "./ClassProgressPanel";

const CLASS = CLASS_PAGE_FIXTURE_CLASS.id;
const PROGRESS = buildClassProgress(PROGRESS_FIXTURE);

function renderPanel(sort: ProgressSort = "name", progress = PROGRESS) {
  return render(<ClassProgressPanel classId={CLASS} progress={progress} sort={sort} />);
}

const grid = () => screen.getByRole("region", { name: "Progress by student" });
const rowNames = (region: HTMLElement) =>
  within(region)
    .getAllByRole("rowheader")
    .map((cell) => cell.textContent);

describe("ClassProgressPanel", () => {
  it("draws a table of students by live sessions and assignments, scrolling in its own region", () => {
    renderPanel();
    const region = grid();
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-x-auto");
    const table = within(region).getByRole("table", { name: "Progress by student" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers.slice(0, 3)).toEqual(["Student", "Overall", "Attended"]);
    expect(headers[3]).toContain("Live session");
    expect(headers[3]).toContain("Fluid balance warm-up");
    expect(headers[5]).toContain("Assignment");
    expect(headers).toHaveLength(3 + 6);
    expect(rowNames(region)).toEqual([
      "Ana Reyes",
      "Kai Ortiz",
      "Priya Shah",
      "sam.lee@example.test",
    ]);
  });

  it("says every cell in words, so its shading is never the only cue", () => {
    renderPanel();
    const kai = within(grid()).getByRole("row", { name: /Kai Ortiz/ });
    expect(
      within(kai)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["52%", "2 of 3", "60%", "Absent", "52%", "45%", "Not started", "Not open"]);
    for (const cell of within(grid()).getAllByTestId("progress-cell")) {
      expect(cell.textContent?.trim()).not.toBe("");
    }
  });

  it("shades a cell by its percent, in the neutral ink, and leaves one without a percent clear", () => {
    renderPanel();
    const kai = within(grid()).getByRole("row", { name: /Kai Ortiz/ });
    const [first, absent] = within(kai).getAllByTestId("progress-cell");
    const layer = (cell: HTMLElement | undefined) =>
      cell?.querySelector<HTMLElement>("[aria-hidden='true']");
    expect(layer(first)?.className).toContain("bg-ink-2");
    expect(Number(layer(first)?.style.opacity)).toBeCloseTo(0.6 * 0.32);
    expect(Number(layer(absent)?.style.opacity)).toBe(0);
  });

  it("links each student to their own page", () => {
    renderPanel();
    expect(within(grid()).getByRole("link", { name: "Kai Ortiz" })).toHaveAttribute(
      "href",
      `/author/classes/${CLASS}/students/00000000-0000-4000-8000-0000000000a2`,
    );
  });

  it("sorts by overall, lowest first, from a link that keeps the sort in the address", () => {
    renderPanel("overall");
    expect(rowNames(grid())).toEqual([
      "Kai Ortiz",
      "Priya Shah",
      "Ana Reyes",
      "sam.lee@example.test",
    ]);
    const sorts = screen.getByRole("navigation", { name: "Sort students" });
    expect(within(sorts).getByRole("link", { current: "page" })).toHaveTextContent(
      "Overall, lowest first",
    );
    expect(within(sorts).getByRole("link", { name: "Sort by Name" })).toHaveAttribute(
      "href",
      `/author/classes/${CLASS}?tab=progress`,
    );
    expect(
      within(sorts).getByRole("link", { name: "Sort by Overall, lowest first" }),
    ).toHaveAttribute("href", `/author/classes/${CLASS}?tab=progress&sort=overall`);
  });

  it("names the students with the lowest overall first", () => {
    renderPanel();
    const lowest = screen.getByRole("heading", { level: 3, name: "Lowest overall" })
      .parentElement as HTMLElement;
    expect(
      within(lowest)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Kai Ortiz52%", "Priya Shah70%", "Ana Reyes86%"]);
  });

  it("draws the class's mean by step in the reports' bars", () => {
    renderPanel();
    const bars = screen.getByRole("region", { name: "Class mean by clinical judgment step" });
    expect(
      within(bars)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Step 1: Recognize Cues75%",
      "Step 2: Analyze Cues63%",
      "Step 3: Prioritize Hypotheses68%",
      "Step 4: Generate Solutions67%",
      "Step 6: Evaluate Outcomes92%",
    ]);
  });

  it("keeps a removed student out of the class's grid, in a grid of their own", () => {
    renderPanel();
    expect(rowNames(grid())).not.toContain("Jordan Blake");
    expect(rowNames(screen.getByRole("region", { name: "Students taken off the class" }))).toEqual([
      "Jordan Blake",
    ]);
  });

  it("offers the grid as CSV", () => {
    renderPanel();
    const link = screen.getByRole("link", { name: "Download CSV" });
    expect(link).toHaveAttribute("href", `/author/classes/${CLASS}/progress/csv`);
    expect(link).toHaveAttribute("download");
  });

  it("explains how to run a live session for the class when there is nothing yet", () => {
    renderPanel("name", buildClassProgress(PROGRESS_FIXTURE_EMPTY));
    expect(
      screen.getByRole("heading", { level: 3, name: "No live sessions or assignments yet" }),
    ).toBeVisible();
    expect(screen.getByText(/Start a live session for this class: choose a quiz/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Start a live session" })).toHaveAttribute(
      "href",
      `/author/classes/${CLASS}/start`,
    );
    expect(screen.queryByRole("link", { name: "Download CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("points a class with activities and no students at the roster", () => {
    renderPanel("name", { ...PROGRESS, students: [], removed: [] });
    expect(
      screen.getByRole("heading", { level: 3, name: "No students in this class yet" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to the roster" })).toHaveAttribute(
      "href",
      `/author/classes/${CLASS}?tab=students`,
    );
  });

  it("says when nobody has a score or a step yet", () => {
    const unscored = buildClassProgress({
      rows: PROGRESS_FIXTURE.rows.map((row) => ({ ...row, percent: null })),
      steps: [],
    });
    renderPanel("name", unscored);
    expect(screen.getByText("No student has a score yet.")).toBeVisible();
    expect(
      screen.getByText(
        "No answered question in this class is tagged with a clinical judgment step yet.",
      ),
    ).toBeVisible();
  });

  it("says the progress could not be loaded rather than showing an empty class", () => {
    render(<ClassProgressPanel classId={CLASS} progress={null} sort="name" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The progress could not be loaded. Reload the page to try again.",
    );
  });

  it("uses only the glossary's words", () => {
    const { container } = renderPanel();
    expect(findRetiredTerms(container.innerHTML)).toEqual([]);
  });
});
