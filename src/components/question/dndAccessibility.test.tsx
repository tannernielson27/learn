// #60: dnd-kit always renders an assertive live region of its own. Every drag item here silences
// dnd-kit's messages and announces moves in its own polite status, so that region only ever sat
// empty in the accessibility tree. It is now rendered into a hidden container instead.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";

const DRAG_ITEMS = {
  bowtie: itemSchema.parse(FIXTURES.bowtie.canonical),
  dragdrop_cloze: itemSchema.parse(FIXTURES.dragdrop_cloze.canonical),
  dragdrop_rationale: itemSchema.parse(FIXTURES.dragdrop_rationale.canonical),
  ordered_response: itemSchema.parse(FIXTURES.ordered_response.canonical),
};

/** dnd-kit's own live region, found by the id prefix it gives it. */
const dndLiveRegions = () => [...document.querySelectorAll('[id^="DndLiveRegion"]')];

describe("dnd-kit's live region", () => {
  for (const [type, item] of Object.entries(DRAG_ITEMS)) {
    it(`is kept out of the accessibility tree in ${type}`, () => {
      render(<ItemPlayer item={item} submit={scoreInProcess(item)} />);
      // Still rendered, so dnd-kit has somewhere to write; just never exposed.
      expect(dndLiveRegions()).toHaveLength(1);
      for (const region of dndLiveRegions()) expect(region.closest("[hidden]")).not.toBeNull();
      // The item's own status is the one live region left, and it is polite.
      const live = [...document.querySelectorAll("[aria-live], [role=status], [role=alert]")];
      const exposed = live.filter((el) => !el.closest("[hidden]"));
      expect(exposed).toHaveLength(1);
      expect(exposed[0]).toHaveAttribute("role", "status");
      expect(exposed[0]).not.toHaveAttribute("aria-live", "assertive");
    });
  }

  it("leaves the item's own announcements working", async () => {
    const item = DRAG_ITEMS.ordered_response;
    render(<ItemPlayer item={item} submit={scoreInProcess(item)} />);
    const [first] = screen.getAllByRole("button", { name: /^Move ".*" down$/ });
    await userEvent.click(first!);
    expect(screen.getByRole("status", { name: "Order changes" })).toHaveTextContent(
      /position 2 of 5/,
    );
  });
});
