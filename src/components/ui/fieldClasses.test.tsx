import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIELD_CLASSES, fieldClasses } from "./fieldClasses";

function classList(): string[] {
  return FIELD_CLASSES.split(" ");
}

describe("fieldClasses", () => {
  it("rests on a 1px field-line border on the raised surface", () => {
    expect(classList()).toEqual(
      expect.arrayContaining(["border", "border-line-field", "bg-surface-1", "text-ink-1"]),
    );
  });

  it("hovers to ink-2 only while enabled, valid and not focused", () => {
    expect(classList()).toContain("enabled:hover:not-focus-visible:not-aria-invalid:border-ink-2");
  });

  it("turns the border accent on focus and never removes the global outline", () => {
    expect(classList()).toContain("focus-visible:not-aria-invalid:border-accent");
    expect(FIELD_CLASSES).not.toMatch(/outline-none|outline-0|focus-visible:outline/);
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(
      /:focus-visible \{\s*outline: 2px solid var\(--accent\);\s*outline-offset: 2px;/,
    );
  });

  it("draws an invalid field with the incorrect border", () => {
    expect(classList()).toContain("aria-invalid:border-incorrect");
  });

  it("dims a disabled field", () => {
    expect(classList()).toEqual(
      expect.arrayContaining(["disabled:cursor-not-allowed", "disabled:opacity-50"]),
    );
  });

  it("never animates and never changes border width between states", () => {
    expect(FIELD_CLASSES).not.toMatch(/transition|duration-|animate-/);
    expect(classList().filter((c) => /^(.*:)?border(-[xytrbl])?(-\d+)?$/.test(c))).toEqual([
      "border",
    ]);
  });

  it("appends a form's own padding and type, and leaves sizes to the form", () => {
    expect(FIELD_CLASSES).not.toMatch(/(^| )(px|pl|pr|text-(xs|sm|base|lg|xl))-?/);
    expect(fieldClasses()).toBe(FIELD_CLASSES);
    expect(fieldClasses("px-3 font-mono")).toBe(`${FIELD_CLASSES} px-3 font-mono`);
  });

  it("puts every state on a real input, invalid and disabled alike", () => {
    render(
      <>
        <label>
          Join code
          <input className={fieldClasses("px-3")} aria-invalid />
        </label>
        <label>
          Display name
          <input className={fieldClasses("px-3")} disabled />
        </label>
      </>,
    );
    const code = screen.getByLabelText("Join code");
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code).toHaveClass("aria-invalid:border-incorrect", "border-line-field", "px-3");
    const name = screen.getByLabelText("Display name");
    expect(name).toBeDisabled();
    expect(name).toHaveClass("disabled:opacity-50");
  });

  it("defines the field line in both themes", () => {
    const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
    expect(tokens.match(/--line-field:/g)).toHaveLength(3);
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--color-line-field: var(--line-field);");
  });
});
