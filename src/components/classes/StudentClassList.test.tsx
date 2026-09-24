import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentClassList } from "./StudentClassList";

describe("StudentClassList", () => {
  it("lists the student's classes by name", () => {
    render(
      <StudentClassList
        classes={[
          {
            id: "a",
            name: "NUR 310 — Fall",
            joinedAt: "2026-09-23T10:00:00Z",
            timeZone: "America/Denver",
          },
          {
            id: "b",
            name: "NUR 320",
            joinedAt: "2026-09-23T10:00:00Z",
            timeZone: "America/Denver",
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Your classes" });
    expect(list).toHaveTextContent("NUR 310 — Fall");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says how to join a class when there are none", () => {
    render(<StudentClassList classes={[]} />);
    expect(screen.getByText(/invite link your instructor shares/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
