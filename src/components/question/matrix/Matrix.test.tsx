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

const mmc = itemSchema.parse(FIXTURES.matrix_multiple_choice.canonical);
const mmcEdge = itemSchema.parse(FIXTURES.matrix_multiple_choice.edge);
const mmrEdge = itemSchema.parse(FIXTURES.matrix_multiple_response.edge);

// Both layouts are always in the DOM; CSS decides which one shows. jsdom applies no CSS,
// so each query is scoped to the grid (the table) or to one row card (a labelled group).
const grid = () => screen.getByRole("table");
const card = (rowLabel: string) => screen.getByRole("group", { name: rowLabel });
const submit = () => screen.getByRole("button", { name: "Submit" });

const O2 = "Oxygen saturation 96% on room air";
const RR = "Respiratory rate 32 breaths/min";

describe("matrix renderers", () => {
  it("are registered for both matrix types", () => {
    expect(hasRenderer("matrix_multiple_choice")).toBe(true);
    expect(hasRenderer("matrix_multiple_response")).toBe(true);
  });
});

describe("matrix multiple choice", () => {
  it("renders a table whose cells are named by their row and column headers", async () => {
    render(<ItemPlayer item={mmc} submit={scoreInProcess(mmc)} />);
    await renderersLoaded();
    const table = grid();
    for (const column of ["Indicated", "Contraindicated", "Non-essential"]) {
      expect(within(table).getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    expect(
      within(table).getByRole("rowheader", { name: "Keep the client NPO initially" }),
    ).toBeInTheDocument();
    expect(within(table).getAllByRole("radio")).toHaveLength(15);
    expect(
      within(table).getByRole("radio", { name: "Keep the client NPO initially Indicated" }),
    ).not.toBeChecked();
  });

  it("keeps the grid and the row cards on one response", async () => {
    render(<ItemPlayer item={mmcEdge} submit={scoreInProcess(mmcEdge)} />);
    await renderersLoaded();
    await userEvent.click(within(grid()).getByRole("radio", { name: `${O2} Improved` }));
    expect(within(card(O2)).getByRole("radio", { name: `${O2} Improved` })).toBeChecked();

    await userEvent.click(within(card(O2)).getByRole("radio", { name: `${O2} Declined` }));
    expect(within(grid()).getByRole("radio", { name: `${O2} Declined` })).toBeChecked();
    expect(within(grid()).getByRole("radio", { name: `${O2} Improved` })).not.toBeChecked();
  });

  // #60: on a phone a screen reader can skip the card's group name, and then "Improved", once
  // per card, gave no clue which finding it answered. The card names each control by its row and
  // its column, as the grid does.
  it("names each row card's controls by their row and column, like the grid", () => {
    render(<ItemPlayer item={mmcEdge} submit={scoreInProcess(mmcEdge)} />);
    const rr = card(RR);
    expect(within(rr).getByRole("radio", { name: `${RR} Improved` })).toBeInTheDocument();
    expect(within(rr).getByRole("radio", { name: `${RR} Declined` })).toBeInTheDocument();
    expect(within(rr).queryByRole("radio", { name: "Improved" })).not.toBeInTheDocument();
    // The visible column text is in the name, so it is not exposed a second time beside it.
    expect(within(rr).getByText("Improved").closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("moves along a row with the arrow keys", async () => {
    render(<ItemPlayer item={mmcEdge} submit={scoreInProcess(mmcEdge)} />);
    await renderersLoaded();
    await userEvent.click(within(grid()).getByRole("radio", { name: `${O2} Improved` }));
    await userEvent.keyboard("{ArrowRight}");
    expect(within(grid()).getByRole("radio", { name: `${O2} Declined` })).toBeChecked();
    expect(within(grid()).getByRole("radio", { name: `${RR} Declined` })).not.toBeChecked();
  });

  it("enables submit only when every row is answered, then scores 0/1 per row", async () => {
    render(<ItemPlayer item={mmcEdge} submit={scoreInProcess(mmcEdge)} />);
    await renderersLoaded();
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(grid()).getByRole("radio", { name: `${O2} Improved` }));
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(grid()).getByRole("radio", { name: `${RR} Improved` }));
    expect(submit()).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();

    await userEvent.click(submit());

    await feedbackShown();

    const score = screen.getByRole("complementary", { name: "Score" });
    expect(within(score).getByText("1")).toBeInTheDocument();
    expect(within(score).getByText("/ 2")).toBeInTheDocument();
    const table = grid();
    expect(within(table).getAllByText("Correct")).toHaveLength(1);
    expect(within(table).getAllByText("Incorrect")).toHaveLength(1);
    expect(within(table).getAllByText("Missed")).toHaveLength(1);
    expect(within(table).getByText("1/1")).toBeInTheDocument();
    expect(within(table).getByText("0/1")).toBeInTheDocument();
    for (const radio of within(table).getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  // #60 review: an explicit aria-labelledby replaces the name from the label's content, so the
  // verdict must be one of the ids it points at, in both views, or it is read zero times.
  describe("after submit, each control's name carries its verdict", () => {
    const answerAndSubmit = async () => {
      render(<ItemPlayer item={mmcEdge} submit={scoreInProcess(mmcEdge)} />);
      await userEvent.click(within(grid()).getByRole("radio", { name: `${O2} Improved` }));
      await userEvent.click(within(grid()).getByRole("radio", { name: `${RR} Improved` }));
      await userEvent.click(submit());
    };
    /** Verdict text a screen reader would meet as content, outside any name. */
    const exposedVerdicts = (container: HTMLElement) =>
      ["Correct", "Incorrect", "Missed"]
        .flatMap((text) => within(container).queryAllByText(text))
        .filter((element) => !element.closest('[aria-hidden="true"]'));

    it("in a phone row card", async () => {
      await answerAndSubmit();
      expect(within(card(O2)).getByRole("radio", { name: `${O2} Improved Correct` })).toBeChecked();
      expect(
        within(card(RR)).getByRole("radio", { name: `${RR} Improved Incorrect` }),
      ).toBeChecked();
      expect(
        within(card(RR)).getByRole("radio", { name: `${RR} Declined Missed` }),
      ).not.toBeChecked();
      expect(exposedVerdicts(card(RR))).toHaveLength(0);
    });

    it("in the grid", async () => {
      await answerAndSubmit();
      expect(within(grid()).getByRole("radio", { name: `${O2} Improved Correct` })).toBeChecked();
      expect(within(grid()).getByRole("radio", { name: `${RR} Improved Incorrect` })).toBeChecked();
      expect(
        within(grid()).getByRole("radio", { name: `${RR} Declined Missed` }),
      ).not.toBeChecked();
      expect(exposedVerdicts(grid())).toHaveLength(0);
    });
  });
});

describe("matrix multiple response", () => {
  it("allows several selections per row and needs one in every row", async () => {
    render(<ItemPlayer item={mmrEdge} submit={scoreInProcess(mmrEdge)} />);
    await renderersLoaded();
    await userEvent.click(within(grid()).getByRole("checkbox", { name: "Warfarin INR" }));
    await userEvent.click(
      within(grid()).getByRole("checkbox", { name: "Warfarin Signs of bleeding" }),
    );
    expect(within(grid()).getByRole("checkbox", { name: "Warfarin INR" })).toBeChecked();
    expect(within(card("Warfarin")).getByRole("checkbox", { name: "Warfarin INR" })).toBeChecked();
    expect(submit()).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(
      within(card("Furosemide")).getByRole("checkbox", { name: "Furosemide Daily weight" }),
    );
    expect(submit()).not.toHaveAttribute("aria-disabled");

    await userEvent.click(within(card("Warfarin")).getByRole("checkbox", { name: "Warfarin INR" }));
    expect(within(grid()).getByRole("checkbox", { name: "Warfarin INR" })).not.toBeChecked();
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
  });

  it("scores plus-minus within each row and shows each row's points", async () => {
    render(<ItemPlayer item={mmrEdge} submit={scoreInProcess(mmrEdge)} />);
    await renderersLoaded();
    const table = grid();
    for (const name of [
      "Warfarin INR",
      "Warfarin Serum potassium",
      "Furosemide Serum potassium",
      "Furosemide Daily weight",
    ]) {
      await userEvent.click(within(table).getByRole("checkbox", { name }));
    }
    await userEvent.click(submit());
    await feedbackShown();

    const score = screen.getByRole("complementary", { name: "Score" });
    expect(within(score).getByText("2")).toBeInTheDocument();
    expect(within(score).getByText("/ 4")).toBeInTheDocument();
    expect(within(grid()).getAllByText("Correct")).toHaveLength(3);
    expect(within(grid()).getAllByText("Incorrect")).toHaveLength(1);
    expect(within(grid()).getAllByText("Missed")).toHaveLength(1);
    expect(within(grid()).getByText("0/2")).toBeInTheDocument();
    expect(within(grid()).getByText("2/2")).toBeInTheDocument();
  });
});
