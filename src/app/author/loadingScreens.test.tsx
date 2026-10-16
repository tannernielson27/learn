import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SessionsLoading from "./sessions/loading";
import WorkspaceLoading from "./workspace/loading";

describe.each([
  ["Live sessions", SessionsLoading, "Loading live sessions", "Live sessions"],
  ["Workspace", WorkspaceLoading, "Loading the workspace", "Workspace"],
] as const)("%s loading state", (_name, Loading, label, heading) => {
  it("says what is loading in one status line, with no link", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // e2e/teacherNav.spec.ts runs axe while this screen can still be up: `page-has-heading-one`.
  it("keeps the page's one h1, named for the page and outside any aria-hidden block", () => {
    render(<Loading />);
    const h1 = screen.getByRole("heading", { level: 1, name: heading });
    expect(screen.getAllByRole("heading")).toEqual([h1]);
    expect(h1.closest("[aria-hidden]")).toBeNull();
  });
});

describe("Live sessions loading state", () => {
  it("draws the page's own h1, so it does not move when the list arrives", () => {
    render(<SessionsLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "mb-6",
      "font-read",
      "text-3xl",
      "text-ink-1",
    );
  });
});

describe("Workspace loading state", () => {
  it("names the h1 for screen readers only, over a bar the name's height", () => {
    const { container } = render(<WorkspaceLoading />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveClass("h-[2.7rem]");
    expect(h1.querySelector(".sr-only")).toHaveTextContent("Workspace");
    expect(h1.querySelector("[aria-hidden='true']")).toHaveClass("bg-surface-2");
    // Nothing else on the screen is words a sighted reader sees.
    const visible = [...container.querySelectorAll("*")].filter(
      (el) => el.children.length === 0 && !el.closest(".sr-only") && el.textContent !== "",
    );
    expect(visible).toEqual([]);
  });
});
