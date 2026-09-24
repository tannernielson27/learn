import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssignPanel, type AssignPanelProps } from "./AssignPanel";

function renderPanel(props: Partial<AssignPanelProps> = {}) {
  render(
    <AssignPanel
      sourceName="Cardiac week"
      backHref="/author/banks/b1"
      backLabel="Back to bank"
      classes={[{ id: "c1", name: "NUR 310" }]}
      action={vi.fn(async () => ({ status: "idle" as const }))}
      exposure={{ classNames: [], exposedItems: 0 }}
      {...props}
    />,
  );
}

describe("AssignPanel practice warning (#240)", () => {
  it("warns, naming the classes and counting the items, and still offers Assign", () => {
    renderPanel({ exposure: { classNames: ["NUR 310"], exposedItems: 12 } });
    expect(screen.getByRole("note")).toHaveTextContent(
      "Students in NUR 310 can see the answers to 12 of these items in practice.",
    );
    expect(screen.getByRole("button", { name: "Assign" })).toBeEnabled();
  });

  it("says nothing when no class can see the answers", () => {
    renderPanel();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("says it could not check, rather than staying silent", () => {
    renderPanel({ exposure: null });
    expect(screen.getByRole("note")).toHaveTextContent(
      "Could not check whether students can see these answers in practice.",
    );
  });
});
