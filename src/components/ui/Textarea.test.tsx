import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("is named by its label, described by its hint, and styled like a field", () => {
    render(<Textarea label="What happened?" hint="Say what you saw." defaultValue="It froze" />);
    const box = screen.getByRole("textbox", { name: "What happened?" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveValue("It froze");
    expect(box).toHaveAccessibleDescription("Say what you saw.");
    expect(box).toHaveClass("border-line-field", "resize-y");
    expect(box).toHaveAttribute("rows", "5");
  });

  it("marks an error invalid and reads hint then error, never in feedback red", () => {
    render(<Textarea label="Message" id="m" hint="A hint." error="Too short." />);
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAttribute("aria-describedby", "m-hint m-error");
    expect(box.className).not.toMatch(/incorrect/);
  });

  it("passes a ref through, so a form can focus it after an error", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea label="Message" ref={ref} />);
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Message" }));
  });
});
