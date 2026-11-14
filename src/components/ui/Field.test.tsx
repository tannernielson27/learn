import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("is named by its label and described by its hint", () => {
    render(<Field label="Your name" hint="Your teacher sees this." defaultValue="Ada" />);
    const input = screen.getByRole("textbox", { name: "Your name" });
    expect(input).toHaveValue("Ada");
    expect(input).toHaveAccessibleDescription("Your teacher sees this.");
    expect(input).toHaveClass("border-line-field", "h-13");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("marks an error invalid, reads it, and keeps it out of feedback red", () => {
    render(<Field label="Join code" appearance="code" error="Check the code." id="code" />);
    const input = screen.getByRole("textbox", { name: "Join code" });
    expect(input).toHaveAttribute("id", "code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Check the code.");
    expect(input).toHaveClass("font-mono", "uppercase");
    const message = screen.getByText("Check the code.").parentElement!;
    expect(message).toHaveClass("text-ink-1");
    expect(message).not.toHaveClass("text-incorrect");
  });

  it("keeps a description the caller adds", () => {
    render(
      <>
        <p id="extra">Six letters and numbers.</p>
        <Field label="Code" aria-describedby="extra" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Code" })).toHaveAccessibleDescription(
      "Six letters and numbers.",
    );
  });

  it("links its hint and its error under the field, in that order (#563)", () => {
    render(<Field label="Email" id="email" hint="Your school address." error="Enter an email." />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-describedby", "email-hint email-error");
    expect(input).toHaveAccessibleDescription("Your school address. Enter an email.");
    const error = document.getElementById("email-error")!;
    expect(error.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    // The neutral alert edge, never the feedback red (owner decision 2026-11-14).
    expect(input.className).toContain("aria-invalid:border-field-invalid");
    expect(input.className).not.toMatch(/incorrect/);
  });

  it("has no error line, and is not invalid, without an error", () => {
    render(<Field label="Email" id="email" />);
    expect(document.getElementById("email-error")).toBeNull();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
  });

  it("can be read-only or disabled", () => {
    render(
      <>
        <Field label="Code" readOnly defaultValue="V96RN8" />
        <Field label="Name" disabled />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Code" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  });
});
