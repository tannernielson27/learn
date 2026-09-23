import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildSessionReport } from "@/lib/live/report";
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
    expect(within(nav).getByRole("link", { name: "CJMM steps" })).toHaveAttribute(
      "href",
      `/live/${SESSION}/report?view=steps`,
    );
    expect(within(nav).getByRole("link", { name: "Items" })).toHaveAttribute(
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

  it("names each item column by position and item id", () => {
    renderView("students");
    expect(screen.getByRole("columnheader", { name: "Q1 mc-vitals" })).toBeInTheDocument();
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
    expect(screen.getByText(/1 item without a step is left out/)).toBeInTheDocument();
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
      screen.getByText(/No item in this session is tagged with a CJMM step/),
    ).toBeInTheDocument();
  });

  it("says so when nobody joined", () => {
    renderView("students", buildSessionReport({ ...REPORT_FIXTURE, participants: [] }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nobody joined this session.")).toBeInTheDocument();
  });
});
