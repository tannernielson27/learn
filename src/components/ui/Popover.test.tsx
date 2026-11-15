import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover } from "./Popover";

describe("Popover (#563)", () => {
  it("is a button that opens its panel with the browser's own popover, no script", () => {
    render(
      <Popover id="demo-panel" label="Filters" buttonClassName="btn">
        <button type="button">Inside</button>
      </Popover>,
    );
    const button = screen.getByRole("button", { name: "Filters" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("popovertarget", "demo-panel");
    expect(button).toHaveClass("btn");
    const panel = document.getElementById("demo-panel")!;
    expect(panel).toHaveAttribute("popover", "auto");
    // Closed, so hidden until it opens; its contents are still there for the form it sits in.
    expect(within(panel).getByRole("button", { name: "Inside", hidden: true })).not.toBeVisible();
  });

  it("anchors the panel to its button, and takes a fuller name for the button", () => {
    render(
      <Popover id="opts" label="Options" accessibleName="Live session options" buttonClassName="">
        <p>Panel</p>
      </Popover>,
    );
    const button = screen.getByRole("button", { name: "Live session options" });
    expect(button.style.getPropertyValue("anchor-name")).toBe("--opts");
    expect(document.getElementById("opts")!.style.getPropertyValue("position-anchor")).toBe(
      "--opts",
    );
  });

  it("opens toward the start from a button at a row's start", () => {
    render(
      <Popover id="s" label="More" buttonClassName="" align="start" width="sm">
        <p>Panel</p>
      </Popover>,
    );
    const panel = document.getElementById("s")!;
    expect(panel.className).toContain("span-inline-end");
    expect(panel.className).toContain("w-[min(16rem");
  });
});
