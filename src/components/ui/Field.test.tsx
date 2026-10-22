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
});
