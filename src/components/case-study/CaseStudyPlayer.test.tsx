import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleCaseStudy, sampleEhr } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
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
    render(<CaseStudyPlayer caseStudy={sixSteps} />);
    expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
    expect(screen.getByRole("complementary", { name: "Patient record" })).toBeInTheDocument();
  });

  it("names the step it is on and announces the change", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} />);
    // A polite region, so the reader hears the new step without losing their place.
    expect(stepLine()).toHaveAttribute("aria-live", "polite");
    await finishStep();
    expect(stepLine()).toHaveTextContent("Step 2 of 6: Analyze Cues");
  });

  it("will not move on until the step has been submitted", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} />);
    expect(next()).toBeNull();
    await userEvent.click(correct());
    expect(next()).toBeNull();
    await userEvent.click(submit());
    expect(next()).toBeEnabled();
  });

  it("shows a submitted step's answer and score again when the student goes back", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} />);
    await userEvent.click(wrong());
    await userEvent.click(submit());
    await userEvent.click(next()!);
    expect(stepLine()).toHaveTextContent("Step 2 of 6");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(stepLine()).toHaveTextContent("Step 1 of 6");
    expect(wrong()).toBeChecked();
    const score = screen.getByRole("complementary", { name: "Score" });
    expect(within(score).getByText("0")).toBeInTheDocument();
  });

  it("keeps a half-finished answer when the student steps away and comes back", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} />);
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
    render(<CaseStudyPlayer caseStudy={sixSteps} onFinished={onFinished} />);
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

  it("scores every step through the injected scorer, never in the page for a session", async () => {
    const score = vi.fn(() => ({
      points: 1,
      maxPoints: 1,
      model: "zero_one" as const,
      breakdown: [],
    }));
    render(<CaseStudyPlayer caseStudy={sixSteps} score={score} />);
    await userEvent.click(correct());
    await userEvent.click(submit());
    expect(score).toHaveBeenCalledTimes(1);
  });

  it("renders whatever format a step happens to use", () => {
    render(<CaseStudyPlayer caseStudy={sample} />);
    expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
    // The sample opens on a highlight item, which ItemPlayer renders unchanged.
    expect(screen.getByRole("button", { name: /sudden shortness of breath/ })).toBeInTheDocument();
  });

  it("reports the finish once, however often the student walks back into it", async () => {
    const onFinished = vi.fn();
    render(<CaseStudyPlayer caseStudy={sixSteps} onFinished={onFinished} />);
    for (let step = 1; step <= 6; step++) await finishStep();
    expect(onFinished).toHaveBeenCalledTimes(1);

    // Re-reading the last step and coming forward again is not a second attempt.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(next()!);
    expect(screen.getByRole("region", { name: "Case study results" })).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("starts over when it is handed a different case study", async () => {
    const { rerender } = render(<CaseStudyPlayer caseStudy={sixSteps} />);
    await finishStep();
    expect(stepLine()).toHaveTextContent("Step 2 of 6");

    rerender(<CaseStudyPlayer caseStudy={sample} />);
    expect(stepLine()).toHaveTextContent("Step 1 of 6: Recognize Cues");
    expect(next()).toBeNull();
  });
});
