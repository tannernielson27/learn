import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { EhrPanel } from "./EhrPanel";

const chip = () => screen.getByRole("button", { name: "Patient record" });
const pane = () => screen.getByRole("complementary", { name: "Patient record" });
const sheet = () => screen.getByRole("dialog", { name: "Patient record" });

/** jsdom ships no matchMedia, so the panel falls back to the phone sheet unless one is stubbed. */
const stubViewport = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches,
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

  it("opens the tab an item points at", () => {
    render(<EhrPanel record={sampleEhr} openTabId="tab_labs" />);
    expect(within(pane()).getByRole("tab", { selected: true })).toHaveAccessibleName(
      "Lab Results · Day 1, 1400",
    );
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
      stubViewport(true);
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      // A drawer, not a sheet: nothing is modal and nothing traps focus.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getAllByRole("tablist", { name: "Patient record sections" })).toHaveLength(2);
      await userEvent.click(chip());
      expect(screen.getAllByRole("tablist", { name: "Patient record sections" })).toHaveLength(1);
    });

    it("closes on Escape from the chip and leaves focus there", async () => {
      stubViewport(true);
      render(<EhrPanel record={sampleEhr} />);
      await userEvent.click(chip());
      await userEvent.keyboard("{Escape}");
      expect(screen.getAllByRole("tablist", { name: "Patient record sections" })).toHaveLength(1);
      expect(chip()).toHaveFocus();
    });
  });
});
