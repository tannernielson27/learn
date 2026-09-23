import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatInstant } from "@/lib/assignments/assignments";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { AssignmentList } from "./AssignmentList";
import { LocalTime } from "./LocalTime";

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const NOW = new Date("2026-09-23T16:00:00.000Z");

function assignment(
  id: string,
  title: string,
  opensAt: string,
  closesAt: string,
): AssignmentSummary {
  return { id, classId: CLASS_ID, title, opensAt, closesAt, maxAttempts: 1, shuffleOptions: true };
}

const SCHEDULED = assignment(
  "a1",
  "Cardiac bank",
  "2026-09-24T15:00:00.000Z",
  "2026-09-25T23:00:00.000Z",
);
const OPEN = {
  ...assignment("a2", "Heart failure case", "2026-09-23T15:00:00.000Z", "2026-09-24T23:00:00.000Z"),
  maxAttempts: 3,
};
const CLOSED = assignment("a3", "Week 1", "2026-09-20T15:00:00.000Z", "2026-09-21T23:00:00.000Z");

function setup(entries: readonly AssignmentSummary[]) {
  const editActionFor = vi.fn(() => vi.fn(async () => ({ status: "idle" as const })));
  const deleteActionFor = vi.fn(() => vi.fn(async () => {}));
  render(
    <AssignmentList
      assignments={entries}
      now={NOW}
      editActionFor={editActionFor}
      deleteActionFor={deleteActionFor}
    />,
  );
  return { editActionFor, deleteActionFor, user: userEvent.setup() };
}

describe("LocalTime", () => {
  it("shows an instant in the viewer's zone, keeping the instant on dateTime", () => {
    const { container } = render(<LocalTime iso={OPEN.closesAt} />);
    const time = container.querySelector("time");
    expect(time).toHaveAttribute("dateTime", OPEN.closesAt);
    expect(time).toHaveTextContent(formatInstant(OPEN.closesAt, "local"));
  });
});

describe("AssignmentList", () => {
  it("says so when a class has no assignments", () => {
    setup([]);
    expect(screen.getByText(/No assignments yet/)).toBeInTheDocument();
  });

  it("lists each assignment with its state, local window and attempts", () => {
    setup([SCHEDULED, OPEN, CLOSED]);
    const items = within(screen.getByRole("list", { name: "Assignments" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Cardiac bank");
    expect(items[0]).toHaveTextContent("Not yet open");
    expect(items[1]).toHaveTextContent("Open");
    expect(items[1]).toHaveTextContent(`Closes ${formatInstant(OPEN.closesAt, "local")}`);
    expect(items[1]).toHaveTextContent(`Opens ${formatInstant(OPEN.opensAt, "local")}`);
    expect(items[1]).toHaveTextContent("3 attempts");
    expect(items[2]).toHaveTextContent("Closed");
  });

  it("edits everything and can delete one that has not opened", () => {
    const { editActionFor, deleteActionFor } = setup([SCHEDULED]);
    expect(editActionFor).toHaveBeenCalledWith("a1", false);
    expect(deleteActionFor).toHaveBeenCalledWith("a1");
    expect(screen.getByText("Edit", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Cardiac bank" })).toBeInTheDocument();
  });

  it("changes only the close time of one that has opened, and cannot delete it", async () => {
    const { editActionFor, deleteActionFor, user } = setup([OPEN]);
    expect(editActionFor).toHaveBeenCalledWith("a2", true);
    expect(deleteActionFor).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    await user.click(screen.getByText("Change close time", { exact: false }));
    expect(screen.queryByLabelText("Opens")).toBeNull();
    expect(screen.getByLabelText("Closes")).toBeVisible();
  });
});
