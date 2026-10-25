import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LiveHistoryRow } from "@/lib/learn/liveHistory";
import { LiveSessionHistory } from "./LiveSessionHistory";

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const NUR_310 = { name: "NUR 310", timeZone: "America/New_York" };

const ROW: LiveHistoryRow = {
  id: "s1",
  title: "Cardiac quiz",
  classId: CLASS_ID,
  className: "NUR 310 (old name)",
  closedAt: "2026-10-27T15:00:00.000Z",
  points: 2,
  possible: 4,
  percent: 50,
  answered: 2,
  questionCount: 3,
};

function renderRows(rows: readonly LiveHistoryRow[]) {
  render(<LiveSessionHistory rows={rows} classes={new Map([[CLASS_ID, NUR_310]])} />);
}

describe("LiveSessionHistory", () => {
  it("says so when no live session has ended", () => {
    renderRows([]);
    expect(
      screen.getByRole("heading", { level: 3, name: "No live sessions yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows the title, class, end time, score and answered count, linking to the results", () => {
    renderRows([ROW]);
    const list = screen.getByRole("list", { name: "Live session history" });
    const [row] = within(list).getAllByRole("listitem");
    expect(row).toHaveTextContent("NUR 310");
    expect(row).not.toHaveTextContent("old name");
    expect(row).toHaveTextContent("Ended Tue 27 Oct 2026, 11:00 EDT");
    expect(within(row as HTMLElement).getByTestId("live-history-score")).toHaveTextContent(
      "Score 2 of 4 (50%)",
    );
    expect(row).toHaveTextContent("Answered 2 of 3 questions");
    expect(screen.getByRole("link", { name: "Results for Cardiac quiz" })).toHaveAttribute(
      "href",
      "/learn/live/s1",
    );
  });

  it("names a class the student is no longer in as the session has it, in the default zone", () => {
    renderRows([{ ...ROW, classId: "gone", className: "NUR 220" }]);
    const [row] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(row).toHaveTextContent("NUR 220");
    expect(row).toHaveTextContent(/Ended .*2026/);
  });

  it("leaves the class out when it has been deleted", () => {
    renderRows([{ ...ROW, classId: null, className: null }]);
    const [row] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(row?.textContent).toMatch(/^Results for Cardiac quizEnded/);
  });

  it("has no percent when nothing was worth anything", () => {
    renderRows([{ ...ROW, points: 0, possible: 0, percent: null }]);
    expect(screen.getByTestId("live-history-score")).toHaveTextContent("Score 0 of 0");
    expect(screen.getByTestId("live-history-score")).not.toHaveTextContent("%");
  });

  it("lists sessions in the order given", () => {
    renderRows([ROW, { ...ROW, id: "s2", title: "Respiratory quiz" }]);
    expect(
      within(screen.getByRole("list"))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Results for Cardiac quiz", "Results for Respiratory quiz"]);
  });
});
