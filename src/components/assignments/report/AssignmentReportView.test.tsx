import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildAssignmentReport, type AssignmentReportInput } from "@/lib/assignments/report";
import { AssignmentReportView } from "./AssignmentReportView";

const ASSIGNMENT = "00000000-0000-4000-8000-0000000002a1";
const CLASS = "00000000-0000-4000-8000-0000000002c1";
const ITEM_A = "00000000-0000-4000-8000-00000000021a";
const ITEM_B = "00000000-0000-4000-8000-00000000021b";

const INPUT: AssignmentReportInput = {
  released: true,
  items: [
    { position: 1, itemId: ITEM_A, ref: "mc-hf", type: "multiple_choice", cjmmStep: 1 },
    { position: 2, itemId: ITEM_B, ref: "mr-hf", type: "multiple_response", cjmmStep: null },
  ],
  students: [
    { id: "s-ava", displayName: "Ava" },
    { id: "s-ben", displayName: "Ben" },
    { id: "s-cleo", displayName: "Cleo" },
  ],
  attempts: [
    {
      studentId: "s-ava",
      id: "ava-1",
      number: 1,
      submittedAt: "2026-09-23T10:00:00Z",
      score: 1.5,
      maxScore: 2,
      marks: [
        { itemId: ITEM_A, points: 1, maxPoints: 1 },
        { itemId: ITEM_B, points: 0.5, maxPoints: 1 },
      ],
    },
    {
      studentId: "s-ava",
      id: "ava-2",
      number: 2,
      submittedAt: "2026-09-23T11:00:00Z",
      score: 0,
      maxScore: 2,
      marks: [],
    },
    {
      studentId: "s-ben",
      id: "ben-1",
      number: 1,
      submittedAt: null,
      score: null,
      maxScore: null,
      marks: null,
    },
  ],
};

const renderView = (view: "students" | "items" | "steps", released = true) =>
  render(
    <AssignmentReportView
      assignmentId={ASSIGNMENT}
      classId={CLASS}
      title="Week 5: Heart failure"
      closesAt="2026-09-23T17:00:00Z"
      maxAttempts={2}
      report={buildAssignmentReport({ ...INPUT, released })}
      view={view}
    />,
  );

describe("AssignmentReportView, once closed", () => {
  it("heads the page with the assignment and leads back to its class", () => {
    renderView("students");
    expect(
      screen.getByRole("heading", { level: 1, name: "Week 5: Heart failure" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to class" })).toHaveAttribute(
      "href",
      `/author/classes/${CLASS}`,
    );
  });

  it("switches views with links that keep the view in the address", () => {
    renderView("items");
    const nav = screen.getByRole("navigation", { name: "Report views" });
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute(
      "href",
      `/author/assignments/${ASSIGNMENT}/report`,
    );
    expect(within(nav).getByRole("link", { name: "CJMM steps" })).toHaveAttribute(
      "href",
      `/author/assignments/${ASSIGNMENT}/report?view=steps`,
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
      `/author/assignments/${ASSIGNMENT}/report/csv`,
    );
  });

  it("lists each student's status, best score and attempts used", () => {
    renderView("students");
    const region = screen.getByRole("region", { name: "Scores by student" });
    expect(region).toHaveAttribute("tabindex", "0");
    const ava = within(region).getByRole("row", { name: /^Ava/ });
    expect(within(ava).getByText("Submitted")).toBeInTheDocument();
    expect(within(ava).getByText("1.5 / 2")).toBeInTheDocument();
    expect(within(ava).getByText("75%")).toBeInTheDocument();
    expect(within(ava).getByText("2 of 2")).toBeInTheDocument();
    const cleo = within(region).getByRole("row", { name: /^Cleo/ });
    expect(within(cleo).getByText("Not started")).toBeInTheDocument();
    expect(within(cleo).getByText("0 of 2")).toBeInTheDocument();
  });

  it("shows items with the percent fully correct", () => {
    renderView("items");
    const region = screen.getByRole("region", { name: "Results by item" });
    expect(within(region).getByRole("columnheader", { name: "Correct" })).toBeInTheDocument();
    const first = within(region).getByRole("row", { name: /^Q1 mc-hf/ });
    expect(within(first).getAllByText("100%").length).toBeGreaterThan(0);
  });

  it("shows the CJMM steps", () => {
    renderView("steps");
    expect(screen.getByRole("region", { name: "Results by CJMM step" })).toBeInTheDocument();
    expect(screen.getByText("Step 1: Recognize Cues")).toBeInTheDocument();
  });
});

describe("AssignmentReportView, while open", () => {
  it("shows progress only: status and attempts, no score and no CSV", () => {
    const { container } = renderView("students", false);
    const region = screen.getByRole("region", { name: "Progress by student" });
    const ava = within(region).getByRole("row", { name: /^Ava/ });
    expect(within(ava).getByText("Submitted")).toBeInTheDocument();
    expect(within(region).getByRole("row", { name: /^Ben/ })).toHaveTextContent("In progress");
    expect(container.textContent).not.toMatch(/%|1\.5/);
    expect(screen.queryByRole("link", { name: "Download CSV" })).toBeNull();
    expect(screen.getByText(/1 submitted · 1 in progress · 1 not started/)).toBeInTheDocument();
  });

  it("says items and steps wait for the close", () => {
    renderView("items", false);
    expect(screen.queryByRole("table")).toBeNull();
    const section = screen.getByRole("region", { name: "Items" });
    expect(within(section).getByText(/Scores show here once the assignment closes/)).toBeVisible();
  });
});

describe("AssignmentReportView, with nobody in the class", () => {
  it("says so rather than showing an empty table", () => {
    render(
      <AssignmentReportView
        assignmentId={ASSIGNMENT}
        classId={CLASS}
        title="Week 5"
        closesAt="2026-09-23T17:00:00Z"
        maxAttempts={1}
        report={buildAssignmentReport({ ...INPUT, students: [], attempts: [] })}
        view="students"
      />,
    );
    expect(screen.getByText(/Nobody has joined this class yet/)).toBeInTheDocument();
  });
});
