import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { flushSync } from "react-dom";
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
    expect(
      screen.getByRole("heading", { level: 3, name: "No assignments yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Assign a bank or a case study/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your item banks" })).toHaveAttribute(
      "href",
      "/author",
    );
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

  it("sends focus to the given heading when a deleted assignment leaves the list (#288)", async () => {
    const user = userEvent.setup();
    function Section() {
      const [entries, setEntries] = useState<readonly AssignmentSummary[]>([SCHEDULED, OPEN]);
      return (
        <>
          <h2 id="assignments-heading" tabIndex={-1}>
            Assignments
          </h2>
          <AssignmentList
            assignments={entries}
            now={NOW}
            editActionFor={() => vi.fn(async () => ({ status: "idle" as const }))}
            deleteActionFor={(id) => async () => {
              // Like the revalidated page: the row and its button are gone before any effect.
              flushSync(() => setEntries((current) => current.filter((entry) => entry.id !== id)));
            }}
            focusAfterDelete="assignments-heading"
          />
        </>
      );
    }
    render(<Section />);
    await user.click(screen.getByRole("button", { name: "Delete Cardiac bank" }));
    await user.click(screen.getByRole("button", { name: "Delete assignment" }));
    expect(screen.queryByRole("button", { name: "Delete Cardiac bank" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Assignments" })).toHaveFocus();
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

  it("offers no edit on one that has closed: students may have seen the keys", () => {
    const { editActionFor, deleteActionFor } = setup([CLOSED]);
    expect(editActionFor).not.toHaveBeenCalled();
    expect(deleteActionFor).not.toHaveBeenCalled();
    expect(screen.queryByText("Change close time", { exact: false })).toBeNull();
    expect(screen.queryByText("Edit", { exact: false })).toBeNull();
  });

  it("links an open assignment to its progress and a closed one to its report (#211)", () => {
    setup([SCHEDULED, OPEN, CLOSED]);
    expect(
      screen.getByRole("link", { name: "View progress for Heart failure case" }),
    ).toHaveAttribute("href", "/author/assignments/a2/report");
    expect(screen.getByRole("link", { name: "View report for Week 1" })).toHaveAttribute(
      "href",
      "/author/assignments/a3/report",
    );
    expect(screen.queryByRole("link", { name: /Cardiac bank/ })).toBeNull();
  });

  it("mounts an edit form only when its row is opened", async () => {
    const { user } = setup([SCHEDULED, OPEN]);
    expect(screen.queryByLabelText("Closes")).toBeNull();
    await user.click(screen.getByText("Change close time", { exact: false }));
    expect(screen.getAllByLabelText("Closes")).toHaveLength(1);
  });
});
