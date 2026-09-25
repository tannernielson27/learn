import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassList } from "./ClassList";

describe("ClassList", () => {
  it("links each class to its page, with how many students it has", () => {
    render(
      <ClassList
        classes={[
          { id: "c1", name: "NUR 310 — Fall", memberCount: 1 },
          { id: "c2", name: "NUR 320", memberCount: 12 },
        ]}
      />,
    );
    const first = screen.getByRole("link", { name: /NUR 310 — Fall/ });
    expect(first).toHaveAttribute("href", "/author/classes/c1");
    expect(first).toHaveTextContent("1 student");
    expect(screen.getByRole("link", { name: /NUR 320/ })).toHaveTextContent("12 students");
  });

  it("says there are none yet", () => {
    render(
      <ClassList
        classes={[]}
        emptyAction={{ href: "#new-class-heading", label: "Create a class" }}
      />,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "No classes yet" })).toBeInTheDocument();
    expect(screen.getByText(/invite link/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a class" })).toHaveAttribute(
      "href",
      "#new-class-heading",
    );
  });
});
