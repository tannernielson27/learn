import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
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
