import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { allFixtures, FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem, type Reveal } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { renderersLoaded } from "@/components/question/testing/renderers";

/**
 * `initialKey` (#181): the key and the rationale for someone who did not answer. A live session's
 * phone that stayed quiet is handed the item's `Reveal` and nothing to mark against it, and the
 * same renderers show it read-only: the key's elements marked missed, the rationale under them,
 * and no score, because there is none.
 */
const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const keyOf = (item: Item): Reveal => ({
  answerKey: item.answerKey,
  rationale: item.rationale,
  scoring: item.scoring,
});
const refuse = vi.fn(async () => {
  throw new Error("Nothing to send.");
});

describe("ItemPlayer showing the key to someone who did not answer (#181)", () => {
  it("marks the key on the item and shows the rationale, with no score and no Submit", async () => {
    render(<ItemPlayer item={toKeylessItem(mc)} initialKey={keyOf(mc)} submit={refuse} />);
    await renderersLoaded();

    const panel = screen.getByRole("complementary", { name: "Rationale" });
    const general = mc.rationale.general?.value ?? "";
    expect(general).not.toBe("");
    expect(within(panel).getByText(general.split("\n")[0]!)).toBeVisible();
    // The key, on the renderer's own marks: the right option is the one missed, nothing is chosen.
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.queryByText("Incorrect")).toBeNull();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    // No score: there was no answer to score.
    expect(screen.queryByRole("complementary", { name: "Score" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(refuse).not.toHaveBeenCalled();
  });

  it("does not show the key panel while an item is being answered", async () => {
    render(<ItemPlayer item={toKeylessItem(mc)} submit={refuse} />);
    await renderersLoaded();
    expect(screen.queryByRole("complementary", { name: "Rationale" })).toBeNull();
    expect(screen.queryByText("Missed")).toBeNull();
  });

  it("draws every item type from its key alone, with the rationale beneath it", async () => {
    for (const fixture of allFixtures) {
      const item = itemSchema.parse(fixture.canonical);
      render(<ItemPlayer item={toKeylessItem(item)} initialKey={keyOf(item)} submit={refuse} />);
      await renderersLoaded();
      const panel = screen.getByRole("complementary", { name: "Rationale" });
      expect(panel, item.type).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Submit" }), item.type).toBeNull();
      cleanup();
    }
  });
});
