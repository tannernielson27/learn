import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhoneHeader } from "@/components/live/phone/PhoneHeader";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { RecordLayout } from "./RecordLayout";

/**
 * A case study on a phone (PhoneCase mockup): the "Patient record" chip stays in reach however
 * far the question scrolls, the phone's own header sticks just under it, and that header's border
 * runs from edge to edge. jsdom cannot scroll or lay out, so these pin the rules it rests on.
 */

function draw(record: typeof sampleEhr | null = sampleEhr) {
  render(
    <RecordLayout record={record}>
      <PhoneHeader
        progress="Step 3 of 6: Prioritize Hypotheses"
        title="Cardiac basics"
        connection="connected"
        serverNow={() => 0}
      />
      <p>The question</p>
    </RecordLayout>,
  );
}

const chipBar = () => screen.getByRole("button", { name: "Patient record" }).parentElement;

describe("RecordLayout on a phone", () => {
  it("keeps the chip's bar sticky against the whole layout, not a box only as tall as itself", () => {
    draw();
    expect(chipBar()).toHaveClass("sticky", "top-0", "h-(--record-chip-bar)");
    // The chip bar's own wrapper steps out of the way below the two-pane width, so the bar sticks
    // inside the layout's full height.
    expect(chipBar()?.parentElement).toHaveClass("@max-[56.25rem]/record:contents");
  });

  it("sticks the phone header just under the chip, and only where the chip is drawn", () => {
    draw();
    const layout = document.querySelector("[data-record-layout] > div");
    expect(layout).toHaveClass(
      "@max-[56.25rem]/record:[--record-sticky-top:var(--record-chip-bar)]",
    );
    expect(screen.getByRole("banner")).toHaveClass("sticky", "top-[var(--record-sticky-top,0px)]");
  });

  it("sets no offset for a moment with no patient record", () => {
    draw(null);
    const layout = document.querySelector("[data-record-layout] > div");
    expect(layout?.className).not.toContain("--record-sticky-top");
  });

  it("runs the header's border to both edges, whatever the column's gutter is", () => {
    draw();
    const work = screen.getByText("The question").parentElement;
    expect(work).toHaveClass("px-(--record-gutter)", "[--record-gutter:1.25rem]");
    expect(screen.getByRole("banner")).toHaveClass("-mx-[var(--record-gutter,1rem)]");
  });
});
