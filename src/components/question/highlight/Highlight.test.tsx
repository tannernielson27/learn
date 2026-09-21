import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "../ItemPlayer";
import { hasRenderer } from "../registry";
import { renderersLoaded } from "@/components/question/testing/renderers";

const text = itemSchema.parse(FIXTURES.highlight_text.canonical);
const perRow = itemSchema.parse(FIXTURES.highlight_table.canonical);
const wholeItem = itemSchema.parse(FIXTURES.highlight_table.edge);

const span = (name: string) => screen.getByRole("button", { name });
const submit = () => screen.getByRole("button", { name: "Submit" });
const scorePanel = () => screen.getByRole("complementary", { name: "Score" });
// Like the matrix, the table renders a grid and row cards from one response; jsdom applies no
// CSS, so queries are scoped to the grid (the table) or to one row card (a labelled group).
const grid = () => screen.getByRole("table");
const card = (rowLabel: string) => screen.getByRole("group", { name: rowLabel });

const HR = "Heart rate 54 and irregular";
const BP = "Blood pressure 128/78";
const SAT = "Oxygen saturation 91% on 2 L nasal cannula";

describe("highlight renderers", () => {
  it("are registered for text and table", () => {
    expect(hasRenderer("highlight_text")).toBe(true);
    expect(hasRenderer("highlight_table")).toBe(true);
  });
});

describe("highlight text", () => {
  it("makes only the author's spans selectable, with nothing marked before submit", async () => {
    render(<ItemPlayer item={text} submit={scoreInProcess(text)} />);
    await renderersLoaded();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(5);
    expect(span(HR)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/71-year-old client admitted overnight/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /71-year-old/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Missed")).not.toBeInTheDocument();
  });

  it("toggles a span by click, Space and Enter, and needs one before submit", async () => {
    render(<ItemPlayer item={text} submit={scoreInProcess(text)} />);
    await renderersLoaded();
    expect(submit()).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(span(HR));
    expect(span(HR)).toHaveAttribute("aria-pressed", "true");
    expect(submit()).not.toHaveAttribute("aria-disabled");
    await userEvent.click(span(HR));
    expect(span(HR)).toHaveAttribute("aria-pressed", "false");
    expect(submit()).toHaveAttribute("aria-disabled", "true");

    span(BP).focus();
    await userEvent.keyboard(" ");
    expect(span(BP)).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Enter}");
    expect(span(BP)).toHaveAttribute("aria-pressed", "false");
  });

  it("puts each span's feedback in its name, where a reader moving span to span hears it", async () => {
    render(<ItemPlayer item={text} submit={scoreInProcess(text)} />);
    await renderersLoaded();
    await userEvent.click(span(HR));
    await userEvent.click(span(BP));
    await userEvent.click(submit());
    expect(
      screen.getByRole("button", { name: /^Heart rate 54 and irregular, Correct$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Blood pressure 128\/78, Incorrect$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Oxygen saturation 91%.*, Missed$/ }),
    ).toBeInTheDocument();
  });

  it("scores plus-minus and marks correct, incorrect and missed spans", async () => {
    render(<ItemPlayer item={text} submit={scoreInProcess(text)} />);
    await renderersLoaded();
    for (const name of [HR, SAT, BP]) await userEvent.click(span(name));
    await userEvent.click(submit());

    expect(within(scorePanel()).getByText("1")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 3")).toBeInTheDocument();
    expect(screen.getAllByText(", Correct")).toHaveLength(2);
    expect(screen.getAllByText(", Incorrect")).toHaveLength(1);
    expect(screen.getAllByText(", Missed")).toHaveLength(1);
    // Feedback now forms part of the name, so match its start.
    expect(screen.getByRole("button", { name: /^Heart rate 54 and irregular/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("highlight table", () => {
  it("lays spans out under the column headers", async () => {
    render(<ItemPlayer item={perRow} submit={scoreInProcess(perRow)} />);
    await renderersLoaded();
    const table = grid();
    expect(within(table).getByRole("columnheader", { name: "Body system" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Findings" })).toBeInTheDocument();
    expect(within(table).getAllByRole("button", { pressed: false })).toHaveLength(7);
    expect(within(table).queryByRole("button", { name: "General" })).not.toBeInTheDocument();
  });

  it("keeps the grid and the row cards on one response", async () => {
    render(<ItemPlayer item={perRow} submit={scoreInProcess(perRow)} />);
    await renderersLoaded();
    await userEvent.click(within(grid()).getByRole("button", { name: "afebrile" }));
    expect(within(card("General")).getByRole("button", { name: "afebrile" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("scores each row on its own when scorePerRow is set", async () => {
    render(<ItemPlayer item={perRow} submit={scoreInProcess(perRow)} />);
    await renderersLoaded();
    for (const name of [
      "Lethargic, difficult to arouse",
      "afebrile",
      "no rash",
      "Two wet diapers in 24 hours",
    ]) {
      await userEvent.click(within(grid()).getByRole("button", { name }));
    }
    await userEvent.click(submit());

    const panel = scorePanel();
    expect(within(panel).getByText("1")).toBeInTheDocument();
    expect(within(panel).getByText("/ 4")).toBeInTheDocument();
    expect(within(panel).getByText(/Each row is scored on its own/)).toBeInTheDocument();
    expect(within(grid()).getByText("0/1")).toBeInTheDocument();
    expect(within(grid()).getByText("0/2")).toBeInTheDocument();
    expect(within(grid()).getByText("1/1")).toBeInTheDocument();
  });

  it("scores the whole item at once without scorePerRow", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    await userEvent.click(within(grid()).getByRole("button", { name: "Heart rate 52" }));
    await userEvent.click(within(grid()).getByRole("button", { name: "Warm, moist skin" }));
    await userEvent.click(submit());

    expect(within(scorePanel()).getByText("0")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 3")).toBeInTheDocument();
    expect(screen.queryByText(/Row score/)).not.toBeInTheDocument();
    expect(within(scorePanel()).queryByText(/scored on its own/)).not.toBeInTheDocument();
  });
});
