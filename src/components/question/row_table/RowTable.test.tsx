import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "../ItemPlayer";
import { hasRenderer } from "../registry";

const table = itemSchema.parse(FIXTURES.dropdown_table.canonical);
const grouping = itemSchema.parse(FIXTURES.multiple_response_grouping.canonical);

// Both layouts are always in the DOM; CSS decides which one shows. jsdom applies no CSS,
// so queries are scoped to the grid (the table) or to one row card (a group outside the table).
const grid = () => screen.getByRole("table");
const card = (rowLabel: string) => {
  const found = screen
    .getAllByRole("group", { name: rowLabel })
    .find((group) => !group.closest("table"));
  if (!found) throw new Error(`no row card named ${rowLabel}`);
  return found;
};
const submit = () => screen.getByRole("button", { name: "Submit" });
const scorePanel = () => screen.getByRole("complementary", { name: "Score" });

const DIGOXIN = "Digoxin 0.125 mg PO";
const INSULIN = "Insulin lispro 4 units subcut";
const METOPROLOL = "Metoprolol 25 mg PO";

describe("row-table renderers", () => {
  it("are registered for drop-down table and response grouping", () => {
    expect(hasRenderer("dropdown_table")).toBe(true);
    expect(hasRenderer("multiple_response_grouping")).toBe(true);
  });
});

describe("drop-down table", () => {
  it("renders a two-column table whose drop-downs are named by row and column", () => {
    render(<ItemPlayer item={table} submit={scoreInProcess(table)} />);
    const t = grid();
    expect(within(t).getByRole("columnheader", { name: "Medication" })).toBeInTheDocument();
    expect(within(t).getByRole("columnheader", { name: "Nursing action" })).toBeInTheDocument();
    expect(within(t).getByRole("rowheader", { name: DIGOXIN })).toBeInTheDocument();
    const select = within(t).getByRole("combobox", { name: `${DIGOXIN} Nursing action` });
    expect(select).toHaveValue("");
    expect(within(card(DIGOXIN)).getByRole("combobox", { name: "Nursing action" })).toHaveValue("");
  });

  it("keeps the grid and the row cards on one response", async () => {
    render(<ItemPlayer item={table} submit={scoreInProcess(table)} />);
    await userEvent.selectOptions(
      within(grid()).getByRole("combobox", { name: `${DIGOXIN} Nursing action` }),
      "Check apical pulse for one full minute",
    );
    expect(within(card(DIGOXIN)).getByRole("combobox", { name: "Nursing action" })).toHaveValue(
      "dig_a",
    );
  });

  it("enables submit only when every row has a choice, then scores 0/1 per row", async () => {
    render(<ItemPlayer item={table} submit={scoreInProcess(table)} />);
    const pick = (row: string, label: string) =>
      userEvent.selectOptions(
        within(grid()).getByRole("combobox", { name: `${row} Nursing action` }),
        label,
      );
    await pick(DIGOXIN, "Check blood glucose");
    await pick(INSULIN, "Check blood glucose and confirm meal is available");
    expect(submit()).toBeDisabled();
    await pick(METOPROLOL, "Assess blood pressure and heart rate");
    expect(submit()).toBeEnabled();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();

    await userEvent.click(submit());

    expect(within(scorePanel()).getByText("2")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 3")).toBeInTheDocument();
    const t = grid();
    expect(within(t).getAllByText("Correct")).toHaveLength(2);
    expect(within(t).getAllByText("Incorrect")).toHaveLength(1);
    expect(within(t).getAllByText("1/1")).toHaveLength(2);
    expect(within(t).getByText("0/1")).toBeInTheDocument();
    expect(
      within(t).getByText(/Correct answer: Check apical pulse for one full minute/),
    ).toBeInTheDocument();
    for (const select of within(t).getAllByRole("combobox")) expect(select).toBeDisabled();
  });
});

describe("multiple response grouping", () => {
  it("groups each row's checkboxes under the row name and shares state with the cards", async () => {
    render(<ItemPlayer item={grouping} submit={scoreInProcess(grouping)} />);
    const t = grid();
    expect(within(t).getByRole("rowheader", { name: "Respiratory" })).toBeInTheDocument();
    const respiratory = within(t).getByRole("group", { name: "Respiratory" });
    expect(within(respiratory).getAllByRole("checkbox")).toHaveLength(3);

    await userEvent.click(
      within(respiratory).getByRole("checkbox", { name: "Fruity breath odor" }),
    );
    expect(
      within(card("Respiratory")).getByRole("checkbox", { name: "Fruity breath odor" }),
    ).toBeChecked();
  });

  it("needs a selection in every row before submit", async () => {
    render(<ItemPlayer item={grouping} submit={scoreInProcess(grouping)} />);
    await userEvent.click(within(grid()).getByRole("checkbox", { name: "Drowsiness" }));
    await userEvent.click(within(grid()).getByRole("checkbox", { name: "Fruity breath odor" }));
    expect(submit()).toBeDisabled();
    await userEvent.click(within(card("Cardiovascular")).getByRole("checkbox", { name: /118/ }));
    expect(submit()).toBeEnabled();
  });

  it("floors a row at zero without taking points from other rows", async () => {
    render(<ItemPlayer item={grouping} submit={scoreInProcess(grouping)} />);
    const t = grid();
    for (const name of [
      "Bilateral wheezes",
      "Heart rate 118 beats/min",
      "Blood pressure 92/56 mm Hg",
      "Drowsiness",
    ]) {
      await userEvent.click(within(t).getByRole("checkbox", { name }));
    }
    await userEvent.click(submit());

    // Respiratory is -1, floored to 0; cardiovascular 2; neurologic 1. Total 3, not 2.
    expect(within(scorePanel()).getByText("3")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 5")).toBeInTheDocument();
    expect(within(grid()).getByText("0/2")).toBeInTheDocument();
    expect(within(grid()).getByText("2/2")).toBeInTheDocument();
    expect(within(grid()).getByText("1/1")).toBeInTheDocument();
  });
});
