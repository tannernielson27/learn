import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassList } from "./ClassList";
import { ClassNameForm } from "./ClassNameForm";

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

  it("says there are none yet, in one line with the way to a new class", () => {
    const { container } = render(
      <ClassList classes={[]} emptyAction={{ href: "#new-class-name", label: "New class" }} />,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "No classes yet" })).toBeInTheDocument();
    // One line and one action (#412): no sentence under the heading.
    expect(container.querySelector("p")).toBeNull();
    expect(screen.getByRole("link", { name: "New class" })).toHaveAttribute(
      "href",
      "#new-class-name",
    );
  });
});

describe("the empty list's New class link (#563)", () => {
  it("lands on the New class name field itself, by its id, as a plain anchor", () => {
    render(
      <>
        <ClassNameForm action={async () => ({ status: "idle" })} nameId="new-class-name" inline />
        <ClassList classes={[]} emptyAction={{ href: "#new-class-name", label: "New class" }} />
      </>,
    );
    const link = screen.getByRole("link", { name: "New class" });
    const field = screen.getByRole("textbox", { name: "Class name" });
    // The browser scrolls to a focusable fragment target and focuses it; the router's hash
    // handling would only scroll, so the link is a plain anchor (checked in a browser by e2e).
    expect(link.getAttribute("href")).toBe(`#${field.id}`);
    expect(field).toHaveClass("scroll-mt-24");
  });
});
