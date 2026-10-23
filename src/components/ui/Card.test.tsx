import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";
import { Surface } from "./Surface";

describe("Card", () => {
  it("is the bordered surface, raised by default", () => {
    render(<Card data-testid="card">Body</Card>);
    expect(screen.getByTestId("card")).toHaveClass("rounded-md", "border", "bg-surface-1", "p-4");
  });

  it("is still exported as Surface, unchanged", () => {
    render(
      <Surface data-testid="surface" tone="inset" padding="none">
        Body
      </Surface>,
    );
    expect(Surface).toBe(Card);
    expect(screen.getByTestId("surface")).toHaveClass("bg-surface-2");
    expect(screen.getByTestId("surface")).not.toHaveClass("p-4");
  });
});
