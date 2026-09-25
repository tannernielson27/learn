import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassRoster } from "./ClassRoster";

const entries = [
  {
    profileId: "p1",
    email: "ana@school.edu",
    displayName: null,
    joinedAt: "2026-09-23T10:00:00Z",
    signedIn: true,
  },
  {
    profileId: "p2",
    email: "typo@school.edu",
    displayName: null,
    joinedAt: "2026-09-23T11:00:00Z",
    signedIn: false,
  },
];

describe("ClassRoster", () => {
  it("lists each student with a remove button named for them", () => {
    const removeActionFor = vi.fn(() => async () => {});
    render(<ClassRoster entries={entries} removeActionFor={removeActionFor} />);
    const list = screen.getByRole("list", { name: "Roster" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove ana@school.edu" })).toBeInTheDocument();
    expect(removeActionFor).toHaveBeenCalledWith("p1");
    expect(removeActionFor).toHaveBeenCalledWith("p2");
  });

  it("marks someone whose link was never opened, so a mistyped address stands out", () => {
    render(<ClassRoster entries={entries} removeActionFor={() => async () => {}} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("Has not signed in yet");
    expect(items[1]).toHaveTextContent("Has not signed in yet");
  });

  it("says when nobody has joined", () => {
    render(
      <ClassRoster
        entries={[]}
        removeActionFor={() => async () => {}}
        emptyAction={{ href: "#invite-heading", label: "Go to the invite link" }}
      />,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Nobody has joined yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Share the invite link with your class.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the invite link" })).toHaveAttribute(
      "href",
      "#invite-heading",
    );
  });
});
