import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignUpConsent } from "./SignUpConsent";

describe("SignUpConsent (#522)", () => {
  it("says what creating an account agrees to, with both documents linked", () => {
    render(<SignUpConsent />);
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P"
          ? element.textContent ===
            "By creating an account, you agree to the Terms of Service and Privacy Policy."
          : false,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});
