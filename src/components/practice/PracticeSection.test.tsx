import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PracticeSection, type PracticeSectionProps } from "./PracticeSection";

const C1 = { id: "00000000-0000-4000-8000-0000000000c1", name: "NUR 310" };
const C2 = { id: "00000000-0000-4000-8000-0000000000c2", name: "NUR 320" };

function renderSection(props: Partial<PracticeSectionProps> = {}) {
  render(
    <PracticeSection
      headingClassName="text-lg"
      intro="Share this bank with a class."
      shares={[{ ...C1, sharedAt: "2026-09-24T12:00:00Z" }]}
      options={[C1, C2]}
      list={{
        label: "Shared for practice",
        stopActionFor: () => vi.fn(async () => {}),
        stopLabelFor: (entry) => `Stop sharing with ${entry.name}`,
        warningFor: () => "Seen stays seen.",
        emptyMessage: "Not shared with any class.",
      }}
      form={{
        action: vi.fn(async () => ({ status: "idle" as const })),
        label: "Class",
        emptyMessage: "Shared with every class.",
      }}
      {...props}
    />,
  );
}

describe("PracticeSection", () => {
  it("offers only what is not already shared", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Shared for practice" })).toHaveTextContent("NUR 310");
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["NUR 320"]);
  });

  it("puts focus on the Practice heading after a confirmed Stop sharing (#288)", async () => {
    const user = userEvent.setup();
    renderSection();
    const heading = screen.getByRole("heading", { level: 2, name: "Practice" });
    expect(heading).toHaveAttribute("id", "practice-heading");
    expect(heading).toHaveAttribute("tabindex", "-1");
    await user.click(screen.getByRole("button", { name: "Stop sharing with NUR 310" }));
    await user.click(screen.getByRole("button", { name: "Stop sharing" }));
    await screen.findByRole("button", { name: "Stop sharing with NUR 310" });
    expect(heading).toHaveFocus();
  });

  it("says so when everything is shared", () => {
    renderSection({ options: [C1] });
    expect(screen.getByText("Shared with every class.")).toBeInTheDocument();
  });

  it("says the shares could not be loaded, and offers no form", () => {
    renderSection({ shares: null });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("offers no form when the choices could not be read", () => {
    renderSection({ options: null });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("list", { name: "Shared for practice" })).toBeInTheDocument();
  });
});
