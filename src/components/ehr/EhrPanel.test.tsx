import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { EhrPanel } from "./EhrPanel";

const chip = () => screen.getByRole("button", { name: "Patient record" });
const pane = () => screen.getByRole("complementary", { name: "Patient record" });
const sheet = () => screen.getByRole("dialog", { name: "Patient record" });

/** jsdom ships no matchMedia, so the panel falls back to the phone sheet unless one is stubbed. */
const stubViewport = (width: number) =>
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: width >= Number(/min-width:\s*(\d+)px/.exec(media)?.[1] ?? 0),
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

afterEach(() => vi.unstubAllGlobals());

describe("EhrPanel", () => {
  it("renders the record as a pane, with the first tab open", () => {
    render(<EhrPanel record={sampleEhr} />);
    expect(within(pane()).getByRole("tab", { selected: true })).toHaveAccessibleName(
      "History & Physical",
    );
  });

  it("opens the tab an item points at, at the time it was charted", () => {
    render(<EhrPanel record={sampleEhr} openTabId="tab_labs" />);
    const shown = within(pane());
    expect(shown.getByRole("tab", { selected: true })).toHaveAccessibleName("Lab Results");
    // Labs were only drawn at 1400, so pointing at them moves the clock too.
    expect(shown.getByRole("radio", { name: "Day 1, 1400" })).toBeChecked();
  });

  it("keeps one open tab across the pane and the sheet", async () => {
    render(<EhrPanel record={sampleEhr} />);
    await userEvent.click(chip());
    await userEvent.click(within(sheet()).getByRole("tab", { name: "Orders" }));
    await userEvent.keyboard("{Escape}");
    expect(within(pane()).getByRole("tab", { selected: true })).toHaveAccessibleName("Orders");
  });

  describe("the phone bottom sheet", () => {
    it("opens from the chip and moves focus into itself", async () => {
      render(<EhrPanel record={sampleEhr} />);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(chip()).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(chip());
      expect(sheet()).toBeInTheDocument();
      expect(chip()).toHaveAttribute("aria-expanded", "true");
      expect(sheet().contains(document.activeElement)).toBe(true);
    });

    it("closes with Escape and returns focus to the chip", async () => {
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(chip()).toHaveFocus();
    });

    it("closes from its own close button and returns focus to the chip", async () => {
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      await userEvent.click(within(sheet()).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(chip()).toHaveFocus();
    });

    it("puts the page behind it out of reach, not just out of the tab order", async () => {
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      // A reader moving by virtual cursor would otherwise walk straight past the scrim.
      expect(pane().closest("[inert]")).not.toBeNull();
      await userEvent.keyboard("{Escape}");
      expect(document.body.querySelector("[inert]")).toBeNull();
    });

    it("traps Tab inside itself while open", async () => {
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      const inside = () => sheet().contains(document.activeElement);
      // Far more presses than the sheet has stops: focus must never escape to the pane behind it.
      for (let i = 0; i < 12; i++) {
        await userEvent.tab();
        expect(inside()).toBe(true);
      }
      await userEvent.tab({ shift: true });
      expect(inside()).toBe(true);
    });
  });

  describe("the tablet drawer", () => {
    it("opens in the page rather than over it, and the chip closes it again", async () => {
      stubViewport(768);
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      // A drawer, not a sheet: nothing is modal and nothing traps focus.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getAllByRole("tablist", { name: "Patient record sections" })).toHaveLength(2);
      await userEvent.click(chip());
      expect(screen.getAllByRole("tablist", { name: "Patient record sections" })).toHaveLength(1);
    });

    it("closes on Escape from the chip and leaves focus there", async () => {
      stubViewport(768);
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      await userEvent.keyboard("{Escape}");
      expect(screen.getAllByRole("tablist", { name: "Patient record sections" })).toHaveLength(1);
      expect(chip()).toHaveFocus();
    });
  });

  it("closes an open record when the window grows into the two-pane layout", async () => {
    stubViewport(375);
    const { rerender } = render(<EhrPanel record={sampleEhr} />);
    await userEvent.click(chip());
    expect(sheet()).toBeInTheDocument();
    // Its hold on the rest of the page must not outlive the chip that opened it.
    stubViewport(1280);
    rerender(<EhrPanel record={sampleEhr} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.querySelector("[inert]")).toBeNull();
  });

  describe("time points", () => {
    it("stays on the same section when the time changes", async () => {
      render(<EhrPanel record={sampleEhr} />);
      const shown = () => within(pane());
      await userEvent.click(shown().getByRole("tab", { name: "Nurses' Notes" }));
      await userEvent.click(shown().getByRole("radio", { name: "Day 1, 1400" }));
      // The point of a trend is reading one section across times, not losing your place.
      expect(shown().getByRole("tab", { selected: true })).toHaveAccessibleName("Nurses' Notes");
      expect(shown().getByText(/sudden shortness of breath/)).toBeInTheDocument();
    });

    it("falls back to the first section when the open one was not charted then", async () => {
      render(<EhrPanel record={sampleEhr} openTabId="tab_labs" />);
      const shown = () => within(pane());
      await userEvent.click(shown().getByRole("radio", { name: "Day 1, 0800" }));
      expect(shown().queryByRole("tab", { name: "Lab Results" })).toBeNull();
      expect(shown().getByRole("tab", { selected: true })).toHaveAccessibleName(
        "History & Physical",
      );
    });

    it("keeps the chosen time when the sheet is closed and opened again", async () => {
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      await userEvent.click(within(sheet()).getByRole("radio", { name: "Day 1, 1400" }));
      await userEvent.keyboard("{Escape}");
      await userEvent.click(chip());
      expect(within(sheet()).getByRole("radio", { name: "Day 1, 1400" })).toBeChecked();
    });
  });
});
