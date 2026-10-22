import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldError } from "./FieldError";

describe("FieldError", () => {
  it("draws the words in ink with a hidden alert icon, never feedback red", () => {
    render(
      <FieldError id="name-error" role="alert">
        Enter a name.
      </FieldError>,
    );
    const line = screen.getByRole("alert");
    expect(line).toHaveTextContent("Enter a name.");
    expect(line).toHaveAttribute("id", "name-error");
    expect(line.className).toContain("text-ink-1");
    expect(line.className).not.toContain("text-incorrect");
    expect(line.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is a plain line when no role is given", () => {
    render(<FieldError>Too long.</FieldError>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Too long.")).toBeInTheDocument();
  });
});
