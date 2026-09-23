import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { distributionFor, type ChoiceCount, type Distribution } from "@/lib/live/results";
import { allFixtures, FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { DistributionView } from "./DistributionView";

/** Every choice in a distribution, wherever it sits. */
function choicesOf(distribution: Distribution): ChoiceCount[] {
  switch (distribution.kind) {
    case "options":
      return distribution.options;
    case "grid":
      return distribution.rows.flatMap((row) => row.cells);
    case "blanks":
    case "pairs":
      return distribution.blanks.flatMap((blank) => blank.choices);
    case "slots":
      return distribution.slots.flatMap((slot) => slot.choices);
    case "order":
      return distribution.positions.flatMap((position) => position.choices);
  }
}

/** Each fixture's canonical item, answered by every scoring case it documents. */
const ROOMS = allFixtures.map((fixture) => ({
  type: fixture.type,
  distribution: distributionFor(
    itemSchema.parse(fixture.canonical) as Item,
    fixture.cases.map((sample) => sample.response),
  ),
}));

describe("DistributionView: every item type (#180)", () => {
  it("covers all fourteen types", () => {
    expect(ROOMS).toHaveLength(14);
  });

  it.each(ROOMS)("$type: draws each choice with its count as text", ({ distribution }) => {
    const { container } = render(<DistributionView distribution={distribution} revealed={false} />);
    const drawn = [
      ...screen.queryAllByTestId("result-choice"),
      ...screen.queryAllByTestId("result-cell"),
    ];
    // Not a bare count: one drawn row or cell per choice the item has.
    expect(drawn.length).toBe(choicesOf(distribution).length);
    const text = container.textContent ?? "";
    for (const choice of choicesOf(distribution)) expect(text).toContain(choice.label);
    expect(text).toMatch(/\d+%/);
    expect(text).toContain(`${distribution.responded} answers counted`);
  });

  it.each(ROOMS)(
    "$type: marks nothing correct before the answer is showing",
    ({ distribution }) => {
      render(<DistributionView distribution={distribution} revealed={false} />);
      expect(screen.queryAllByTestId("result-correct")).toHaveLength(0);
      expect(screen.queryByText("Correct")).toBeNull();
      expect(screen.queryByTestId("result-summary")).toBeNull();
      expect(screen.queryByText("Most common wrong combinations")).toBeNull();
      // No bar is drawn in the colour a correct one takes, either.
      expect(document.querySelector(".bg-correct")).toBeNull();
    },
  );

  it.each(ROOMS)("$type: marks the correct choices in words once it is", ({ distribution }) => {
    render(<DistributionView distribution={distribution} revealed />);
    const marks = screen.getAllByTestId("result-correct");
    const correct = choicesOf(distribution).filter((choice) => choice.correct);
    expect(marks).toHaveLength(correct.length);
    for (const mark of marks) expect(mark).toHaveTextContent("Correct");
  });
});

describe("DistributionView: select all that apply", () => {
  const item = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item & {
    type: "multiple_response";
  };
  const [first, second, third] = item.content.options;
  const answers = [
    { type: "multiple_response", optionIds: [first?.id, second?.id] },
    { type: "multiple_response", optionIds: [first?.id] },
    { type: "multiple_response", optionIds: [first?.id, third?.id] },
  ];
  const distribution = distributionFor(item, answers);

  it("says each option's count as a share of the answers, and draws the same share", () => {
    render(<DistributionView distribution={distribution} revealed={false} />);
    const options = screen.getByRole("list", { name: "Options" });
    const row = within(options)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes(first?.label ?? "?"));
    expect(row).toHaveTextContent("3 of 3 · 100%");
    const secondRow = within(options)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes(second?.label ?? "?"));
    expect(secondRow).toHaveTextContent("1 of 3 · 33%");
    expect(secondRow?.querySelector("[data-share]")?.getAttribute("style")).toContain(
      "scaleX(0.3333",
    );
  });

  it("says how many answers could not be read, when some could not", () => {
    render(
      <DistributionView
        distribution={distributionFor(item, [...answers, { nonsense: true }])}
        revealed={false}
      />,
    );
    expect(screen.getByText("1 could not be read and are not counted")).toBeInTheDocument();
  });

  it("says how many chose nothing", () => {
    render(
      <DistributionView
        distribution={distributionFor(item, [{ type: "multiple_response", optionIds: [] }])}
        revealed={false}
      />,
    );
    expect(screen.getByText("1 chose no option")).toBeInTheDocument();
    expect(screen.getByText("1 answer counted")).toBeInTheDocument();
  });
});

describe("DistributionView: the rationale types", () => {
  const item = itemSchema.parse(FIXTURES.dropdown_rationale.canonical) as Item;
  const distribution = distributionFor(
    item,
    FIXTURES.dropdown_rationale.cases.map((sample) => sample.response),
  );

  it("lists the common wrong combinations only after the reveal", () => {
    const { rerender } = render(<DistributionView distribution={distribution} revealed={false} />);
    expect(screen.queryByRole("list", { name: "Most common wrong combinations" })).toBeNull();
    rerender(<DistributionView distribution={distribution} revealed />);
    const list = screen.getByRole("list", { name: "Most common wrong combinations" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByTestId("result-summary")).toHaveTextContent(
      /\d+ of \d+ filled every blank correctly/,
    );
  });
});

describe("DistributionView: heat maps", () => {
  it("puts a matrix in a table with a header for every row and column", () => {
    const item = itemSchema.parse(FIXTURES.matrix_multiple_choice.canonical) as Item & {
      type: "matrix_multiple_choice";
    };
    const distribution = distributionFor(
      item,
      FIXTURES.matrix_multiple_choice.cases.map((sample) => sample.response),
    );
    render(<DistributionView distribution={distribution} revealed={false} />);
    const table = screen.getByRole("table", { name: "Answers by row and column" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(
      item.content.columns.length + 1,
    );
    expect(within(table).getAllByRole("rowheader")).toHaveLength(item.content.rows.length);
    // The region it scrolls in at 375px can be reached and scrolled from the keyboard.
    expect(screen.getByRole("region", { name: "Answers by row and column" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("names its region after the item when a page shows several", () => {
    const distribution = distributionFor(
      itemSchema.parse(FIXTURES.ordered_response.canonical) as Item,
      [],
    );
    render(<DistributionView distribution={distribution} revealed={false} name="Ordered" />);
    expect(
      screen.getByRole("region", { name: "Ordered: answers by position" }),
    ).toBeInTheDocument();
  });

  it("says how many got a whole order right only after the reveal", () => {
    const item = itemSchema.parse(FIXTURES.ordered_response.canonical) as Item;
    const distribution = distributionFor(
      item,
      FIXTURES.ordered_response.cases.map((sample) => sample.response),
    );
    const { rerender } = render(<DistributionView distribution={distribution} revealed={false} />);
    expect(screen.queryByTestId("result-summary")).toBeNull();
    rerender(<DistributionView distribution={distribution} revealed />);
    expect(screen.getByTestId("result-summary")).toHaveTextContent(
      /\d+ of \d+ put every step in the right order/,
    );
  });
});
