import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FocusHeading } from "./FocusHeading";
import { StatusLinks } from "./StatusLinks";

describe("FocusHeading", () => {
  it("is a page heading that takes focus when it appears", () => {
    render(<FocusHeading>This page does not exist.</FocusHeading>);

    const heading = screen.getByRole("heading", { level: 1, name: "This page does not exist." });
    expect(heading).toHaveFocus();
    // Focusable from script, never a stop in the tab order.
    expect(heading).toHaveAttribute("tabindex", "-1");
  });
});

describe("StatusLinks", () => {
  it("offers home and sign in as real links", () => {
    render(<StatusLinks />);

    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });
});
