import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const tabs = [
  { id: "notes", label: "Nurses' Notes", content: <p>Notes content</p> },
  { id: "vitals", label: "Vital Signs", content: <p>Vitals content</p> },
  { id: "labs", label: "Lab Results", content: <p>Labs content</p> },
];

describe("Tabs", () => {
  it("shows the first tab and switches on click", async () => {
    render(<Tabs label="Patient record" tabs={tabs} />);
    expect(screen.getByText("Notes content")).toBeVisible();
    expect(screen.getByText("Vitals content")).not.toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Vital Signs" }));
    expect(screen.getByRole("tab", { name: "Vital Signs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Vitals content")).toBeVisible();
  });

  it("moves with arrow keys, wraps, and supports Home/End", async () => {
    const onChange = vi.fn();
    render(<Tabs label="Patient record" tabs={tabs} onChange={onChange} />);
    const first = screen.getByRole("tab", { name: "Nurses' Notes" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Vital Signs" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Lab Results" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Lab Results" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("labs");
  });

  it("works as a controlled component", async () => {
    const onChange = vi.fn();
    render(<Tabs label="Patient record" tabs={tabs} value="labs" onChange={onChange} />);
    expect(screen.getByText("Labs content")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Vital Signs" }));
    expect(onChange).toHaveBeenCalledWith("vitals");
    expect(screen.getByText("Labs content")).toBeVisible();
  });
});
