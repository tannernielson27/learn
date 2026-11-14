import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackLink, backLinkClasses } from "./BackLink";

describe("BackLink", () => {
  it("is a real link named by where it goes, with a hidden chevron", () => {
    render(<BackLink href="/author">Back to the library</BackLink>);
    const link = screen.getByRole("link", { name: "Back to the library" });
    expect(link).toHaveAttribute("href", "/author");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(link.querySelector("svg")).toHaveClass("lucide-chevron-left");
  });

  it("is a 44px target in the accent ink, one look for every back link", () => {
    render(<BackLink href="/author">Back to the library</BackLink>);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("tap-target", "text-accent-ink");
    expect(link.className).toBe(backLinkClasses());
  });

  it("takes a caller's extra classes", () => {
    render(
      <BackLink href="/author" className="mb-4">
        Back
      </BackLink>,
    );
    expect(screen.getByRole("link")).toHaveClass("mb-4", "tap-target");
  });
});
