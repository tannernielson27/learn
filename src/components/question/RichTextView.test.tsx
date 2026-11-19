import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichTextView } from "./RichTextView";

const text = (value: string) => ({ kind: "markdown" as const, value });

describe("RichTextView", () => {
  it("shows paragraphs split on blank lines", () => {
    const { container } = render(<RichTextView text={text("One.\n\nTwo.")} />);
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "One.",
      "Two.",
    ]);
  });

  // #605: "the laboratory results above" are a table a student can read, not a row of pipes.
  it("shows a pipe table as a table, with the question after it", () => {
    render(
      <RichTextView
        text={text(
          "| Test | Result | Reference range |\n| --- | --- | --- |\n| Potassium | 3.0 mEq/L | 3.5 to 5.0 mEq/L |\n\nWhich action should the nurse take first?",
        )}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Potassium" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "3.0 mEq/L" })).toBeInTheDocument();
    expect(screen.queryByText(/\|/)).not.toBeInTheDocument();
    expect(screen.getByText("Which action should the nurse take first?")).toBeInTheDocument();
  });

  // In a stem the table follows the text around it: sized to it (the projector fits a stem by its
  // font size), with no sticky column painted in the chart's surface colour.
  it("sizes the table to the text it sits in, with no sticky column", () => {
    render(<RichTextView text={text("| A | B |\n| --- | --- |\n| 1 | 2 |")} />);
    const table = screen.getByRole("table");
    expect(table.className).not.toMatch(/\btext-sm\b/);
    expect(table.innerHTML).not.toMatch(/sticky|bg-surface-1/);
  });

  it("never draws an empty header: a blank header cell or row head is a plain cell", () => {
    render(<RichTextView text={text("| Test | | Ref |\n| --- | --- | --- |\n|  | 3.0 | 3.5 |")} />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Test",
      "Ref",
    ]);
    expect(screen.queryAllByRole("rowheader")).toEqual([]);
  });
});
