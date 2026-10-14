import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { recordsThrough } from "@/lib/ngn/chartReveal";
import { stagedCaseStudy, stagedEhr } from "@/lib/ngn/fixtures/chart-reveal";
import { caseStudySchema, ehrRecordSchema, type Item } from "@/lib/ngn/schemas";
import { scoreInProcess, scoreSubmission, toKeylessItem } from "@/lib/ngn/submit";
import { CaseStudyPlayer } from "./CaseStudyPlayer";

/** The player handed a student's per-step charts (#335), and an author's whole record. */

const study = caseStudySchema.parse(stagedCaseStudy);
const record = ehrRecordSchema.parse(stagedEhr);
const first = study.items[0] as Item;
const response = { type: "highlight_text" as const, spanIds: ["sp_sob"] };
const pane = () => within(screen.getByRole("complementary", { name: "Patient record" }));
const labs = () => pane().queryByRole("tab", { name: /^Lab Results/ });

describe("CaseStudyPlayer with a chart per step (#335)", () => {
  it("shows the chart of the step on screen, going forward and coming back", async () => {
    render(
      <CaseStudyPlayer
        caseStudy={{
          ...study,
          ehr: undefined,
          items: study.items.slice(0, 2).map((i) => toKeylessItem(i)),
        }}
        records={recordsThrough(record, 2)}
        stepCount={6}
        initialSteps={[{ response, reveal: scoreSubmission(first, response) }]}
        submitFor={() => async () => {
          throw new Error("not in this test");
        }}
      />,
    );
    await renderersLoaded();
    expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument();
    expect(labs()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText(/Step 2 of 6/)).toBeInTheDocument();
    expect(labs()).toHaveAccessibleName("Lab Results Locked");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(labs()).toBeNull();
    // Only the reached steps can be jumped to.
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.queryByText(/Step 3:/)).toBeNull();
    expect(screen.queryByTestId("record-note")).toBeNull();
  });

  it("marks an author's whole record as the full record when it is staged", async () => {
    render(<CaseStudyPlayer caseStudy={study} submitFor={scoreInProcess} />);
    await renderersLoaded();
    expect(screen.getAllByTestId("record-note")[0]).toHaveTextContent(
      "Full patient record. A student at step 1 sees only what that step has reached.",
    );
    // The whole record: the labs are open to the author at step 1.
    expect(labs()).toHaveAccessibleName("Lab Results");
  });
});
