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
});
