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

describe("Button sizes and the secondary edge", () => {
  it("is 44px at md and 56px at lg, and full width when block", () => {
    render(
      <>
        <Button>Medium</Button>
        <Button size="lg" variant="primary" block>
          Submit
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Medium" })).toHaveClass(
      "min-h-(--button-height-md)",
    );
    const large = screen.getByRole("button", { name: "Submit" });
    expect(large).toHaveClass("min-h-(--button-height-lg)", "w-full", "text-lg");
  });

  it("draws a secondary button's edge with the field line, not the divider", () => {
    expect(buttonClasses({ variant: "secondary" })).toContain("border-field-border");
    expect(buttonClasses({ variant: "secondary" })).not.toMatch(/(^| )border-line( |$)/);
  });

  it("greys a disabled button instead of fading its colour", () => {
    expect(buttonClasses()).toContain("disabled:bg-surface-2");
    expect(buttonClasses()).not.toContain("opacity-50");
  });
});

describe("Button busy (#563)", () => {
  it("keeps its label and its name, and says it is busy", () => {
    render(<Button busy>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveTextContent(/^Save changes$/);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    // Still focusable: `disabled` would drop focus in the middle of a save.
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
  });

  it("keeps its width: the mark is out of the flow and hidden from assistive technology", () => {
    const { container } = render(<Button busy>Save</Button>);
    const mark = container.querySelector("[data-busy-mark]");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("absolute", "motion-busy");
    expect(container.querySelector("button")).toHaveClass("relative");
    // The same box classes as at rest: no padding or width is added for the mark.
    expect(container.querySelector("button")?.className).toBe(`${buttonClasses()} cursor-progress`);
  });

  it("ignores a second press, and never submits its form", async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent)}>
        <Button busy type="submit" onClick={onClick}>
          Save
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fills its mark once, and holds it still under reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = css.slice(css.indexOf(".motion-busy {"), css.indexOf("@keyframes busy-fill"));
    expect(rule).toMatch(/animation: busy-fill \d+ms [^;]* both;/);
    expect(rule).not.toMatch(/infinite/);
    expect(rule).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\.motion-busy \{\s*animation: none;/,
    );
    const keyframes = css.slice(css.indexOf("@keyframes busy-fill"));
    expect(keyframes.slice(0, keyframes.indexOf("}\n}"))).not.toMatch(/width|left|right|margin/);
  });

  it("is an ordinary button again when no longer busy", () => {
    const { container } = render(<Button>Save</Button>);
    expect(container.querySelector("[data-busy-mark]")).toBeNull();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });
});
