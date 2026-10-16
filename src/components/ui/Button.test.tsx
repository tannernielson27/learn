import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonClasses } from "./Button";

describe("Button", () => {
  it("renders as a non-submit button by default and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit answer</Button>);
    const button = screen.getByRole("button", { name: "Submit answer" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies variant and size classes and respects disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="sm" disabled onClick={onClick}>
        Next
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Next" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("text-sm");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("presses in, and gives a link the same classes as the button it imitates", () => {
    render(<Button variant="primary">Join</Button>);
    const button = screen.getByRole("button", { name: "Join" });
    expect(button).toHaveClass("press");
    // The press is a transform, so it has to be in the transition list to ease rather than jump.
    expect(button.className).toContain("scale]");
    expect(buttonClasses({ variant: "primary" })).toBe(button.className);
    expect(buttonClasses({ size: "sm" })).toContain("px-3 text-sm");
    expect(buttonClasses()).toContain("bg-surface-1");
  });

  it("never presses a disabled control, native or aria-disabled", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(':active:not(:disabled, [aria-disabled="true"])');
  });
});
