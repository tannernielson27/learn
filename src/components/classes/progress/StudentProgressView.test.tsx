import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CLASS_PAGE_FIXTURE_CLASS } from "@/lib/classes/classPageFixture";
import { PROGRESS_FIXTURE, PROGRESS_FIXTURE_REMOVED } from "@/lib/classes/classProgressFixture";
import { buildClassProgress } from "@/lib/classes/progress";
import { studentProgress } from "@/lib/classes/studentProgress";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import { StudentProgressView } from "./StudentProgressView";

const CLASS = CLASS_PAGE_FIXTURE_CLASS.id;
const PROGRESS = buildClassProgress(PROGRESS_FIXTURE);
const KAI = "00000000-0000-4000-8000-0000000000a2";

function renderStudent(profileId = KAI) {
  const progress = studentProgress(PROGRESS, profileId);
  if (!progress) throw new Error("not in the fixture");
  return render(
    <StudentProgressView
      classId={CLASS}
      className={CLASS_PAGE_FIXTURE_CLASS.name}
      progress={progress}
    />,
  );
}

describe("StudentProgressView", () => {
  it("names the student, with the way back to the class's Progress tab", () => {
    renderStudent();
    expect(screen.getByRole("heading", { level: 1, name: "Kai Ortiz" })).toBeVisible();
    expect(screen.getByText("kai.ortiz@example.test")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "NUR 310 Adult Health, Fall: Progress" }),
    ).toHaveAttribute("href", `/author/classes/${CLASS}?tab=progress`);
  });

  it("says the overall percent and the attendance", () => {
    renderStudent();
    const stats = screen.getByText("Overall").closest("dl") as HTMLElement;
    expect(stats).toHaveTextContent("Overall52%");
    expect(stats).toHaveTextContent("Live sessions attended2 of 3");
    expect(stats).toHaveTextContent("Assignments submitted1");
  });

  it("draws the steps weakest first", () => {
    renderStudent();
    const bars = screen.getByRole("region", { name: "Weakest first" });
    expect(
      within(bars)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Step 2: Analyze Cues40%",
      "Step 4: Generate Solutions45%",
      "Step 3: Prioritize Hypotheses55%",
      "Step 1: Recognize Cues60%",
    ]);
  });

  it("lists every live session and assignment newest first, each with its result and report", () => {
    renderStudent();
    const timeline = screen.getByRole("heading", {
      level: 2,
      name: "Live sessions and assignments",
    }).nextElementSibling as HTMLElement;
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items.map((item) => within(item).getByTestId("timeline-result").textContent)).toEqual([
      "Not open",
      "Not started",
      "45%",
      "52%",
      "Absent",
      "60%",
    ]);
    expect(
      within(items[2] as HTMLElement).getByRole("link", {
        name: "Open the live session report: Heart failure review",
      }),
    ).toHaveAttribute("href", "/live/00000000-0000-4000-8000-0000000000e3/report");
    expect(
      within(items[3] as HTMLElement).getByRole("link", {
        name: "Open the assignment report: Week 6: Fluid and electrolytes",
      }),
    ).toHaveAttribute("href", "/author/assignments/00000000-0000-4000-8000-0000000000b1/report");
  });

  it("says so for a student taken off the class", () => {
    renderStudent(PROGRESS_FIXTURE_REMOVED.profileId);
    expect(screen.getByText(/Taken off this class/)).toBeVisible();
  });

  it("says when a student has no step yet, and gives no address twice for an unnamed student", () => {
    renderStudent("00000000-0000-4000-8000-0000000000a4");
    expect(
      screen.getByText("No answered question is tagged with a clinical judgment step yet."),
    ).toBeVisible();
    expect(screen.getAllByText("sam.lee@example.test")).toHaveLength(1);
  });

  it("uses only the glossary's words", () => {
    const { container } = renderStudent();
    expect(findRetiredTerms(container.innerHTML)).toEqual([]);
  });
});
