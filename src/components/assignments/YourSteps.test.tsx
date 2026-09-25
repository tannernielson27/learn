import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildStepStandings, type StepMark } from "@/lib/ngn/stepStandings";
import { YourSteps } from "./YourSteps";

const marks = (cjmmStep: number | null, count: number, right: number, source = "assignments") =>
  Array.from({ length: count }, (_, i): StepMark => ({
    source: source as StepMark["source"],
    cjmmStep,
    points: i < right ? 1 : 0,
    maxPoints: 1,
  }));

function renderSteps(input: StepMark[]) {
  render(<YourSteps standings={buildStepStandings(input)} />);
}

describe("YourSteps (#239)", () => {
  it("says so when nothing has been marked yet", () => {
    renderSteps([]);
    expect(
      screen.getByRole("heading", { level: 3, name: "Nothing to show yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/once an assignment you answered closes/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists the six steps weakest first, each with its percent and item count", () => {
    renderSteps([...marks(1, 12, 3), ...marks(4, 5, 4), ...marks(2, 2, 0)]);
    const list = screen.getByRole("list", { name: "Your clinical judgment steps" });
    expect(list.tagName).toBe("OL");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.querySelector("h3")?.textContent)).toEqual([
      "Recognize Cues",
      "Generate Solutions",
      "Analyze Cues",
      "Prioritize Hypotheses",
      "Take Action",
      "Evaluate Outcomes",
    ]);
    expect(rows[0]).toHaveTextContent("Recognize Cues");
    expect(rows[0]).toHaveTextContent("25%");
    expect(rows[0]).toHaveTextContent("12 items");
    expect(rows[1]).toHaveTextContent("80%");
    expect(rows[1]).toHaveTextContent("5 items");
  });

  it("reads Not enough answers yet under five items, with no percent and no bar", () => {
    renderSteps([...marks(2, 2, 0), ...marks(1, 5, 5)]);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    const analyze = rows.find((row) => row.textContent?.includes("Analyze Cues")) as HTMLElement;
    expect(analyze).toHaveTextContent("Not enough answers yet");
    expect(analyze).toHaveTextContent("2 items");
    expect(analyze).not.toHaveTextContent("0%");
    expect(analyze.querySelector("[data-share]")).toBeNull();
    const single = rows.find((row) => row.textContent?.includes("Take Action")) as HTMLElement;
    expect(single).toHaveTextContent("No answers yet");
  });

  it("draws a decorative bar for a ranked step, hidden from a screen reader", () => {
    renderSteps(marks(1, 5, 2));
    const [first] = within(screen.getByRole("list")).getAllByRole("listitem");
    const bar = (first as HTMLElement).querySelector("[data-share]");
    expect(bar?.getAttribute("data-share")).toBe("0.40");
    expect(bar?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("says one item in the singular", () => {
    renderSteps(marks(3, 1, 1));
    expect(screen.getByText("Not enough answers yet (1 item)")).toBeInTheDocument();
  });

  it("shows the two sources apart once practice has marks", () => {
    renderSteps([...marks(1, 3, 1), ...marks(1, 2, 2, "practice")]);
    const [first] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(first).toHaveTextContent("5 items: 3 from assignments, 2 from practice");
  });

  it("says how many answered items had no step", () => {
    renderSteps([...marks(null, 2, 1), ...marks(1, 1, 1)]);
    expect(screen.getByText("2 items had no step and are not counted here.")).toBeInTheDocument();
  });

  it("shows items with no step even when no step has any", () => {
    renderSteps(marks(null, 1, 1));
    expect(screen.getByText("1 item had no step and is not counted here.")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});
