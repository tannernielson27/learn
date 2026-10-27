// #60: an option's text used to reach a screen reader twice, once as the control's name and again
// as the label's own text beside it. It is now the name only: the visible text is hidden from the
// accessibility tree and the control is labelled by it, so it is read once.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "./ItemPlayer";
import { OptionRow } from "./OptionRow";
import { feedbackShown } from "./testing/feedback";
import { renderersLoaded } from "./testing/renderers";

const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const sata = itemSchema.parse(FIXTURES.multiple_response.canonical);

const RR = "Respiratory rate 28 breaths/min";
const TEMP = "Temperature 37.2 °C (99 °F)";

/** Every element whose text is exposed as content: not inside anything aria-hidden. */
const exposedText = (text: string) =>
  screen.queryAllByText(text).filter((element) => !element.closest('[aria-hidden="true"]'));

describe("option rows", () => {
  it("name a multiple-response checkbox by its text, and expose that text nowhere else", async () => {
    render(<ItemPlayer item={sata} submit={scoreInProcess(sata)} />);
    await renderersLoaded();
    expect(screen.getByRole("checkbox", { name: RR })).toBeInTheDocument();
    expect(screen.getByText(RR)).toBeVisible();
    expect(exposedText(RR)).toHaveLength(0);
  });

  it("keep the letter in a multiple-choice option's name, read once", async () => {
    render(<ItemPlayer item={mc} submit={scoreInProcess(mc)} />);
    await renderersLoaded();
    const first = "Auscultate the lungs and assess oxygen saturation";
    expect(screen.getByRole("radio", { name: `A ${first}` })).toBeInTheDocument();
    expect(exposedText(first)).toHaveLength(0);
    expect(exposedText("A")).toHaveLength(0);
  });

  it("keep the feedback in the name after submit, read once", async () => {
    render(<ItemPlayer item={sata} submit={scoreInProcess(sata)} />);
    await renderersLoaded();
    await userEvent.click(screen.getByRole("checkbox", { name: RR }));
    await userEvent.click(screen.getByRole("checkbox", { name: TEMP }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await feedbackShown();

    expect(screen.getByRole("checkbox", { name: `${RR} Correct` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: `${TEMP} Incorrect` })).toBeChecked();
    expect(exposedText("Correct")).toHaveLength(0);
    expect(exposedText("Incorrect")).toHaveLength(0);
  });
});

describe("an option with one long unbroken word", () => {
  // A drug name or a URL with no space in it set the row's minimum width, and at 320px it ran
  // past the edge of the screen. The text may shrink below its longest word and break inside it.
  it("lets the text shrink and wrap inside the word rather than widen the row", () => {
    const word = "Hydroxychloroquinesulfatepentahydrate-extended-release";
    render(
      <OptionRow
        id="long"
        name="long"
        kind="radio"
        label={word}
        checked={false}
        feedback="neutral"
        mode="answer"
        onToggle={() => {}}
      />,
    );
    const text = screen.getByText(word);
    expect(text).toHaveClass("min-w-0", "break-words");
  });
});
