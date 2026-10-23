import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const path = vi.hoisted(() => ({ current: "/learn" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

const { LearnContentWidth, learnContentWidth } = await import("./LearnContentWidth");

describe("learnContentWidth", () => {
  it("gives the student home the wide column", () => {
    expect(learnContentWidth("/learn")).toBe("wide");
  });

  it("keeps every other student page in the reading column", () => {
    expect(learnContentWidth("/learn/assignments/a")).toBe("reading");
    expect(learnContentWidth("/learn/practice/b")).toBe("reading");
    expect(learnContentWidth(null)).toBe("reading");
  });
});

describe("LearnContentWidth", () => {
  it("caps its children at the width of the current page", () => {
    path.current = "/learn";
    const { rerender } = render(<LearnContentWidth>home</LearnContentWidth>);
    expect(screen.getByText("home")).toHaveClass("max-w-wide");
    path.current = "/learn/assignments/a";
    rerender(<LearnContentWidth>home</LearnContentWidth>);
    expect(screen.getByText("home")).toHaveClass("max-w-reading");
  });
});
