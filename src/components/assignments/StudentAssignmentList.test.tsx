import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatInZone } from "@/lib/classes/timeZone";
import { StudentAssignmentList } from "./StudentAssignmentList";

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const ENTRY = {
  id: "a1",
  classId: CLASS_ID,
  title: "Cardiac bank",
  opensAt: "2026-09-23T15:00:00.000Z",
  closesAt: "2026-09-24T23:00:00.000Z",
  maxAttempts: 2,
  shuffleOptions: true,
};
const NUR_310 = { name: "NUR 310", timeZone: "America/New_York" };

describe("StudentAssignmentList", () => {
  it("says so when nothing is open", () => {
    render(<StudentAssignmentList assignments={[]} classes={new Map()} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Nothing is open right now" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/appear here while they are open/)).toBeInTheDocument();
  });

  it("lists what is open, with its class, its close time and its attempts", () => {
    render(
      <StudentAssignmentList assignments={[ENTRY]} classes={new Map([[CLASS_ID, NUR_310]])} />,
    );
    const item = within(screen.getByRole("list", { name: "Open assignments" })).getByRole(
      "listitem",
    );
    expect(item).toHaveTextContent("Cardiac bank");
    expect(item).toHaveTextContent("NUR 310");
    expect(item).toHaveTextContent(`Closes ${formatInZone(ENTRY.closesAt, "America/New_York")}`);
    // In the class's zone (#242), whatever zone the viewer's device is on.
    expect(item).toHaveTextContent("Closes Thu 24 Sep 2026, 19:00 EDT");
    expect(within(item).getByText(/19:00 EDT/)).toHaveAttribute("datetime", ENTRY.closesAt);
    expect(item).toHaveTextContent("2 attempts");
  });

  it("links each to the page that takes it, and says how the student's attempts stand (#208)", () => {
    render(
      <StudentAssignmentList
        assignments={[ENTRY, { ...ENTRY, id: "a2", title: "Renal bank", maxAttempts: 1 }]}
        classes={new Map([[CLASS_ID, NUR_310]])}
        progress={
          new Map([
            ["a1", { submitted: 1, open: false }],
            ["a2", { submitted: 1, open: false }],
          ])
        }
      />,
    );
    expect(screen.getByRole("link", { name: "Cardiac bank" })).toHaveAttribute(
      "href",
      "/learn/assignments/a1",
    );
    const [first, second] = within(
      screen.getByRole("list", { name: "Open assignments" }),
    ).getAllByRole("listitem");
    expect(first).toHaveTextContent("1 attempt left");
    expect(second).toHaveTextContent("Submitted");
  });
});
