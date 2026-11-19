import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmailSupport, REFERENCE_NOTE, supportMailto } from "./EmailSupport";

describe("supportMailto", () => {
  it("is the plain address without a reference", () => {
    expect(supportMailto()).toBe("mailto:support@learnursing.app");
  });

  it("puts the reference in the subject and body, so nobody has to copy it", () => {
    const url = new URL(supportMailto("2861533018"));
    expect(url.pathname).toBe("support@learnursing.app");
    expect(url.searchParams.get("subject")).toBe("Problem with LeaRN (reference 2861533018)");
    expect(url.searchParams.get("body")).toBe("Reference: 2861533018\n\nWhat happened:\n");
  });
});

describe("EmailSupport", () => {
  it("on an error screen, links the prefilled email and says what the reference is for", () => {
    render(<EmailSupport reference="2861533018" />);
    expect(screen.getByText("Email us:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@learnursing.app" })).toHaveAttribute(
      "href",
      supportMailto("2861533018"),
    );
    expect(screen.getByText(REFERENCE_NOTE)).toBeInTheDocument();
  });

  it("says nothing about a reference when there is none", () => {
    render(<EmailSupport />);
    expect(screen.queryByText(REFERENCE_NOTE)).toBeNull();
  });

  it("carries a sentence on after a lead with no stop, and starts one after a lead with one", () => {
    const { rerender } = render(<EmailSupport lead="Or" />);
    expect(screen.getByText("Or email us:")).toBeInTheDocument();
    rerender(<EmailSupport lead="Sign in to send this from here." />);
    expect(screen.getByText("Sign in to send this from here. Email us:")).toBeInTheDocument();
  });
});
