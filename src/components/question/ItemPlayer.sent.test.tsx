import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { allFixtures } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { renderersLoaded } from "@/components/question/testing/renderers";

/**
 * A live session's "Answer sent" state: the answer went to the server, which scored it and kept the
 * key, so the phone redraws the answer with nothing to mark it against. It must read as sent, not
 * as wrong: a keyless feedback render used to mark every choice Incorrect, a right one included.
 */
const refuse = vi.fn(async () => {
  throw new Error("Already answered.");
});

/** Any class a feedback treatment adds: `bg-correct-soft`, `border-l-incorrect`, `text-correct`… */
const MARKED = '[class*="-correct"], [class*="-incorrect"], [data-feedback-mark]';

describe("ItemPlayer holding a sent answer with no key", () => {
  it("draws every item type's full-marks answer with no marks, words or score", async () => {
    for (const fixture of allFixtures) {
      const item = itemSchema.parse(fixture.canonical);
      const best = fixture.cases.find((c) => c.expectedPoints === item.scoring.maxPoints);
      expect(best, `${item.type} has a full-marks case`).toBeDefined();

      render(
        <ItemPlayer
          item={toKeylessItem(item)}
          initialMode="feedback"
          initialResponse={best!.response as AnyResponse}
          submit={refuse}
          label="Your answer"
        />,
      );
      await renderersLoaded();

      for (const word of ["Correct", "Incorrect", "Missed"]) {
        expect(screen.queryAllByText(word), `${item.type}: ${word}`).toHaveLength(0);
      }
      expect(screen.queryAllByText(/Correct answer/), item.type).toHaveLength(0);
      expect(document.querySelectorAll(MARKED), item.type).toHaveLength(0);
      expect(screen.queryByRole("complementary", { name: "Score" }), item.type).toBeNull();
      expect(screen.queryByRole("button", { name: "Submit" }), item.type).toBeNull();
      cleanup();
    }
  });

  it("keeps the sent answer selected and read-only", async () => {
    const fixture = allFixtures.find((f) => f.type === "multiple_choice")!;
    const item = itemSchema.parse(fixture.canonical);
    const best = fixture.cases.find((c) => c.expectedPoints === item.scoring.maxPoints)!;
    render(
      <ItemPlayer
        item={toKeylessItem(item)}
        initialMode="feedback"
        initialResponse={best.response as AnyResponse}
        submit={refuse}
      />,
    );
    await renderersLoaded();

    const chosen = screen.getByRole("radio", { checked: true });
    expect(chosen).toBeDisabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
