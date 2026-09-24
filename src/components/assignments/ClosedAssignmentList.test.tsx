import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatInZone } from "@/lib/classes/timeZone";
import { ClosedAssignmentList } from "./ClosedAssignmentList";

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const ENTRY = {
  id: "a1",
  classId: CLASS_ID,
  title: "Cardiac bank",
  opensAt: "2026-09-20T15:00:00.000Z",
  closesAt: "2026-09-22T23:00:00.000Z",
  maxAttempts: 2,
  shuffleOptions: true,
};
const NUR_310 = { name: "NUR 310", timeZone: "America/New_York" };

describe("ClosedAssignmentList (#210)", () => {
  it("says so when nothing has closed", () => {
    render(<ClosedAssignmentList assignments={[]} classes={new Map()} />);
    expect(screen.getByText("Nothing has closed yet.")).toBeInTheDocument();
  });

  it("links each closed assignment to its results, with its class and close time", () => {
    render(
      <ClosedAssignmentList
        assignments={[ENTRY, { ...ENTRY, id: "a2", title: "Renal bank", classId: "other" }]}
        classes={new Map([[CLASS_ID, NUR_310]])}
      />,
    );
    const list = screen.getByRole("list", { name: "Closed assignments" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("NUR 310");
    expect(first).toHaveTextContent(`Closed ${formatInZone(ENTRY.closesAt, "America/New_York")}`);
    expect(first).toHaveTextContent("Closed Tue 22 Sep 2026, 19:00 EDT");
    expect(second).toHaveTextContent("Your class");
    // A class the list does not know is shown on the default zone, still labelled.
    expect(second).toHaveTextContent("Closed Tue 22 Sep 2026, 17:00 MDT");
    expect(screen.getByRole("link", { name: "Results for Cardiac bank" })).toHaveAttribute(
      "href",
      "/learn/assignments/a1/results",
    );
  });
});
