import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import type { ResultEntry } from "@/lib/assignments/results";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreSubmission } from "@/lib/ngn/submit";
import { AssignmentResults, type AssignmentResultsProps } from "./AssignmentResults";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);
const rowId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function answered(item: Item, response: AnyResponse, index: number): ResultEntry {
  return {
    rowId: rowId(index),
    item,
    outcome: { kind: "answered", response, score: scoreSubmission(item, response).score },
  };
}

/** Every correct option but one: the demo's "one missed SATA option". */
function mrMissingOne(item: Item): AnyResponse {
  if (item.type !== "multiple_response") throw new Error("not MR");
  return { type: "multiple_response", optionIds: item.answerKey.correctOptionIds.slice(1) };
}

function mcRight(item: Item): AnyResponse {
  if (item.type !== "multiple_choice") throw new Error("not MC");
  return { type: "multiple_choice", optionId: item.answerKey.correctOptionId };
}

const firstLine = (item: Item) => item.rationale.general?.value.split("\n")[0] ?? "";

const BASE: AssignmentResultsProps = {
  best: { attemptNumber: 2, score: 7, maxScore: 10 },
  attemptsMade: 2,
  entries: [],
  record: null,
};

/** Opens a question from the list of questions with their verdicts. */
const goTo = (position: number) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Q${position},`) }));

describe("AssignmentResults", () => {
  it("leads with the best attempt's total, in words", () => {
    render(<AssignmentResults {...BASE} />);
    const total = screen.getByRole("region", { name: "Your score" });
    expect(total).toHaveTextContent("7/10");
    expect(total).toHaveTextContent("points · 70%");
    expect(total).toHaveTextContent("Your best: attempt 2 of 2.");
  });

  it("says a single attempt is the one that counts, and keeps decimals short", () => {
    render(
      <AssignmentResults
        {...BASE}
        best={{ attemptNumber: 1, score: 1.5, maxScore: 3 }}
        attemptsMade={1}
      />,
    );
    const total = screen.getByRole("region", { name: "Your score" });
    expect(screen.getByTestId("results-total")).toHaveTextContent("1.5/3");
    // One attempt is the score: nothing is said beside it.
    expect(total.querySelectorAll("p")).toHaveLength(1);
  });

  it("marks the one missed SATA option in words as well as colour, with its rationale", async () => {
    const entries = [answered(MC, mcRight(MC), 1), answered(MR, mrMissingOne(MR), 2)];
    render(<AssignmentResults {...BASE} entries={entries} />);
    await renderersLoaded();
    expect(screen.getByRole("complementary", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByText(firstLine(MC), { exact: false })).toBeInTheDocument();

    goTo(2);
    await renderersLoaded();
    // Words, not colour alone: the missed option says so on screen, not only to a screen reader.
    const missed = screen.getAllByText("Missed");
    expect(missed.length).toBeGreaterThan(0);
    for (const word of missed) expect(word).not.toHaveClass("sr-only");
    expect(screen.getByRole("complementary", { name: "Score" })).toBeInTheDocument();
    expect(firstLine(MR)).not.toBe("");
    expect(screen.getByText(firstLine(MR), { exact: false })).toBeInTheDocument();
    // Read-only: nothing to submit on a results page.
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("says when the student did not attempt the assignment, and still shows each key", async () => {
    const entries: ResultEntry[] = [MC, MR].map((item, index) => ({
      rowId: rowId(index + 1),
      item,
      outcome: { kind: "not_attempted" },
    }));
    render(<AssignmentResults {...BASE} best={null} attemptsMade={0} entries={entries} />);
    await renderersLoaded();

    expect(screen.getByRole("region", { name: "Your score" })).toHaveTextContent(
      "You did not attempt this assignment.",
    );
    expect(screen.getByText("You did not attempt this.")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Rationale" })).toBeInTheDocument();
    goTo(2);
    await renderersLoaded();
    expect(screen.getByText("You did not attempt this.")).toBeInTheDocument();
    expect(screen.getByText(firstLine(MR), { exact: false })).toBeInTheDocument();
  });

  it("names the other ways an item can stand", async () => {
    const entries: ResultEntry[] = [
      { rowId: rowId(1), item: MC, outcome: { kind: "not_answered" } },
      { rowId: rowId(2), item: MR, outcome: { kind: "unreadable" } },
      { rowId: rowId(3), item: MC, outcome: { kind: "unmarked" } },
    ];
    render(<AssignmentResults {...BASE} best={null} attemptsMade={1} entries={entries} />);
    await renderersLoaded();
    expect(screen.getByRole("region", { name: "Your score" })).toHaveTextContent(
      "Not marked yet. Reload the page in a moment.",
    );
    expect(screen.getByText("You did not answer this.")).toBeInTheDocument();
    goTo(2);
    await renderersLoaded();
    expect(screen.getByText("Your answer could not be shown.")).toBeInTheDocument();
    goTo(3);
    await renderersLoaded();
    expect(screen.getByText("Not marked yet.")).toBeInTheDocument();
  });

  it("moves with Previous and Next", async () => {
    const entries: ResultEntry[] = [MC, MR].map((item, index) => ({
      rowId: rowId(index + 1),
      item,
      outcome: { kind: "not_attempted" },
    }));
    render(<AssignmentResults {...BASE} best={null} attemptsMade={0} entries={entries} />);
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await renderersLoaded();
    expect(screen.getByText(firstLine(MR), { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await renderersLoaded();
    expect(screen.getByText(firstLine(MC), { exact: false })).toBeInTheDocument();
  });

  it("lists every question with its verdict, and filters to the missed ones", async () => {
    const entries = [answered(MC, mcRight(MC), 1), answered(MR, mrMissingOne(MR), 2)];
    render(<AssignmentResults {...BASE} entries={entries} />);
    await renderersLoaded();
    const all = screen.getByRole("list", { name: "All questions" });
    expect(all.querySelectorAll("li")).toHaveLength(2);
    expect(all).toHaveTextContent("All correct");
    expect(all).toHaveTextContent("Partially correct");
    fireEvent.click(screen.getByRole("radio", { name: "Missed 1" }));
    const missed = screen.getByRole("list", { name: "Missed questions" });
    expect(missed.querySelectorAll("li")).toHaveLength(1);
    expect(missed).toHaveTextContent("Q2");
  });

  it("Review what I missed opens the first missed question, and Practise names how many", async () => {
    const entries = [answered(MC, mcRight(MC), 1), answered(MR, mrMissingOne(MR), 2)];
    const practise = async () => ({ error: null });
    render(<AssignmentResults {...BASE} entries={entries} practiseMissed={practise} />);
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Practise the 1 I missed" })).toBeInTheDocument();
    expect(screen.getByText("Not graded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review what I missed" }));
    await renderersLoaded();
    expect(screen.getByRole("region", { name: "Question 2" })).toHaveFocus();
    expect(screen.getByText(firstLine(MR), { exact: false })).toBeInTheDocument();
  });

  it("offers neither when nothing was missed, and shows the share by step", async () => {
    const entries = [answered(MC, mcRight(MC), 1)];
    render(
      <AssignmentResults
        {...BASE}
        entries={entries}
        practiseMissed={async () => ({ error: null })}
      />,
    );
    await renderersLoaded();
    expect(screen.queryByRole("button", { name: /I missed/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review what I missed" })).toBeNull();
    if (MC.cjmmStep !== undefined) {
      expect(screen.getByRole("region", { name: "By clinical judgment step" })).toHaveTextContent(
        "100%",
      );
    }
  });

  it("says so when there are no questions to show", () => {
    render(<AssignmentResults {...BASE} />);
    expect(screen.getByText("This assignment has no questions.")).toBeInTheDocument();
  });

  it("a case study: the patient record beside every step's key", async () => {
    const entries: ResultEntry[] = CASE.items.map((item, index) => ({
      rowId: rowId(index + 1),
      item,
      outcome: { kind: "not_attempted" },
    }));
    render(
      <AssignmentResults
        {...BASE}
        best={null}
        attemptsMade={0}
        entries={entries}
        record={CASE.ehr}
      />,
    );
    await renderersLoaded();
    expect(
      screen.getAllByText(CASE.ehr.patientHeader.setting, { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("complementary", { name: "Rationale" })).toBeInTheDocument();
    const last = CASE.items.at(-1) as Item;
    goTo(CASE.items.length);
    await renderersLoaded();
    expect(screen.getByText(firstLine(last), { exact: false })).toBeInTheDocument();
  });
});
