import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  INVITE_UNAVAILABLE_HEADING,
  INVITE_UNAVAILABLE_TEXT,
  InviteUnavailable,
} from "./InviteUnavailable";

describe("InviteUnavailable", () => {
  it("says the link does not work under a focused heading", () => {
    render(<InviteUnavailable />);

    expect(
      screen.getByRole("heading", { level: 1, name: INVITE_UNAVAILABLE_HEADING }),
    ).toHaveFocus();
  });

  it("covers a replaced link and a removed student in one answer, and says who to ask", () => {
    render(<InviteUnavailable />);

    expect(INVITE_UNAVAILABLE_TEXT).toMatch(/replaced/);
    expect(INVITE_UNAVAILABLE_TEXT).toMatch(/removed/);
    expect(INVITE_UNAVAILABLE_TEXT).toMatch(/Ask your instructor for a new link\.$/);
    expect(screen.getByText(INVITE_UNAVAILABLE_TEXT)).toBeInTheDocument();
  });

  it("offers home and sign in as real links", () => {
    render(<InviteUnavailable />);

    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });
});
