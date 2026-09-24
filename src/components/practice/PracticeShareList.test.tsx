import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PracticeShareList } from "./PracticeShareList";

const ENTRIES = [
  { id: "00000000-0000-4000-8000-0000000000c1", name: "NUR 310", sharedAt: "2026-09-24T12:00:00Z" },
  { id: "00000000-0000-4000-8000-0000000000c2", name: "NUR 320", sharedAt: "2026-09-24T12:00:00Z" },
];

function setup(entries = ENTRIES) {
  const stop = vi.fn(async () => {});
  const stopActionFor = vi.fn(() => stop);
  render(
    <PracticeShareList
      label="Shared for practice"
      entries={entries}
      stopActionFor={stopActionFor}
      stopLabelFor={(entry) => `Stop sharing with ${entry.name}`}
      warningFor={(entry) => `Students in ${entry.name} lose Cardiac week. Seen stays seen.`}
      emptyMessage="Not shared with any class."
    />,
  );
  return { stop, stopActionFor, user: userEvent.setup() };
}

describe("PracticeShareList", () => {
  it("lists each share by name", () => {
    setup();
    const list = screen.getByRole("list", { name: "Shared for practice" });
    expect(list).toHaveTextContent("NUR 310");
    expect(list).toHaveTextContent("NUR 320");
  });

  it("asks before stopping a share, and says seen answers stay seen", async () => {
    const { stop, stopActionFor, user } = setup();
    await user.click(screen.getByRole("button", { name: "Stop sharing with NUR 320" }));
    expect(stop).not.toHaveBeenCalled();
    expect(
      screen.getByText("Students in NUR 320 lose Cardiac week. Seen stays seen."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stopActionFor).toHaveBeenCalledWith(ENTRIES[1]!.id);
  });

  it("says when nothing is shared", () => {
    setup([]);
    expect(screen.getByText("Not shared with any class.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
