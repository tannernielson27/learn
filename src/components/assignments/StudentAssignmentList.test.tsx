import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatInstant } from "@/lib/assignments/assignments";
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

describe("StudentAssignmentList", () => {
  it("says so when nothing is open", () => {
    render(<StudentAssignmentList assignments={[]} classNames={new Map()} />);
    expect(screen.getByText("Nothing is open right now.")).toBeInTheDocument();
  });

  it("lists what is open, with its class, its close time and its attempts", () => {
    render(
      <StudentAssignmentList assignments={[ENTRY]} classNames={new Map([[CLASS_ID, "NUR 310"]])} />,
    );
    const item = within(screen.getByRole("list", { name: "Open assignments" })).getByRole(
      "listitem",
    );
    expect(item).toHaveTextContent("Cardiac bank");
    expect(item).toHaveTextContent("NUR 310");
    expect(item).toHaveTextContent(`Closes ${formatInstant(ENTRY.closesAt, "local")}`);
    expect(item).toHaveTextContent("2 attempts");
  });

  it("links each to the page that takes it, and says how the student's attempts stand (#208)", () => {
    render(
      <StudentAssignmentList
        assignments={[ENTRY, { ...ENTRY, id: "a2", title: "Renal bank", maxAttempts: 1 }]}
        classNames={new Map([[CLASS_ID, "NUR 310"]])}
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
