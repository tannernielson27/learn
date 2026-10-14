import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import { EhrPanel } from "./EhrPanel";

/**
 * A tab locked at a step (#335), as a student reads it: named in the tab bar with a lock and the
 * word "Locked", announced as unavailable, and impossible to open by pointer or keyboard.
 */

const staged = ehrRecordSchema.parse(stagedEhr);
const pane = () => within(screen.getByRole("complementary", { name: "Patient record" }));
const labs = () => pane().getByRole("tab", { name: /^Lab Results/ });

describe("a tab locked at this step (#335)", () => {
  it("is in the tab bar by name, with the word Locked, and announced as unavailable", () => {
    render(<EhrPanel record={recordAtStep(staged, 2)} />);
    expect(labs()).toHaveAccessibleName("Lab Results Locked");
    expect(labs()).toHaveAttribute("aria-disabled", "true");
    expect(labs()).toHaveAttribute("aria-selected", "false");
    expect(labs()).not.toHaveAttribute("aria-controls");
    expect(labs().querySelector("svg")).not.toBeNull();
    // Nothing behind it: the view had no text to draw.
    expect(screen.queryByText(/Serum hCG/)).toBeNull();
  });

  it("does not open on a click, and the arrow keys pass over it", async () => {
    render(<EhrPanel record={recordAtStep(staged, 2)} />);
    await userEvent.click(labs());
    expect(pane().getByRole("tab", { selected: true })).toHaveAccessibleName("History & Physical");
    expect(labs()).toHaveAttribute("tabindex", "-1");

    const tabs = pane().getAllByRole("tab");
    const names = tabs.map((tab) => tab.textContent);
    expect(names).toEqual([
      "History & Physical",
      "Nurses' Notes",
      "Vital Signs",
      "Lab Results Locked",
    ]);
    await userEvent.click(pane().getByRole("tab", { name: "Vital Signs" }));
    await userEvent.keyboard("{ArrowRight}");
    // Past the locked tab and round to the first.
    expect(pane().getByRole("tab", { selected: true })).toHaveAccessibleName("History & Physical");
    expect(pane().getAllByRole("tabpanel", { hidden: true })).toHaveLength(3);
  });

  it("opens in place when the next step's chart opens it, and locks again if a later one does", () => {
    const { rerender } = render(<EhrPanel record={recordAtStep(staged, 2)} />);
    rerender(<EhrPanel record={recordAtStep(staged, 3)} />);
    expect(labs()).toHaveAccessibleName("Lab Results");
    expect(labs()).not.toHaveAttribute("aria-disabled");

    // Reading the labs, then a chart where the tab is locked again (owner decision 2026-10-13).
    rerender(<EhrPanel record={recordAtStep(staged, 3)} />);
    labs().click();
    const relocked = recordAtStep(
      { ...staged, tabs: staged.tabs.map((tab) => ({ ...tab, stepAccess: undefined })) },
      3,
    );
    const lockedAgain = {
      ...relocked,
      tabs: relocked.tabs.map((tab) =>
        tab.id === "staged_labs"
          ? { id: tab.id, kind: tab.kind, title: tab.title, locked: true as const }
          : tab,
      ),
    };
    rerender(<EhrPanel record={lockedAgain} />);
    expect(labs()).toHaveAttribute("aria-disabled", "true");
    // The open tab falls back to one that can be read, never to the locked one.
    expect(pane().getByRole("tab", { selected: true })).toHaveAccessibleName("History & Physical");
    expect(screen.queryByText(/Serum hCG/)).toBeNull();
  });

  it("falls back to the first time when going back to a step before the time being read", async () => {
    const { rerender } = render(<EhrPanel record={recordAtStep(staged, 3)} />);
    await userEvent.click(pane().getByRole("radio", { name: "0130" }));
    expect(pane().getByRole("tab", { name: "Diagnostics" })).toBeInTheDocument();
    rerender(<EhrPanel record={recordAtStep(staged, 2)} />);
    expect(pane().queryByRole("radio", { name: "0130" })).toBeNull();
    expect(pane().getByRole("radio", { name: "0100" })).toBeChecked();
    expect(pane().queryByRole("tab", { name: "Diagnostics" })).toBeNull();
  });
});
