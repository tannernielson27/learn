import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { ItemPlayer } from "../ItemPlayer";
import { hasRenderer } from "../registry";
import { OrderedResponseItem } from "./OrderedResponseItem";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { feedbackShown } from "@/components/question/testing/feedback";

const wholeItem = itemSchema.parse(FIXTURES.ordered_response.canonical);
const byPosition = itemSchema.parse(FIXTURES.ordered_response.edge);

const KEY = [
  "Call for help and activate the emergency response",
  "Begin chest compressions",
  "Apply the defibrillator pads when the device arrives",
  "Analyze the rhythm",
  "Deliver a shock if advised",
];

const list = () => screen.getByRole("list", { name: "Steps in order" });
const order = () =>
  within(list())
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-label"));
const up = (label: string) => screen.getByRole("button", { name: `Move "${label}" up` });
const down = (label: string) => screen.getByRole("button", { name: `Move "${label}" down` });
// Named, so this never depends on dnd-kit's own status region staying hidden (#60).
const status = () => screen.getByRole("status", { name: "Order changes" });
const submit = () => screen.getByRole("button", { name: "Submit" });
const scorePanel = () => screen.getByRole("complementary", { name: "Score" });

/** Put the steps in the target order using only the Move up buttons. */
async function arrange(target: readonly string[]) {
  for (const [index, label] of target.entries()) {
    while (order().indexOf(label) > index) await userEvent.click(up(label));
  }
}

describe("ordered response renderer", () => {
  it("is registered", () => {
    expect(hasRenderer("ordered_response")).toBe(true);
  });

  it("starts in an order other than the authored one, ready to submit", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    const start = order();
    expect([...start].sort()).toEqual([...KEY].sort());
    expect(start).not.toEqual(KEY);
    expect(submit()).not.toHaveAttribute("aria-disabled");
    expect(up(start[0]!)).toBeDisabled();
    expect(down(start[4]!)).toBeDisabled();
    expect(down(start[0]!)).toBeEnabled();
  });

  it("never falls back to the authored order when the answer is missing", async () => {
    if (wholeItem.type !== "ordered_response") throw new Error("fixture type");
    const Renderer = OrderedResponseItem;
    render(
      <Renderer
        item={wholeItem}
        response={{ type: "ordered_response", orderedIds: [] }}
        mode="answer"
        onChange={() => {}}
      />,
    );
    await renderersLoaded();
    expect(order()).not.toEqual(KEY);
    expect([...order()].sort()).toEqual([...KEY].sort());
  });

  it("moves a step with the buttons and announces its new position", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    const first = order()[0]!;
    await userEvent.click(down(first));
    expect(order()[1]).toBe(first);
    expect(status()).toHaveTextContent(`${first}, position 2 of 5.`);
  });

  it("keeps focus on the moved step", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    const third = order()[2]!;
    up(third).focus();
    await userEvent.keyboard("{Enter}");
    expect(order()[1]).toBe(third);
    expect(up(third)).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(order()[0]).toBe(third);
    // At the top the up button is disabled, so focus moves to the step's down button.
    expect(down(third)).toHaveFocus();
  });

  it("scores the whole order and shows where each misplaced step belongs", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    await arrange([KEY[1]!, KEY[0]!, KEY[2]!, KEY[3]!, KEY[4]!]);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText("/ 1")).toBeInTheDocument();
    expect(within(panel).getByText(/whole order must be exact/)).toBeInTheDocument();
    expect(screen.getByText("Correct position: 1")).toBeInTheDocument();
    expect(screen.getByText("Correct position: 2")).toBeInTheDocument();
    expect(screen.getAllByText("Incorrect")).toHaveLength(2);
    expect(screen.getAllByText("Correct")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });

  // #60: this read "Correct position: 1 Incorrect", the verdict after the correction. Now a
  // misplaced step reads its verdict first, then where it belongs.
  it("reads a misplaced step's verdict before its correct position", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    await arrange([KEY[1]!, KEY[0]!, KEY[2]!, KEY[3]!, KEY[4]!]);
    await userEvent.click(submit());
    await feedbackShown();

    const row = within(list())
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("data-label") === KEY[0])!;
    const verdict = within(row).getByText("Incorrect");
    const position = within(row).getByText("Correct position: 1");
    expect(
      verdict.compareDocumentPosition(position) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(row.textContent).toMatch(new RegExp(`${KEY[0]}\\s*Incorrect\\s*Correct position: 1`));
  });

  it("earns the point for the exact order", async () => {
    render(<ItemPlayer item={wholeItem} submit={scoreInProcess(wholeItem)} />);
    await renderersLoaded();
    await arrange(KEY);
    await userEvent.click(submit());
    await feedbackShown();
    expect(within(scorePanel()).getByText("1")).toBeInTheDocument();
    expect(within(scorePanel()).getByText("/ 1")).toBeInTheDocument();
  });

  it("gives a point per correct position when the item scores by position", async () => {
    render(<ItemPlayer item={byPosition} submit={scoreInProcess(byPosition)} />);
    await renderersLoaded();
    await arrange([
      "Verify the prescription against the MAR",
      "Identify the client using two identifiers",
      "Perform hand hygiene and prepare the medication",
      "Cleanse the site and inject",
    ]);
    await userEvent.click(submit());
    await feedbackShown();

    const panel = scorePanel();
    expect(within(panel).getByText("2")).toBeInTheDocument();
    expect(within(panel).getByText("/ 4")).toBeInTheDocument();
    expect(within(panel).getByText(/Each step in its correct position/)).toBeInTheDocument();
  });
});
