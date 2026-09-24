import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HistoryRow } from "@/lib/assignments/history";
import { AssignmentHistory } from "./AssignmentHistory";

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const NUR_310 = { name: "NUR 310", timeZone: "America/New_York" };

const ROW: HistoryRow = {
  id: "a1",
  classId: CLASS_ID,
  title: "Cardiac bank",
  closesAt: "2026-09-22T23:00:00.000Z",
  maxAttempts: 2,
  attemptsUsed: 2,
  standing: {
    kind: "scored",
    best: { attemptNumber: 2, score: 3.5, maxScore: 4, percent: 87.5 },
  },
};

function renderRows(rows: readonly HistoryRow[]) {
  render(<AssignmentHistory rows={rows} classes={new Map([[CLASS_ID, NUR_310]])} />);
}

describe("AssignmentHistory (#238)", () => {
  it("says so when nothing has closed", () => {
    renderRows([]);
    expect(screen.getByText(/Nothing has closed yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows the title, class, close time, best score, attempts and a link to the results", () => {
    renderRows([ROW]);
    const list = screen.getByRole("list", { name: "Assignment history" });
    const [row] = within(list).getAllByRole("listitem");
    expect(row).toHaveTextContent("NUR 310");
    expect(row).toHaveTextContent("Closed Tue 22 Sep 2026, 19:00 EDT");
    expect(within(row as HTMLElement).getByTestId("history-score")).toHaveTextContent(
      "Best score 3.5 of 4 (88%)",
    );
    expect(row).toHaveTextContent("2 of 2 attempts used");
    expect(screen.getByRole("link", { name: "Results for Cardiac bank" })).toHaveAttribute(
      "href",
      "/learn/assignments/a1/results",
    );
  });

  it("marks one never started as not attempted, with no score", () => {
    renderRows([{ ...ROW, attemptsUsed: 0, standing: { kind: "not_attempted" } }]);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Not attempted");
    expect(within(row).queryByTestId("history-score")).toBeNull();
    expect(row).not.toHaveTextContent("attempts used");
  });

  it("says an attempt is not marked yet", () => {
    renderRows([{ ...ROW, attemptsUsed: 1, standing: { kind: "unmarked" } }]);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Not marked yet");
    expect(row).toHaveTextContent("1 of 2 attempts used");
  });

  it("leaves the percent off when the attempt was worth nothing", () => {
    renderRows([
      {
        ...ROW,
        attemptsUsed: 1,
        maxAttempts: 1,
        standing: {
          kind: "scored",
          best: { attemptNumber: 1, score: 0, maxScore: 0, percent: null },
        },
      },
    ]);
    expect(screen.getByTestId("history-score")).toHaveTextContent(/^Best score 0 of 0$/);
    expect(screen.getByRole("listitem")).toHaveTextContent("1 of 1 attempt used");
  });

  it("names a class it does not know, on the default zone", () => {
    render(<AssignmentHistory rows={[{ ...ROW, classId: "other" }]} classes={new Map()} />);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Your class");
    expect(row).toHaveTextContent("Closed Tue 22 Sep 2026, 17:00 MDT");
  });
});
