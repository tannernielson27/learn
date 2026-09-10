import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

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
});
