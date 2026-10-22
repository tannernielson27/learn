import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { FIXTURES, allFixtures } from "@/lib/ngn/fixtures";
import { sampleCaseStudy } from "@/lib/ngn/fixtures/case-study";
import { caseStudySchema } from "@/lib/ngn/schemas";
import { AiImportEntryPreview } from "./AiImportEntryPreview";

describe("AiImportEntryPreview (#346)", () => {
  it("shows a case study step by step, each step with its chart and its key", async () => {
    const caseStudy = caseStudySchema.parse(sampleCaseStudy);
    render(<AiImportEntryPreview kind="case_study" item={caseStudy} label="Case study" />);
    const steps = screen.getAllByRole("group");
    expect(steps).toHaveLength(6);
    expect(screen.getByText("Step 2 of 6: Analyze Cues")).toBeTruthy();
    await userEvent.click(screen.getByText("Step 1 of 6: Recognize Cues"));
    await renderersLoaded();
    expect(within(steps[0]!).getByRole("complementary", { name: "Rationale" })).toBeTruthy();
  });

  it("says a question that could not be built cannot be shown", () => {
    render(<AiImportEntryPreview kind="item" item={null} label="Question 1" />);
    expect(screen.getByText(/could not be built from the document/)).toBeTruthy();
  });

  it("says an item too incomplete to draw cannot be shown", () => {
    render(<AiImportEntryPreview kind="item" item={{ type: "bowtie" }} label="Question 1" />);
    expect(screen.getByText(/not complete, so it cannot be shown yet/)).toBeTruthy();
  });
});

describe("AiImportEntryPreview shows the key as correct (#467)", () => {
  it("marks a multiple choice key Correct, never Missed", async () => {
    render(
      <AiImportEntryPreview kind="item" item={FIXTURES.multiple_choice.canonical} label="Q1" />,
    );
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Q1" });
    expect(within(preview).getAllByText("Correct")).toHaveLength(1);
    expect(within(preview).queryByText("Missed")).toBeNull();
    expect(within(preview).queryByText("Incorrect")).toBeNull();
    // Answered with the key, but not scored: there is no score to show.
    expect(within(preview).queryByRole("complementary", { name: "Score" })).toBeNull();
  });

  it("marks every option a select-all key names Correct, and leaves the rest unmarked", async () => {
    render(
      <AiImportEntryPreview kind="item" item={FIXTURES.multiple_response.canonical} label="Q2" />,
    );
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Q2" });
    expect(within(preview).getAllByText("Correct")).toHaveLength(3);
    expect(within(preview).queryByText("Missed")).toBeNull();
    expect(within(preview).queryByText("Incorrect")).toBeNull();
  });

  it("marks a case study's steps the same way", async () => {
    const caseStudy = caseStudySchema.parse(sampleCaseStudy);
    render(<AiImportEntryPreview kind="case_study" item={caseStudy} label="Case study" />);
    for (const summary of screen.getAllByText(/^Step \d of 6/)) {
      await userEvent.click(summary);
    }
    await renderersLoaded();
    expect(screen.getAllByText("Correct").length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText("Missed")).toBeNull();
    expect(screen.queryByText("Incorrect")).toBeNull();
  });

  it.each(allFixtures.map((fixture) => [fixture.type, fixture] as const))(
    "marks nothing Missed or Incorrect in a %s key",
    async (type, fixture) => {
      render(<AiImportEntryPreview kind="item" item={fixture.canonical} label={type} />);
      await renderersLoaded();
      const preview = screen.getByRole("region", { name: type });
      expect(within(preview).queryByText("Missed")).toBeNull();
      expect(within(preview).queryByText("Incorrect")).toBeNull();
    },
  );
});
