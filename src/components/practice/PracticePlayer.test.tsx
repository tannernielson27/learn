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
    expect(screen.getByRole("button", { name: "Item 1, answered" })).toBeInTheDocument();
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
    await renderersLoaded();
    expect(screen.getByText(MC_RATIONALE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("1 of 1 done");
  });

  it("moves with Next and Previous, keeping a half-made answer", async () => {
    const ui = setup();
    await renderersLoaded();
    await ui.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await ui.user.click(screen.getByRole("button", { name: "Next item" }));
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Item 2, not answered" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await ui.user.click(screen.getByRole("button", { name: "Previous item" }));
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
    expect(screen.getByRole("button", { name: "Item 1, answered" })).toBeInTheDocument();
  });

  it("plays a case study step by step, each answer naming that step's own row", async () => {
    const steps = CASE.items.map((item, i) => ({
      itemId: stepRow(i + 1),
      item: toKeylessItem(item),
      answered: null,
    }));
    const first = CASE.items[0] as Item;
    const ui = setup(
      view({
        total: steps.length,
        entries: [{ kind: "case_study", id: CASE_ID, title: CASE.title, ehr: CASE.ehr, steps }],
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
    expect(await screen.findByRole("button", { name: "Next step" })).toBeInTheDocument();
  });

  it("reopens a case study's answered step with its marks", async () => {
    const first = CASE.items[0] as Item;
    const response = { type: "highlight_text" as const, spanIds: ["sp_sob"] };
    const steps = CASE.items.map((item, i) => ({
      itemId: stepRow(i + 1),
      item: toKeylessItem(item),
      answered:
        i === 0
          ? { kind: "scored" as const, response, reveal: scoreSubmission(first, response) }
          : null,
    }));
    setup(
      view({
        total: steps.length,
        answered: 1,
        entries: [{ kind: "case_study", id: CASE_ID, title: CASE.title, ehr: CASE.ehr, steps }],
      }),
    );
    await renderersLoaded();
    expect(screen.getByRole("button", { name: "Next step" })).toBeInTheDocument();
    expect(screen.getByTestId("practice-count")).toHaveTextContent("1 of 6 done");
  });

  it("asks before starting over, with focus on Cancel", async () => {
    const ui = setup();
    await ui.user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByText(/Your answers so far are set aside/)).toBeInTheDocument();
    await ui.user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Start over" })).toHaveFocus();

    await ui.user.click(screen.getByRole("button", { name: "Start over" }));
    await ui.user.click(screen.getByRole("button", { name: "Start over now" }));
    await waitFor(() => expect(ui.startOver).toHaveBeenCalledTimes(1));
  });

  it("says when a bank has nothing to practise", () => {
    setup(view({ entries: [], total: 0 }));
    expect(screen.getByText("This bank has no items to practise yet.")).toBeInTheDocument();
  });
});
