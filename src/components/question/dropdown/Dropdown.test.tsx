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

const cloze = itemSchema.parse(FIXTURES.dropdown_cloze.canonical);
const triad = itemSchema.parse(FIXTURES.dropdown_rationale.canonical);
const dyad = itemSchema.parse(FIXTURES.dropdown_rationale.edge);

const blank = (n: number, of: number) =>
  screen.getByRole("combobox", { name: `Blank ${n} of ${of}` });
const submit = () => screen.getByRole("button", { name: "Submit" });
const scorePanel = () => screen.getByRole("complementary", { name: "Score" });

async function answer(of: number, labels: readonly string[]) {
  for (const [index, label] of labels.entries()) {
    await userEvent.selectOptions(blank(index + 1, of), label);
  }
}

describe("drop-down renderers", () => {
  it("are registered for cloze and rationale", () => {
    expect(hasRenderer("dropdown_cloze")).toBe(true);
    expect(hasRenderer("dropdown_rationale")).toBe(true);
  });
});

describe("drop-down cloze", () => {
  it("renders the sentence with one drop-down per blank and no answer before submit", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    expect(screen.getByText(/places them at greatest risk for/)).toBeInTheDocument();
    const first = blank(1, 2);
    expect(
      within(first)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Select…", "cardiac dysrhythmia", "seizure activity", "respiratory alkalosis"]);
    expect(first).toHaveValue("");
    expect(blank(2, 2)).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  });

  it("enables submit only when every blank is filled", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    await userEvent.selectOptions(blank(1, 2), "cardiac dysrhythmia");
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    await userEvent.selectOptions(blank(2, 2), "apply a warm compress");
    expect(submit()).not.toHaveAttribute("aria-disabled");
    await userEvent.selectOptions(blank(2, 2), "Select…");
    expect(submit()).toHaveAttribute("aria-disabled", "true");
  });

  it("scores 0/1 per blank and shows the right answer for a wrong blank", async () => {
    render(<ItemPlayer item={cloze} submit={scoreInProcess(cloze)} />);
    await renderersLoaded();
    await answer(2, ["cardiac dysrhythmia", "apply a warm compress"]);
    await userEvent.click(submit());
    await feedbackShown();

    expect(within(scorePanel()).getByText("1")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 2")).toBeInTheDocument();
    expect(screen.getAllByText("Correct")).toHaveLength(1);
    expect(screen.getAllByText("Incorrect")).toHaveLength(1);
    expect(screen.getByText(/Correct answer: obtain a 12-lead ECG/)).toBeInTheDocument();
    expect(blank(1, 2)).toBeDisabled();
    expect(blank(2, 2)).toBeDisabled();
  });
});

describe("drop-down rationale", () => {
  it("scores a triad with the anchor wrong as zero and says why", async () => {
    render(<ItemPlayer item={triad} submit={scoreInProcess(triad)} />);
    await renderersLoaded();
    await answer(3, [
      "puerperal infection",
      "a boggy fundus above the umbilicus",
      "saturating a pad in 15 minutes",
    ]);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText("/ 2")).toBeInTheDocument();
    expect(within(panel).getByText(/Blank 1 is the anchor/)).toBeInTheDocument();
    expect(within(panel).getByText(/supporting blanks earn nothing/)).toBeInTheDocument();
    expect(screen.getByText("Anchor")).toBeInTheDocument();
    // The anchor tag comes first, then why that blank was what it was.
    expect(blank(1, 3)).toHaveAccessibleDescription(/^Anchor The anchor\./);
    expect(blank(2, 3)).toHaveAccessibleDescription(/a uterus not clamping down/);
  });

  it("scores a triad with the anchor right as one point per correct supporting blank", async () => {
    render(<ItemPlayer item={triad} submit={scoreInProcess(triad)} />);
    await renderersLoaded();
    await answer(3, [
      "postpartum hemorrhage",
      "a temperature of 37.6 °C",
      "saturating a pad in 15 minutes",
    ]);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("1")).toBeInTheDocument();
    expect(
      within(panel).getByText(/each correct supporting blank earns a point/),
    ).toBeInTheDocument();
  });

  it("explains that a dyad needs both blanks correct", async () => {
    render(<ItemPlayer item={dyad} submit={scoreInProcess(dyad)} />);
    await renderersLoaded();
    expect(screen.queryByText("Anchor")).not.toBeInTheDocument();
    await answer(2, ["orthostatic hypotension", "caffeine intake"]);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText(/only when both blanks are correct/)).toBeInTheDocument();
    expect(screen.queryByText("Anchor")).not.toBeInTheDocument();
  });
});
