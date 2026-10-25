import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_TIMER } from "@/lib/live/timer";
import { StageQuestion } from "./StageQuestion";
import type { StageQuestion as StageQuestionData } from "./stageItem";

/**
 * What keeps a long question on a 1280x720 projector (jsdom cannot lay it out, so these pin the
 * rules the layout rests on): past four options the stem is clamped and steps down a size, and
 * the rows share the height that is left, so a short wall clips inside a row, never a whole row.
 */

const LONG_STEM =
  "A client who is two days after a total hip arthroplasty reports sudden shortness of breath, " +
  "pleuritic chest pain and anxiety. The client's oxygen saturation is 88% on room air, the heart " +
  "rate is 124/min and the respiratory rate is 28/min. Which actions should the nurse take?";

const question = (count: number): StageQuestionData => ({
  stem: { kind: "markdown", value: LONG_STEM },
  options: Array.from({ length: count }, (_, index) => ({
    letter: String.fromCharCode(65 + index),
    label: `Option ${index + 1}: assess the client and report the findings to the provider`,
  })),
});

function draw(data: StageQuestionData) {
  render(
    <StageQuestion
      place={{ position: 3, itemCount: 20, label: "Question 3 of 20", caseStep: null }}
      answers={{ responded: 4, present: 70 }}
      timer={NO_TIMER}
      question={data}
      casePlace={null}
      paused={false}
      url="learn-nclex.app/join"
      code="AJ4K7P"
      serverNow={() => 0}
    />,
  );
  return within(screen.getByRole("list", { name: "Choices" }));
}

describe("StageQuestion: a long question on a short projector", () => {
  it("draws every one of six options, in rows that share the height left", () => {
    const list = draw(question(6));
    const rows = list.getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    const choices = screen.getByRole("list", { name: "Choices" });
    expect(choices).toHaveClass("min-h-0", "flex-1", "auto-rows-[minmax(0,max-content)]");
    for (const row of rows) expect(row).toHaveClass("min-h-0", "overflow-hidden");
    // A long list's words stop at two lines on the wall.
    expect(list.getByText(/^Option 1:/)).toHaveClass("line-clamp-2");
  });

  it("clamps a long stem and steps it down a size before any option is lost", () => {
    draw(question(6));
    const stem = screen.getByText(LONG_STEM).closest("[data-stage-stem]");
    expect(stem).toHaveClass("line-clamp-3", "text-stage-option", "shrink-0");
  });

  it("leaves an ordinary four-option question at the full stage size, unclamped", () => {
    const ordinary: StageQuestionData = {
      stem: { kind: "markdown", value: "Which action should the nurse take first?" },
      options: ["Auscultate the lungs", "Encourage fluids", "Reassess tomorrow", "Teach diet"].map(
        (label, index) => ({ letter: String.fromCharCode(65 + index), label }),
      ),
    };
    draw(ordinary);
    const stem = screen.getByText(/Which action/).closest("[data-stage-stem]");
    expect(stem).toHaveClass("text-stage-stem");
    expect(stem).not.toHaveClass("line-clamp-3");
    expect(screen.getByText("Encourage fluids")).not.toHaveClass("line-clamp-2");
  });

  it("clamps four options too long to sit beside a long stem, so every row still shows", () => {
    draw(question(4));
    const stem = screen.getByText(LONG_STEM).closest("[data-stage-stem]");
    expect(stem).toHaveClass("line-clamp-3");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("keeps the count and the clock out of the part that gives way", () => {
    draw(question(6));
    expect(screen.getByTestId("answer-count")).toBeInTheDocument();
    expect(screen.getByTestId("answer-count").closest(".overflow-hidden")).toBeNull();
  });
});
