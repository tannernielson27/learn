import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextLink, textLinkClasses } from "./TextLink";

describe("TextLink", () => {
  it("is a 44px semibold accent link on its own line", () => {
    render(<TextLink href="/author">Back to the library</TextLink>);
    const link = screen.getByRole("link", { name: "Back to the library" });
    expect(link).toHaveAttribute("href", "/author");
    expect(link).toHaveClass("tap-target", "font-semibold", "text-accent-ink", "hover:underline");
  });

  it("is underlined inside a sentence, so colour is not the only signal", () => {
    render(
      <TextLink href="/help" kind="inline" className="ml-1">
        the guide
      </TextLink>,
    );
    const link = screen.getByRole("link", { name: "the guide" });
    expect(link).toHaveClass("underline", "ml-1");
    expect(link).not.toHaveClass("tap-target");
  });

  it("gives a layout's own link the same classes", () => {
    expect(textLinkClasses({ size: "sm" })).toContain("text-sm");
    expect(textLinkClasses()).toContain("text-base");
  });
});
