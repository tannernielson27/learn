import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PAGE_TITLE_CLASSES } from "@/components/ui/PageHeader";
import ClassesLoading from "./classes/(list)/loading";
import SessionsLoading from "./sessions/loading";
import WorkspaceLoading from "./workspace/loading";

describe.each([
  ["Live sessions", SessionsLoading, "Loading live sessions", "Live sessions"],
  ["Workspace", WorkspaceLoading, "Loading the workspace", "Workspace"],
  ["Classes", ClassesLoading, "Loading classes", "Classes"],
] as const)("%s loading state", (_name, Loading, label, heading) => {
  it("says what is loading in one status line, with no link", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // #563: a loading page never loops (docs/04 §5, §11 "Loading").
  it("holds still: no block pulses", () => {
    const { container } = render(<Loading />);
    expect(container.querySelector(".animate-pulse")).toBeNull();
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
  // #565: the page heads itself with `PageHeader`, so the skeleton draws the same title style.
  it("draws the page's own h1 in the shared title style, so it does not move when the list arrives", () => {
    render(<SessionsLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "display-section",
      "wrap-anywhere",
    );
  });
});

describe("Classes loading state", () => {
  it("draws the page's own h1 in the page title's style, so it does not move (#563)", () => {
    render(<ClassesLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(...PAGE_TITLE_CLASSES.split(" "));
  });
});

describe("Workspace loading state", () => {
  it("names the h1 for screen readers only, over a bar the name's height", () => {
    const { container } = render(<WorkspaceLoading />);
    const h1 = screen.getByRole("heading", { level: 1 });
    // The title's line box: PageHeader's `.display-section` at `--text-section`, 1.1 high.
    expect(h1).toHaveClass("h-[1.1em]", "text-section");
    expect(h1.querySelector(".sr-only")).toHaveTextContent("Workspace");
    expect(h1.querySelector("[aria-hidden='true']")).toHaveClass("bg-surface-2");
    // Nothing else on the screen is words a sighted reader sees.
    const visible = [...container.querySelectorAll("*")].filter(
      (el) => el.children.length === 0 && !el.closest(".sr-only") && el.textContent !== "",
    );
    expect(visible).toEqual([]);
  });
});
