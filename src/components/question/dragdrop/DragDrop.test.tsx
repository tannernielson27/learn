import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "../ItemPlayer";
import { hasRenderer } from "../registry";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { feedbackShown } from "@/components/question/testing/feedback";

const cloze = itemSchema.parse(FIXTURES.dragdrop_cloze.canonical);
const reusable = itemSchema.parse(FIXTURES.dragdrop_cloze.edge);
const dyad = itemSchema.parse(FIXTURES.dragdrop_rationale.canonical);
const triad = itemSchema.parse(FIXTURES.dragdrop_rationale.edge);

const bank = () => screen.getByRole("group", { name: "Word bank" });
const token = (label: string) => within(bank()).getByRole("button", { name: label });
const blank = (n: number, of: number) =>
  screen.getByRole("button", { name: new RegExp(`^Blank ${n} of ${of}`) });
// Named because dnd-kit adds its own (silent) status region to the page.
const status = () => screen.getByRole("status", { name: "Word placement" });
const submit = () => screen.getByRole("button", { name: "Submit" });
const scorePanel = () => screen.getByRole("complementary", { name: "Score" });

const SABA = "a short-acting beta agonist";
const FOWLER = "high Fowler position";
const SUPINE = "supine position";

async function place(label: string, n: number, of: number) {
  await userEvent.click(token(label));
  await userEvent.click(blank(n, of));
}

describe("drag-and-drop renderers", () => {
  it("are registered for cloze and rationale", () => {
    expect(hasRenderer("dragdrop_cloze")).toBe(true);
    expect(hasRenderer("dragdrop_rationale")).toBe(true);
  });
});

describe("drag-and-drop cloze", () => {
  it("renders the sentence with empty blanks and the word bank", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    expect(screen.getByText(/acute asthma exacerbation/)).toBeInTheDocument();
    expect(blank(1, 2)).toHaveAccessibleName("Blank 1 of 2, empty");
    expect(blank(2, 2)).toHaveAccessibleName("Blank 2 of 2, empty");
    expect(within(bank()).getAllByRole("button")).toHaveLength(5);
    expect(token(SABA)).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  });

  it("places a word by tapping it, then tapping a blank", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    await userEvent.click(token(SABA));
    expect(token(SABA)).toHaveAttribute("aria-pressed", "true");
    expect(status()).toHaveTextContent(`${SABA} selected. Choose a blank.`);

    await userEvent.click(blank(1, 2));
    expect(blank(1, 2)).toHaveAccessibleName(`Blank 1 of 2: ${SABA}`);
    expect(status()).toHaveTextContent(`${SABA} placed in blank 1 of 2.`);
    // Single-use: a placed word leaves the bank.
    expect(within(bank()).queryByRole("button", { name: SABA })).not.toBeInTheDocument();
  });

  it("guides a tap on an empty blank and deselects a word tapped twice", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    await userEvent.click(blank(1, 2));
    expect(status()).toHaveTextContent("Select a word first, then choose a blank.");
    expect(blank(1, 2)).toHaveAccessibleName("Blank 1 of 2, empty");

    await userEvent.click(token(SABA));
    await userEvent.click(token(SABA));
    expect(token(SABA)).toHaveAttribute("aria-pressed", "false");
    expect(status()).toHaveTextContent(`${SABA} deselected.`);
  });

  it("works from the keyboard and cancels with Escape", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    token(FOWLER).focus();
    await userEvent.keyboard(" ");
    expect(token(FOWLER)).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Escape}");
    expect(token(FOWLER)).toHaveAttribute("aria-pressed", "false");

    token(FOWLER).focus();
    await userEvent.keyboard("{Enter}");
    blank(2, 2).focus();
    await userEvent.keyboard("{Enter}");
    expect(blank(2, 2)).toHaveAccessibleName(`Blank 2 of 2: ${FOWLER}`);
  });

  it("swaps a filled blank, and clears it when tapped with nothing selected", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    await place(FOWLER, 2, 2);
    await place(SUPINE, 2, 2);
    expect(blank(2, 2)).toHaveAccessibleName(`Blank 2 of 2: ${SUPINE}`);
    expect(token(FOWLER)).toBeInTheDocument();

    await userEvent.click(blank(2, 2));
    expect(blank(2, 2)).toHaveAccessibleName("Blank 2 of 2, empty");
    expect(token(SUPINE)).toBeInTheDocument();
    expect(status()).toHaveTextContent(`${SUPINE} removed from blank 2 of 2.`);
  });

  it("enables submit only when every blank is filled, then scores 0/1 per blank", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    await place(SABA, 1, 2);
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    await place(SUPINE, 2, 2);
    expect(submit()).not.toHaveAttribute("aria-disabled");
    await userEvent.click(submit());
    await feedbackShown();

    expect(within(scorePanel()).getByText("1")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 2")).toBeInTheDocument();
    expect(screen.getAllByText("Correct")).toHaveLength(1);
    expect(screen.getAllByText("Incorrect")).toHaveLength(1);
    expect(screen.getByText(`Correct answer: ${FOWLER}`)).toBeInTheDocument();
    expect(blank(1, 2)).toBeDisabled();
    expect(screen.queryByRole("group", { name: "Word bank" })).not.toBeInTheDocument();
  });

  it("keeps reusable words in the bank", async () => {
    render(<ItemPlayer item={reusable} submit={scoreInProcess(reusable)} />);
    await renderersLoaded();
    await place("60", 1, 2);
    await place("60", 2, 2);
    expect(blank(1, 2)).toHaveAccessibleName("Blank 1 of 2: 60");
    expect(blank(2, 2)).toHaveAccessibleName("Blank 2 of 2: 60");
    expect(token("60")).toBeInTheDocument();
  });
});

describe("drag-and-drop rationale", () => {
  it("explains that a dyad needs both blanks correct", async () => {
    render(<ItemPlayer item={dyad} submit={scoreInProcess(dyad)} />);
    await renderersLoaded();
    await place("atelectasis", 1, 2);
    await place("prolonged immobility", 2, 2);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText("/ 1")).toBeInTheDocument();
    expect(within(panel).getByText(/only when both blanks are correct/)).toBeInTheDocument();
    expect(screen.queryByText("Anchor")).not.toBeInTheDocument();
  });

  it("scores a triad with the anchor wrong as zero and tags the anchor", async () => {
    render(<ItemPlayer item={triad} submit={scoreInProcess(triad)} />);
    await renderersLoaded();
    await place("high fever", 1, 3);
    await place("unilateral calf swelling", 2, 3);
    await place("immobility", 3, 3);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText("/ 2")).toBeInTheDocument();
    expect(within(panel).getByText(/Blank 1 is the anchor/)).toBeInTheDocument();
    expect(within(panel).getByText(/supporting blanks earn nothing/)).toBeInTheDocument();
    expect(screen.getByText("Anchor")).toBeInTheDocument();
    expect(blank(1, 3)).toHaveAccessibleDescription("Anchor");
  });
});
