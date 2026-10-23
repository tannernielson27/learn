import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, itemSchema, type Item } from "@/lib/ngn/schemas";
import { scoreSubmission, toKeylessItem } from "@/lib/ngn/submit";
import { PracticeAnswerError } from "@/lib/practice/answerClient";
import type { PracticeView } from "@/lib/practice/entries";
import { PRACTICE_REFUSALS } from "@/lib/practice/refusals";
import { PracticePlayer, type PracticeAnswerHandler } from "./PracticePlayer";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const SECOND = itemSchema.parse(FIXTURES.multiple_choice.edge) as Item;
const CASE = caseStudySchema.parse(sampleCaseStudy);
const RUN = "00000000-0000-4000-8000-0000000241a1";
const ROW_1 = "00000000-0000-4000-8000-0000000241f1";
const ROW_2 = "00000000-0000-4000-8000-0000000241f2";
const CASE_ID = "00000000-0000-4000-8000-0000000241c1";
const stepRow = (i: number) => `00000000-0000-4000-8000-0000002410${String(i).padStart(2, "0")}`;

const MC_RATIONALE = MC.rationale.general?.value ?? "";
const CORRECT = { type: "multiple_choice" as const, optionId: "opt_a" };

function view(overrides: Partial<PracticeView> = {}): PracticeView {
  return {
    runId: RUN,
    bankName: "Cardiac week",
    total: 2,
    answered: 0,
    entries: [
      { kind: "item", itemId: ROW_1, item: toKeylessItem(MC), answered: null },
      { kind: "item", itemId: ROW_2, item: toKeylessItem(SECOND), answered: null },
    ],
    ...overrides,
  };
}

function setup(
  practice = view(),
  answer: PracticeAnswerHandler = async () => scoreSubmission(MC, CORRECT),
) {
  const handler = vi.fn(answer);
  const startOver = vi.fn(async () => ({ error: null }));
  render(<PracticePlayer view={practice} answer={handler} startOver={startOver} />);
  return { answer: handler, startOver, user: userEvent.setup() };
}

describe("PracticePlayer (#241)", () => {
  it("sends one answer for this run and item, then shows that item's key and rationale", async () => {
    const ui = setup();
    await renderersLoaded();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("0 of 2 done");
    expect(screen.queryByText(MC_RATIONALE)).toBeNull();

    await ui.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await ui.user.click(screen.getByRole("button", { name: "Submit" }));

    expect(ui.answer).toHaveBeenCalledWith(RUN, ROW_1, CORRECT);
    expect(await screen.findByText(MC_RATIONALE)).toBeInTheDocument();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("1 of 2 done");
    expect(screen.getByRole("button", { name: "Question 1, answered" })).toBeInTheDocument();
  });

  it("reopens an item this run has answered in feedback, with no Submit", async () => {
    setup(
      view({
        answered: 1,
        entries: [
          {
            kind: "item",
            itemId: ROW_1,
            item: toKeylessItem(MC),
            answered: { kind: "scored", response: CORRECT, reveal: scoreSubmission(MC, CORRECT) },
          },
        ],
        total: 1,
      }),
    );
    // Every question answered: the run opens on its results, and a question opens from there.
    expect(screen.getByRole("region", { name: "Practice finished" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Q1,/ }));
    await renderersLoaded();
    expect(screen.getByText(MC_RATIONALE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("1 of 1 done");
    await userEvent.click(screen.getByRole("button", { name: "See results" }));
    expect(screen.getByRole("region", { name: "Practice finished" })).toBeInTheDocument();
  });

  it("shows the last answer's own marks and rationale before the results, then See results", async () => {
    const ui = setup(view({ total: 1, entries: [view().entries[0]!] }));
    await renderersLoaded();
    await ui.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await ui.user.click(screen.getByRole("button", { name: "Submit" }));

    // Finished here, not on arrival: the answer's feedback first, the results on request.
    expect(await screen.findByText(MC_RATIONALE)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Practice finished" })).toBeNull();
    await ui.user.click(screen.getByRole("button", { name: "See results" }));
    expect(screen.getByRole("region", { name: "Practice finished" })).toBeInTheDocument();
  });

  it("ends on the results: the total, what was missed, Practise the N I missed, Start over", async () => {
    const wrong = { type: "multiple_choice" as const, optionId: "opt_b" };
    const practiseMissed = vi.fn(async () => ({ error: null }));
    const startOver = vi.fn(async () => ({ error: null }));
    render(
      <PracticePlayer
        view={view({
          answered: 2,
          entries: [
            {
              kind: "item",
              itemId: ROW_1,
              item: toKeylessItem(MC),
              answered: { kind: "scored", response: CORRECT, reveal: scoreSubmission(MC, CORRECT) },
            },
            {
              kind: "item",
              itemId: ROW_2,
              item: toKeylessItem(MC),
              answered: { kind: "scored", response: wrong, reveal: scoreSubmission(MC, wrong) },
            },
          ],
        })}
        startOver={startOver}
        practiseMissed={practiseMissed}
      />,
    );
    const results = screen.getByRole("region", { name: "Practice finished" });
    expect(screen.getByTestId("results-total")).toHaveTextContent("1/2");
    expect(results).toHaveTextContent("points · 50%");
    // Missed first: that is what is left to do.
    expect(
      screen.getByRole("list", { name: "Missed questions" }).querySelectorAll("li"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Practise the 1 I missed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start over with all 2" })).toBeInTheDocument();
  });

  it("a run of missed questions ends with the way back instead of Start over", () => {
    render(
      <PracticePlayer
        view={view({
          kind: "missed",
          total: 1,
          answered: 1,
          entries: [
            {
              kind: "item",
              itemId: ROW_1,
              item: toKeylessItem(MC),
              answered: { kind: "scored", response: CORRECT, reveal: scoreSubmission(MC, CORRECT) },
            },
          ],
        })}
        back={{ href: "/learn", label: "Back to your classes" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Back to your classes" })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(screen.queryByRole("button", { name: /Start over/ })).toBeNull();
    expect(screen.getByText("all correct")).toBeInTheDocument();
  });

  it("moves with Next and Previous, keeping a half-made answer", async () => {
    const ui = setup();
    await renderersLoaded();
    await ui.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await ui.user.click(screen.getByRole("button", { name: "Next" }));
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Question 2, not answered" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await ui.user.click(screen.getByRole("button", { name: "Previous" }));
    await renderersLoaded();
    expect(screen.getByRole("radio", { name: /Auscultate the lungs/ })).toBeChecked();
  });

  it("says why a refused answer was refused, and reads the page again when it is out of date", async () => {
    const ui = setup(view(), async () => {
      throw new PracticeAnswerError("not_found");
    });
    await renderersLoaded();
    await ui.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await ui.user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(PRACTICE_REFUSALS.not_found)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText(MC_RATIONALE)).toBeNull();
  });

  it("closes an item answered elsewhere once the refreshed view says so, with one alert only", async () => {
    const startOver = vi.fn(async () => ({ error: null }));
    const answerFn = vi.fn(async () => {
      throw new PracticeAnswerError("answered");
    });
    const { rerender } = render(
      <PracticePlayer view={view()} answer={answerFn} startOver={startOver} />,
    );
    const user = userEvent.setup();
    await renderersLoaded();
    await user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(PRACTICE_REFUSALS.answered)).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(refresh).toHaveBeenCalled();

    // What router.refresh() hands back: the same run, with the item answered on the server.
    rerender(
      <PracticePlayer
        view={view({
          answered: 1,
          entries: [
            {
              kind: "item",
              itemId: ROW_1,
              item: toKeylessItem(MC),
              answered: { kind: "scored", response: CORRECT, reveal: scoreSubmission(MC, CORRECT) },
            },
            { kind: "item", itemId: ROW_2, item: toKeylessItem(SECOND), answered: null },
          ],
        })}
        answer={answerFn}
        startOver={startOver}
      />,
    );
    await renderersLoaded();
    expect(await screen.findByText(MC_RATIONALE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("1 of 2 done");
    expect(screen.getByRole("button", { name: "Question 1, answered" })).toBeInTheDocument();
  });

  it("plays a case study step by step, each answer naming that step's own row", async () => {
    // #335: the run has reached step 1 only, so step 1 is all it was sent.
    const steps = [
      { itemId: stepRow(1), item: toKeylessItem(CASE.items[0] as Item), answered: null },
    ];
    const first = CASE.items[0] as Item;
    refresh.mockClear();
    const ui = setup(
      view({
        total: 6,
        entries: [
          {
            kind: "case_study",
            id: CASE_ID,
            title: CASE.title,
            records: [CASE.ehr],
            stepCount: 6,
            steps,
          },
        ],
      }),
      async () => scoreSubmission(first, { type: "highlight_text", spanIds: ["sp_sob"] } as never),
    );
    await renderersLoaded();
    expect(screen.getByRole("heading", { level: 2, name: CASE.title })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument();
    await ui.user.click(screen.getByRole("button", { name: /sudden shortness of breath/ }));
    await ui.user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(ui.answer).toHaveBeenCalledWith(
        RUN,
        stepRow(1),
        expect.objectContaining({ type: "highlight_text" }),
      ),
    );
    // Step 2 is not on the page until it is read again, which the answer asks for.
    expect(await screen.findByRole("button", { name: "Next question" })).toBeDisabled();
    expect(refresh).toHaveBeenCalled();
    // Said, with a way to ask again, in case the read that brings it failed.
    expect(screen.getByText("Loading the next question.")).toHaveAttribute("role", "status");
    refresh.mockClear();
    await ui.user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reopens a case study's answered step with its marks", async () => {
    const first = CASE.items[0] as Item;
    const response = { type: "highlight_text" as const, spanIds: ["sp_sob"] };
    // Step 1 answered, so the run has reached step 2 and was sent both.
    const steps = CASE.items.slice(0, 2).map((item, i) => ({
      itemId: stepRow(i + 1),
      item: toKeylessItem(item),
      answered:
        i === 0
          ? { kind: "scored" as const, response, reveal: scoreSubmission(first, response) }
          : null,
    }));
    setup(
      view({
        total: 6,
        answered: 1,
        entries: [
          {
            kind: "case_study",
            id: CASE_ID,
            title: CASE.title,
            records: [CASE.ehr, CASE.ehr],
            stepCount: 6,
            steps,
          },
        ],
      }),
    );
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Next question" })).toBeEnabled();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("1 of 6 done");
  });

  it("asks before starting over, with focus on Cancel", async () => {
    const ui = setup();
    await ui.user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByText(/Your first answers still count/)).toBeInTheDocument();
    await ui.user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Start over" })).toHaveFocus();

    await ui.user.click(screen.getByRole("button", { name: "Start over" }));
    await ui.user.click(screen.getByRole("button", { name: "Start over now" }));
    await waitFor(() => expect(ui.startOver).toHaveBeenCalledTimes(1));
  });

  it("says when a quiz has nothing to practise", () => {
    setup(view({ entries: [], total: 0 }));
    expect(screen.getByText("This quiz has no questions yet.")).toBeInTheDocument();
  });
});
