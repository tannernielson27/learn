import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StudentClass } from "@/lib/supabase/classInvites";
import { StudentClassList } from "./StudentClassList";

function entry(id: string, name: string, workspaceName: string | null): StudentClass {
  return {
    id,
    name,
    joinedAt: "2026-09-23T10:00:00Z",
    timeZone: "America/Denver",
    workspaceName,
  };
}

describe("StudentClassList", () => {
  it("lists the student's classes by name", () => {
    render(
      <StudentClassList
        classes={[
          entry("a", "NUR 310 — Fall", "Ada Lovelace’s workspace"),
          entry("b", "NUR 320", "Ada Lovelace’s workspace"),
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Your classes" });
    expect(list).toHaveTextContent("NUR 310 — Fall");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says which workspace each class belongs to, so two teachers' classes are told apart", () => {
    render(
      <StudentClassList
        classes={[
          entry("a", "NUR 310", "Ada Lovelace’s workspace"),
          entry("b", "NUR 310", "Grace Hopper’s workspace"),
        ]}
      />,
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByText("NUR 310")).toBeInTheDocument();
    expect(within(first!).getByText("Ada Lovelace’s workspace")).toBeInTheDocument();
    expect(within(second!).getByText("Grace Hopper’s workspace")).toBeInTheDocument();
    expect(within(second!).queryByText("Ada Lovelace’s workspace")).not.toBeInTheDocument();
  });

  it("shows the class alone when its workspace is not known", () => {
    render(<StudentClassList classes={[entry("a", "NUR 310", null)]} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent(/^NUR 310$/);
  });

  it("says how to join a class when there are none", () => {
    render(<StudentClassList classes={[]} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "You are not in a class yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/invite link your instructor shares/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
