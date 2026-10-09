import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkspaceMember } from "@/lib/supabase/workspace";
import { MemberList } from "./MemberList";

const members: WorkspaceMember[] = [
  {
    profileId: "p1",
    displayName: "Ada Lovelace",
    email: "ada@school.edu",
    role: "admin",
    joinedAt: "2026-10-01T10:00:00Z",
  },
  {
    profileId: "p2",
    displayName: null,
    email: "kim@school.edu",
    role: "instructor",
    joinedAt: "2026-10-08T23:30:00Z",
  },
];

describe("MemberList", () => {
  it("lists each member with a name, an address, a role and the day they joined", () => {
    render(<MemberList members={members} viewerId="p1" />);
    const rows = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Ada Lovelace");
    expect(rows[0]).toHaveTextContent("ada@school.edu");
    expect(rows[0]).toHaveTextContent("Admin");
    expect(rows[0]).toHaveTextContent("Joined Oct 1, 2026");
    expect(rows[1]).toHaveTextContent("kim@school.edu");
    expect(rows[1]).toHaveTextContent("Teacher");
    expect(rows[1]).toHaveTextContent("Joined Oct 8, 2026");
  });

  it("marks the viewer's own row and no other", () => {
    render(<MemberList members={members} viewerId="p2" />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).not.toHaveTextContent("(you)");
    expect(rows[1]).toHaveTextContent("(you)");
  });

  it("offers no way to remove a colleague", () => {
    render(<MemberList members={members} viewerId="p1" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws a name and an address that look like markup as text", () => {
    const hostile: WorkspaceMember = {
      profileId: "p3",
      displayName: '<script>alert("name")</script><b>Bold</b>',
      email: '"><img src=x onerror=alert(1)>@school.edu',
      role: "instructor",
      joinedAt: "2026-10-08T10:00:00Z",
    };
    const { container } = render(<MemberList members={[hostile]} viewerId="p1" />);
    expect(screen.getByRole("listitem")).toHaveTextContent(hostile.displayName!);
    expect(screen.getByRole("listitem")).toHaveTextContent(hostile.email);
    expect(container.querySelector("script, img, b")).toBeNull();
  });
});
