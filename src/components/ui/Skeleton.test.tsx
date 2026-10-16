import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonLine, SkeletonScreen } from "./Skeleton";

describe("Skeleton", () => {
  it("draws a neutral block that a screen reader skips", () => {
    const { container } = render(<Skeleton className="h-6 w-40" />);
    const block = container.firstElementChild;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("bg-surface-2", "h-6", "w-40");
    expect(block).toHaveTextContent("");
  });
});

describe("SkeletonLine", () => {
  it("holds the text's line height and centres a shorter block in it", () => {
    const { container } = render(<SkeletonLine lineClassName="h-5" className="h-3.5 w-32" />);
    const line = container.firstElementChild;
    expect(line).toHaveClass("h-5", "items-center");
    expect(line?.firstElementChild).toHaveClass("bg-surface-2", "h-3.5", "w-32");
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
