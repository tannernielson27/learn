import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

describe("SegmentedControl", () => {
  it("renders a radiogroup and changes on click", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Theme" options={options} value="system" onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("moves selection with arrow keys and wraps", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Theme" options={options} value="dark" onChange={onChange} />);
    screen.getByRole("radio", { name: "Dark" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("system");
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("light");
  });
});
