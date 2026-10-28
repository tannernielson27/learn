import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES, sampleEhr } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { CaseStudyPlayer } from "./CaseStudyPlayer";

/**
 * How much of the patient record an answer redraws (perf audit #33). Every chart tab's blocks are
 * counted as they render, and every ResizeObserver the tab strip starts; choosing an answer
 * changes nothing in the record, so it should start neither.
 */
const counts = vi.hoisted(() => ({ blocks: 0, observed: 0 }));

vi.mock("@/components/ehr/blocks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ehr/blocks")>();
  return {
    ...actual,
    EhrBlocks: (props: ComponentProps<typeof actual.EhrBlocks>) => {
      counts.blocks += 1;
      return actual.EhrBlocks(props);
    },
  };
});

const sixSteps = caseStudySchema.parse({
  id: "cs_renders",
  title: "Six steps",
  ehr: sampleEhr,
  items: ([1, 2, 3, 4, 5, 6] as const).map((step) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `step_${step}`,
    cjmmStep: step,
  })),
});

const reset = () => {
  counts.blocks = 0;
  counts.observed = 0;
};

describe("CaseStudyPlayer renders", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          counts.observed += 1;
        }
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    reset();
  });

  it("leaves the patient record alone while the student changes their answer", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    await renderersLoaded();
    reset();

    for (const name of [/Document the weight/, /Auscultate the lungs/, /Document the weight/]) {
      await userEvent.click(screen.getByRole("radio", { name }));
    }

    expect(screen.getByRole("radio", { name: /Document the weight/ })).toBeChecked();
    expect(counts).toEqual({ blocks: 0, observed: 0 });
  });

  it("still redraws the record when the reader opens another section of it", async () => {
    render(<CaseStudyPlayer caseStudy={sixSteps} submitFor={scoreInProcess} />);
    await renderersLoaded();
    const record = screen.getByRole("complementary", { name: "Patient record" });
    const [, second] = Array.from(record.querySelectorAll<HTMLElement>('[role="tab"]'));
    reset();

    await userEvent.click(second!);

    expect(second).toHaveAttribute("aria-selected", "true");
    expect(counts.blocks).toBeGreaterThan(0);
  });
});
