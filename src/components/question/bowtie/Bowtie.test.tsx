import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { ItemPlayer } from "../ItemPlayer";
import { hasRenderer } from "../registry";

const bowtie = itemSchema.parse(FIXTURES.bowtie.canonical);

const ACTIONS = "Actions to Take";
const CONDITION = "Potential Condition";
const PARAMETERS = "Parameters to Monitor";

const ECG = "Obtain a 12-lead ECG within 10 minutes";
const ASPIRIN = "Administer chewable aspirin as prescribed";
const WALK = "Encourage ambulation to relieve anxiety";
const MI = "Acute myocardial infarction";
const GERD = "Gastroesophageal reflux";
const TROPONIN = "Serial troponin levels";
const RHYTHM = "Continuous cardiac rhythm";
const BOWEL = "Bowel sounds";

const choices = (column: string) => screen.getByRole("group", { name: `${column} choices` });
const choice = (column: string, label: string) =>
  within(choices(column)).getByRole("button", { name: label });
const slot = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const actionSlot = (n: number) => slot(`${ACTIONS} ${n} of 2`);
const parameterSlot = (n: number) => slot(`${PARAMETERS} ${n} of 2`);
const conditionSlot = () => slot(CONDITION);
// Named because dnd-kit adds its own (silent) status region to the page.
const status = () => screen.getByRole("status", { name: "Bowtie placement" });
const submit = () => screen.getByRole("button", { name: "Submit" });
const scorePanel = () => screen.getByRole("complementary", { name: "Score" });

async function place(column: string, label: string, target: HTMLElement) {
  await userEvent.click(choice(column, label));
  await userEvent.click(target);
}

describe("bowtie renderer", () => {
  it("is registered", () => {
    expect(hasRenderer("bowtie")).toBe(true);
  });

  it("shows five empty slots and the three lists of choices", () => {
    render(<ItemPlayer item={bowtie} />);
    expect(actionSlot(1)).toHaveAccessibleName(`${ACTIONS} 1 of 2, empty`);
    expect(actionSlot(2)).toHaveAccessibleName(`${ACTIONS} 2 of 2, empty`);
    expect(conditionSlot()).toHaveAccessibleName(`${CONDITION}, empty`);
    expect(parameterSlot(1)).toHaveAccessibleName(`${PARAMETERS} 1 of 2, empty`);
    expect(within(choices(ACTIONS)).getAllByRole("button")).toHaveLength(5);
    expect(within(choices(CONDITION)).getAllByRole("button")).toHaveLength(4);
    expect(within(choices(PARAMETERS)).getAllByRole("button")).toHaveLength(5);
    expect(submit()).toBeDisabled();
  });

  it("places a choice by tapping it, then a slot in its column", async () => {
    render(<ItemPlayer item={bowtie} />);
    await userEvent.click(choice(ACTIONS, ECG));
    expect(choice(ACTIONS, ECG)).toHaveAttribute("aria-pressed", "true");
    expect(status()).toHaveTextContent(`${ECG} selected. Choose a slot in ${ACTIONS}.`);

    await userEvent.click(actionSlot(1));
    expect(actionSlot(1)).toHaveAccessibleName(`${ACTIONS} 1 of 2: ${ECG}`);
    expect(within(choices(ACTIONS)).queryByRole("button", { name: ECG })).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(`${ECG} placed in ${ACTIONS} 1 of 2.`);
  });

  it("refuses a slot in another column and says why", async () => {
    render(<ItemPlayer item={bowtie} />);
    await userEvent.click(choice(ACTIONS, ECG));
    await userEvent.click(conditionSlot());
    expect(conditionSlot()).toHaveAccessibleName(`${CONDITION}, empty`);
    expect(status()).toHaveTextContent(`${ECG} belongs in ${ACTIONS}, not ${CONDITION}.`);
    expect(choice(ACTIONS, ECG)).toHaveAttribute("aria-pressed", "true");
  });

  it("explains a full column, then swaps a filled slot", async () => {
    render(<ItemPlayer item={bowtie} />);
    await place(ACTIONS, ECG, actionSlot(1));
    await place(ACTIONS, ASPIRIN, actionSlot(2));
    await userEvent.click(choice(ACTIONS, WALK));
    expect(status()).toHaveTextContent(
      `${WALK} selected. ${ACTIONS} is full: choose one of its slots to swap.`,
    );

    await userEvent.click(actionSlot(1));
    expect(actionSlot(1)).toHaveAccessibleName(`${ACTIONS} 1 of 2: ${WALK}`);
    expect(choice(ACTIONS, ECG)).toBeInTheDocument();
  });

  it("clears a filled slot tapped with nothing selected, and cancels with Escape", async () => {
    render(<ItemPlayer item={bowtie} />);
    await place(CONDITION, MI, conditionSlot());
    await userEvent.click(conditionSlot());
    expect(conditionSlot()).toHaveAccessibleName(`${CONDITION}, empty`);
    expect(status()).toHaveTextContent(`${MI} removed from ${CONDITION}.`);

    choice(CONDITION, GERD).focus();
    await userEvent.keyboard(" ");
    expect(choice(CONDITION, GERD)).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Escape}");
    expect(choice(CONDITION, GERD)).toHaveAttribute("aria-pressed", "false");
  });

  it("needs all five slots, then scores each slot and lists the right answers", async () => {
    render(<ItemPlayer item={bowtie} />);
    await place(ACTIONS, ECG, actionSlot(1));
    await place(ACTIONS, WALK, actionSlot(2));
    await place(CONDITION, GERD, conditionSlot());
    await place(PARAMETERS, TROPONIN, parameterSlot(1));
    expect(submit()).toBeDisabled();
    await place(PARAMETERS, BOWEL, parameterSlot(2));
    expect(submit()).toBeEnabled();
    await userEvent.click(submit());

    const panel = scorePanel();
    expect(within(panel).getByText("2")).toBeInTheDocument();
    expect(within(panel).getByText("/ 5")).toBeInTheDocument();
    expect(within(panel).getByText(/order within a pair does not matter/)).toBeInTheDocument();
    expect(screen.getAllByText("Correct")).toHaveLength(2);
    expect(screen.getAllByText("Incorrect")).toHaveLength(3);
    expect(screen.getByText(`Correct: ${ECG}; ${ASPIRIN}`)).toBeInTheDocument();
    expect(screen.getByText(`Correct: ${MI}`)).toBeInTheDocument();
    expect(screen.getByText(`Correct: ${TROPONIN}; ${RHYTHM}`)).toBeInTheDocument();
    expect(actionSlot(1)).toBeDisabled();
    expect(screen.queryByRole("group", { name: `${ACTIONS} choices` })).not.toBeInTheDocument();
  });

  it("scores full marks with each pair in either order", async () => {
    render(<ItemPlayer item={bowtie} />);
    await place(ACTIONS, ASPIRIN, actionSlot(1));
    await place(ACTIONS, ECG, actionSlot(2));
    await place(CONDITION, MI, conditionSlot());
    await place(PARAMETERS, RHYTHM, parameterSlot(1));
    await place(PARAMETERS, TROPONIN, parameterSlot(2));
    await userEvent.click(submit());

    expect(within(scorePanel()).getByText("5")).toBeInTheDocument();
    expect(screen.queryByText(/^Correct: /)).not.toBeInTheDocument();
  });
});
