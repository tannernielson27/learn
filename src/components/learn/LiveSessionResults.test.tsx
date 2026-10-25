import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import type { LiveResultEntry } from "@/lib/learn/liveResultPage";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreSubmission } from "@/lib/ngn/submit";
import { LiveSessionResults } from "./LiveSessionResults";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);

function answered(item: Item, response: AnyResponse, position: number): LiveResultEntry {
  return {
    rowId: String(position),
    position,
    item,
    record: null,
    outcome: { kind: "answered", response, score: scoreSubmission(item, response).score },
  };
}

const blank = (item: Item, position: number): LiveResultEntry => ({
  rowId: String(position),
  position,
  item,
  record: null,
  outcome: { kind: "not_answered" },
});

function mcRight(item: Item): AnyResponse {
  if (item.type !== "multiple_choice") throw new Error("not MC");
  return { type: "multiple_choice", optionId: item.answerKey.correctOptionId };
}

function mcWrong(item: Item): AnyResponse {
  if (item.type !== "multiple_choice") throw new Error("not MC");
  const wrong = item.content.options.find((o) => o.id !== item.answerKey.correctOptionId);
  return { type: "multiple_choice", optionId: wrong?.id };
}

const firstLine = (item: Item) => item.rationale.general?.value.split("\n")[0] ?? "";

const goTo = (position: number) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Q${position},`) }));

describe("LiveSessionResults", () => {
  it("leads with the student's own total, in words", async () => {
    render(<LiveSessionResults entries={[answered(MC, mcRight(MC), 1), blank(MR, 2)]} />);
    await renderersLoaded();
    const total = screen.getByRole("region", { name: "Your score" });
    const maxMr = MR.scoring?.maxPoints ?? 0;
    expect(total).toHaveTextContent(`1/${1 + maxMr}`);
    expect(total).toHaveTextContent("Answered 1 of 2 questions.");
  });

  it("shows their answer marked against the key, with the rationale", async () => {
    render(<LiveSessionResults entries={[answered(MC, mcWrong(MC), 1)]} />);
    await renderersLoaded();
    expect(screen.getByRole("complementary", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByText(firstLine(MC), { exact: false })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "All questions" });
    expect(list).toHaveTextContent("Not correct");
    // Read-only: nothing to submit on a results page.
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("says a question left blank, and shows its key", async () => {
    render(<LiveSessionResults entries={[blank(MC, 1)]} />);
    await renderersLoaded();
    expect(screen.getByText("You did not answer this.")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Rationale" })).toBeInTheDocument();
  });

  it("numbers each question by its place in the session", async () => {
    render(
      <LiveSessionResults entries={[answered(MC, mcRight(MC), 1), answered(MC, mcWrong(MC), 3)]} />,
    );
    await renderersLoaded();
    goTo(3);
    await renderersLoaded();
    expect(screen.getByRole("region", { name: "Question 3" })).toHaveFocus();
  });

  it("Review what I missed opens the first missed question", async () => {
    render(
      <LiveSessionResults entries={[answered(MC, mcRight(MC), 1), answered(MC, mcWrong(MC), 2)]} />,
    );
    await renderersLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Review what I missed" }));
    await renderersLoaded();
    expect(screen.getByRole("region", { name: "Question 2" })).toHaveFocus();
  });

  it("offers no review of misses when nothing was missed, and offers no practice", async () => {
    render(<LiveSessionResults entries={[answered(MC, mcRight(MC), 1)]} />);
    await renderersLoaded();
    expect(screen.queryByRole("button", { name: /I missed/ })).toBeNull();
  });

  it("moves with Previous and Next", async () => {
    render(<LiveSessionResults entries={[blank(MC, 1), blank(MR, 2)]} />);
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await renderersLoaded();
    expect(screen.getByText(firstLine(MR), { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("says so when there are no questions to show", () => {
    render(<LiveSessionResults entries={[]} />);
    expect(screen.getByText("This live session has no questions to show.")).toBeInTheDocument();
  });

  it("a case study step: its patient record beside it", async () => {
    const [step] = CASE.items;
    if (!step) throw new Error("no step");
    render(
      <LiveSessionResults entries={[{ ...blank(step, 1), record: recordAtStep(CASE.ehr, 1) }]} />,
    );
    await renderersLoaded();
    expect(
      screen.getAllByText(CASE.ehr.patientHeader.setting, { exact: false }).length,
    ).toBeGreaterThan(0);
  });
});
