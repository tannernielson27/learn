import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonScreen } from "./Skeleton";

describe("Skeleton", () => {
  it("draws a neutral block that a screen reader skips", () => {
    const { container } = render(<Skeleton className="h-6 w-40" />);
    const block = container.firstElementChild;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("bg-surface-2", "h-6", "w-40");
    expect(block).toHaveTextContent("");
  });

  it("holds still when asked, for a loading screen where nothing may loop", () => {
    const { container } = render(<Skeleton still className="h-6" />);
    expect(container.firstElementChild).not.toHaveClass("animate-pulse");
  });
});

describe("SkeletonLine", () => {
  it("holds the text's line height and centres a shorter block in it", () => {
    const { container } = render(<SkeletonLine lineClassName="h-5" className="h-3.5 w-32" />);
    const line = container.firstElementChild;
    expect(line).toHaveClass("h-5", "items-center");
    expect(line?.firstElementChild).toHaveClass("bg-surface-2", "h-3.5", "w-32");
  });

  it("passes still on to its block", () => {
    const { container } = render(<SkeletonLine still lineClassName="h-5" className="w-32" />);
    expect(container.firstElementChild?.firstElementChild).not.toHaveClass("animate-pulse");
  });
});

describe("SkeletonScreen", () => {
  it("says what is loading in one status line and nothing else", () => {
    render(
      <SkeletonScreen label="Loading live sessions">
        <Skeleton className="h-9 w-48" />
      </SkeletonScreen>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading live sessions");
    expect(status).toHaveClass("sr-only");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("marks the region busy while the page streams in", () => {
    const { container } = render(
      <SkeletonScreen label="Loading">
        <Skeleton />
      </SkeletonScreen>,
    );
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("pulses its blocks on opacity alone, and not at all under reduced motion", () => {
    const { container } = render(
      <SkeletonScreen label="Loading">
        <Skeleton />
      </SkeletonScreen>,
    );
    const block = container.querySelector("[data-skeleton-blocks] > div");
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("animate-pulse", "motion-reduce:animate-none");
  });

  it("keeps a real heading among the blocks visible to assistive technology, and still", () => {
    render(
      <SkeletonScreen label="Loading">
        <h1>Live sessions</h1>
        <Skeleton />
      </SkeletonScreen>,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Live sessions" });
    expect(heading.closest("[aria-hidden]")).toBeNull();
    expect(heading.closest(".animate-pulse")).toBeNull();
  });
});

describe("SkeletonPage (#563)", () => {
  it.each(["list", "table"] as const)(
    "is a %s page labelled by one status line, with no block that moves",
    (shape) => {
      const { container } = render(<SkeletonPage label="Loading the library" shape={shape} />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading the library");
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
      expect(container.querySelector(".animate-pulse")).toBeNull();
      expect(container.innerHTML).not.toMatch(/animate-|motion-/);
    },
  );

  it("draws the header in PageHeader's shape, with the action when the page has one", () => {
    const { container } = render(<SkeletonPage label="Loading" shape="list" action />);
    expect(container.querySelector(".h-\\(--button-height-md\\)")).not.toBeNull();
    const { container: bare } = render(<SkeletonPage label="Loading" shape="list" />);
    expect(bare.querySelector(".h-\\(--button-height-md\\)")).toBeNull();
  });

  it("draws the real title when it is known, so the heading never jumps", () => {
    render(<SkeletonPage label="Loading the library" shape="list" title="Library" />);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toHaveClass(
      "display-section",
    );
  });

  it("draws as many list rows as asked", () => {
    const { container } = render(<SkeletonPage label="Loading" shape="list" rows={3} />);
    expect(container.querySelectorAll("ul > li")).toHaveLength(3);
  });

  it("draws a table's head row and body rows, two columns on a phone", () => {
    const { container } = render(
      <SkeletonPage label="Loading" shape="table" rows={4} columns={5} />,
    );
    expect(container.querySelectorAll("[data-skeleton-row='head']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-skeleton-row='body']")).toHaveLength(4);
    const head = container.querySelector("[data-skeleton-row='head']")!;
    expect(head.children).toHaveLength(5);
    expect(head.querySelectorAll(":scope > .hidden")).toHaveLength(3);
  });
});
