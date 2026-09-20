import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy, sampleEhr } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
import {
  scoreInProcess,
  scoreSubmission,
  toKeylessCaseStudy,
  type KeylessItem,
  type SubmitHandlerFor,
} from "@/lib/ngn/submit";
import { CaseStudyPlayer } from "./CaseStudyPlayer";

/**
 * Six copies of one item, so the flow tests read as a flow. The sample case study, with a
 * different format at every step, is used where the point is that any format fits.
 */
const sixSteps = caseStudySchema.parse({
  id: "cs_flow",
  title: "Six steps",
  ehr: sampleEhr,
  items: ([1, 2, 3, 4, 5, 6] as const).map((step) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `step_${step}`,
    cjmmStep: step,
  })),
});

const sample = caseStudySchema.parse(sampleCaseStudy);

const stepLine = () => screen.getByText(/^Step \d of 6:/);
const next = () => screen.queryByRole("button", { name: /Next step|See results/ });
const submit = () => screen.getByRole("button", { name: "Submit" });
const correct = () => screen.getByRole("radio", { name: /Auscultate the lungs/ });
const wrong = () => screen.getByRole("radio", { name: /Document the weight/ });

const finishStep = async () => {
  await userEvent.click(correct());
  await userEvent.click(submit());
  await userEvent.click(next()!);
};

describe("CaseStudyPlayer", () => {
  it("opens on the first step with the patient's record at hand", () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
    expect(screen.getByRole("complementary", { name: "Patient record" })).toBeInTheDocument();
  });

  it("leaves focus alone when it opens, then takes it to each new step", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    expect(document.activeElement).toBe(document.body);
    await finishStep();
    expect(stepLine()).toHaveTextContent("Step 2 of 6: Analyze Cues");
    // The button that moved on is gone; the step's own name now says where the student is, so the
    // line above it is not also a live region reading the same words out twice.
    expect(document.activeElement).toBe(
      screen.getByRole("group", { name: "Step 2 of 6: Analyze Cues" }),
    );
    expect(stepLine()).not.toHaveAttribute("aria-live");
  });

  it("will not move on until the step has been submitted", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    expect(next()).toBeNull();
    await userEvent.click(correct());
    expect(next()).toBeNull();
    await userEvent.click(submit());
    expect(next()).toBeEnabled();
  });

  it("shows a submitted step's answer and score again when the student goes back", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    await userEvent.click(wrong());
    await userEvent.click(submit());
    await userEvent.click(next()!);
    expect(stepLine()).toHaveTextContent("Step 2 of 6");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(stepLine()).toHaveTextContent("Step 1 of 6");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: /Step 1 of 6/ }));
    expect(wrong()).toBeChecked();
    const score = screen.getByRole("complementary", { name: "Score" });
    expect(within(score).getByText("0")).toBeInTheDocument();
  });

  it("keeps a half-finished answer when the student steps away and comes back", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    await finishStep();
    // Chosen but deliberately not submitted.
    await userEvent.click(wrong());
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(next()!);
    expect(stepLine()).toHaveTextContent("Step 2 of 6");
    expect(wrong()).toBeChecked();
    expect(submit()).toBeEnabled();
  });

  it("ends on a summary of every step and the total", async () => {
    const onFinished = vi.fn();
    render(
      <CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} onFinished={onFinished} />,
    );
    for (let step = 1; step <= 5; step++) await finishStep();

    await userEvent.click(correct());
    await userEvent.click(submit());
    expect(next()).toHaveTextContent("See results");
    await userEvent.click(next()!);

    const results = screen.getByRole("region", { name: "Case study results" });
    expect(within(results).getByText(/6 of 6 points/)).toBeInTheDocument();
    for (const label of [
      "Recognize Cues",
      "Analyze Cues",
      "Prioritize Hypotheses",
      "Generate Solutions",
      "Take Action",
      "Evaluate Outcomes",
    ]) {
      expect(within(results).getByText(new RegExp(label))).toBeInTheDocument();
    }
    expect(onFinished).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ points: 1, maxPoints: 1 })]),
    );
  });

  it("checks every step through the handler it is given, never in the page for a session", async () => {
    const handler = vi.fn(scoreInProcess(sixSteps.items[0]));
    const submitFor = vi.fn(() => handler);
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={submitFor} />);
    await userEvent.click(correct());
    await userEvent.click(submit());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(submitFor).toHaveBeenCalledWith(sixSteps.items[0]);
  });

  it("renders whatever format a step happens to use", () => {
    render(<CaseStudyPlayer caseStudy={sample} submitFor={scoreInProcess} />);
    expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
    // The sample opens on a highlight item, which ItemPlayer renders unchanged.
    expect(screen.getByRole("button", { name: /sudden shortness of breath/ })).toBeInTheDocument();
  });

  it("reports the finish once, however often the student walks back into it", async () => {
    const onFinished = vi.fn();
    render(
      <CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} onFinished={onFinished} />,
    );
    for (let step = 1; step <= 6; step++) await finishStep();
    expect(onFinished).toHaveBeenCalledTimes(1);

    // Re-reading the last step and coming forward again is not a second attempt.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(next()!);
    expect(screen.getByRole("region", { name: "Case study results" })).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("starts over when it is handed a different case study", async () => {
    const { rerender } = render(
      <CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />,
    );
    await finishStep();
    expect(stepLine()).toHaveTextContent("Step 2 of 6");

    rerender(<CaseStudyPlayer caseStudy={sample} submitFor={scoreInProcess} />);
    expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
    expect(next()).toBeNull();
  });

  describe("played from a keyless case study, as a student is sent one (#46)", () => {
    const keyless = toKeylessCaseStudy(sixSteps);

    /** Stands in for the server: it holds the case study with its keys, the browser does not. */
    const serverScores: SubmitHandlerFor<KeylessItem> = (item) => async (response) => {
      const full = sixSteps.items.find((step) => step.id === item.id);
      if (!full) throw new Error(`no such step: ${item.id}`);
      return scoreSubmission(full, response);
    };

    it("plays six steps whose items carry no answer key", () => {
      expect(keyless.items).toHaveLength(6);
      for (const item of keyless.items) expect(item).not.toHaveProperty("answerKey");
      render(<CaseStudyPlayer caseStudy={keyless} submitFor={serverScores} />);
      expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
      expect(correct()).toBeInTheDocument();
      // Nothing is marked before the step has been answered.
      expect(screen.queryByText("Missed")).toBeNull();
    });

    it("hands the renderer the key that came back with that step's score", async () => {
      render(<CaseStudyPlayer caseStudy={keyless} submitFor={serverScores} />);
      await userEvent.click(wrong());
      await userEvent.click(submit());
      // Marks a keyless item could not produce on its own: they came back with the score.
      expect(screen.getByText("Incorrect")).toBeInTheDocument();
      expect(screen.getByText("Missed")).toBeInTheDocument();
    });

    it("asks the handler only for the step the student is on", async () => {
      const submitFor = vi.fn(serverScores);
      render(<CaseStudyPlayer caseStudy={keyless} submitFor={submitFor} />);
      await userEvent.click(correct());
      await userEvent.click(submit());
      // Every item the handler is built for is keyless: no key is in the page for any step.
      for (const [item] of submitFor.mock.calls) expect(item).not.toHaveProperty("answerKey");
      expect(new Set(submitFor.mock.calls.map(([item]) => item.id))).toEqual(new Set(["step_1"]));
    });

    it("still shows a step's marks when the student walks back into it", async () => {
      render(<CaseStudyPlayer caseStudy={keyless} submitFor={serverScores} />);
      await userEvent.click(wrong());
      await userEvent.click(submit());
      await userEvent.click(next()!);
      expect(stepLine()).toHaveTextContent("Step 2 of 6");

      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(stepLine()).toHaveTextContent("Step 1 of 6");
      expect(wrong()).toBeChecked();
      // The reveal was kept with the step, so the marks survive the remount.
      expect(screen.getByText("Incorrect")).toBeInTheDocument();
      expect(screen.getByText("Missed")).toBeInTheDocument();
      const score = screen.getByRole("complementary", { name: "Score" });
      expect(within(score).getByText("0")).toBeInTheDocument();
    });

    it("totals the six scores the server sent back", async () => {
      const onFinished = vi.fn();
      render(
        <CaseStudyPlayer caseStudy={keyless} submitFor={serverScores} onFinished={onFinished} />,
      );
      for (let step = 1; step <= 6; step++) await finishStep();
      const results = screen.getByRole("region", { name: "Case study results" });
      expect(within(results).getByText(/6 of 6 points/)).toBeInTheDocument();
      expect(onFinished).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ points: 1, maxPoints: 1 })]),
      );
    });
  });

  describe("flag and return", () => {
    const review = () => screen.getByRole("region", { name: "Review this case study" });
    const openReview = () => userEvent.click(screen.getByRole("button", { name: "Review" }));

    it("says what every step is, answered or not, and which are flagged", async () => {
      render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
      await userEvent.click(screen.getByRole("button", { name: "Flag step 1" }));
      await finishStep();
      await openReview();

      expect(within(review()).getByRole("heading", { name: "Review" })).toBeInTheDocument();
      const rows = within(review()).getAllByRole("button");
      expect(rows[0]).toHaveTextContent("Step 1: Recognize CuesAnswered, flagged for review");
      expect(rows[1]).toHaveTextContent("Step 2: Analyze CuesNot answered");
      expect(rows[1]).toHaveAttribute("aria-current", "true");
    });

    it("keeps a flag on the step it was put on", async () => {
      render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
      await userEvent.click(screen.getByRole("button", { name: "Flag step 1" }));
      await finishStep();
      expect(screen.getByRole("button", { name: "Flag step 2" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByRole("button", { name: "Flag step 1" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("goes to the step the student picks, and puts focus there", async () => {
      render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
      await finishStep();
      await finishStep();
      expect(stepLine()).toHaveTextContent("Step 3 of 6");

      await openReview();
      await userEvent.click(within(review()).getByRole("button", { name: /Step 1/ }));
      expect(stepLine()).toHaveTextContent("Step 1 of 6");
      // Focus follows, or a keyboard user is left where the list used to be.
      expect(document.activeElement).toBe(screen.getByRole("group", { name: /Step 1 of 6/ }));
    });

    it("closes the list when a step is chosen, so the student is back in the work", async () => {
      render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
      await finishStep();
      await openReview();
      await userEvent.click(within(review()).getByRole("button", { name: /Step 1/ }));
      expect(screen.queryByRole("region", { name: "Review this case study" })).toBeNull();
      expect(correct()).toBeInTheDocument();
    });

    it("closes the list and returns focus to the step when the student picks the open one", async () => {
      render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
      await finishStep();
      await openReview();
      await userEvent.click(within(review()).getByRole("button", { name: /Step 2/ }));
      expect(stepLine()).toHaveTextContent("Step 2 of 6");
      // The row that was pressed has gone with the list, so focus cannot be left on it.
      expect(document.activeElement).toBe(screen.getByRole("group", { name: /Step 2 of 6/ }));
    });

    it("offers a way back to the results once they have been reached", async () => {
      render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
      for (let step = 1; step <= 6; step++) await finishStep();
      expect(screen.getByRole("region", { name: "Case study results" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(stepLine()).toHaveTextContent("Step 6 of 6");
      await userEvent.click(screen.getByRole("button", { name: "Results" }));
      expect(screen.getByRole("region", { name: "Case study results" })).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole("group", { name: "Results" }));
    });
  });
});
