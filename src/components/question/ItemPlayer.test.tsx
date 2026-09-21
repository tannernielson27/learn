import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { scoreInProcess, toKeylessItem } from "@/lib/ngn/submit";
import { ItemPlayer, toPlayerItem } from "./ItemPlayer";
import { RENDERERS } from "./registry";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { feedbackShown } from "@/components/question/testing/feedback";

const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const sata = itemSchema.parse(FIXTURES.multiple_response.canonical);
const selectN = itemSchema.parse(FIXTURES.multiple_response.edge);
const unbuilt = itemSchema.parse(FIXTURES.bowtie.canonical);

describe("toPlayerItem", () => {
  it("strips the answer key outside feedback mode", () => {
    expect("answerKey" in toPlayerItem(mc, "answer")).toBe(false);
    expect("answerKey" in toPlayerItem(mc, "review")).toBe(false);
    expect("answerKey" in toPlayerItem(mc, "feedback")).toBe(true);
  });
});

describe("ItemPlayer with multiple choice", () => {
  it("disables submit until an option is chosen, then scores and shows feedback", async () => {
    const onSubmitted = vi.fn();
    render(<ItemPlayer item={mc} submit={scoreInProcess(mc)} onSubmitted={onSubmitted} />);
    await renderersLoaded();
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toHaveAttribute("aria-disabled", "true");
    // aria-disabled does not stop the click itself (#59): pressing it must still send nothing.
    await userEvent.click(submit);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary", { name: "Score" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    expect(submit).not.toHaveAttribute("aria-disabled");
    await userEvent.click(submit);
    await feedbackShown();

    const score = screen.getByRole("complementary", { name: "Score" });
    expect(within(score).getByText("1")).toBeInTheDocument();
    expect(within(score).getByText(/0\/1 scoring/)).toBeInTheDocument();
    expect(within(score).getByText(/Rapid weight gain/)).toBeInTheDocument();
    expect(onSubmitted).toHaveBeenCalledWith(
      { type: "multiple_choice", optionId: "opt_a" },
      // The whole reveal, so the caller can hand the key back when the item reopens (#46).
      expect.objectContaining({
        score: expect.objectContaining({ points: 1, maxPoints: 1 }),
        answerKey: mc.answerKey,
      }),
    );
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Auscultate the lungs/ })).toBeDisabled();
  });

  it("takes focus to the score on submit, which says what was scored", async () => {
    render(<ItemPlayer item={mc} submit={scoreInProcess(mc)} />);
    await renderersLoaded();
    await userEvent.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await feedbackShown();
    // The submit bar is gone, so focus must go somewhere: the result is where the reader wants it.
    const score = screen.getByRole("complementary", { name: "Score" });
    expect(document.activeElement).toBe(score);
    expect(score).toHaveAccessibleDescription(/1\s*\/\s*1/);
    // Headings, so a reader can move between the parts of the feedback rather than through it.
    expect(within(score).getByRole("heading", { name: "Score" })).toBeInTheDocument();
    expect(within(score).getByRole("heading", { name: "Rationale" })).toBeInTheDocument();
  });

  it("marks a wrong pick incorrect and the key as missed", async () => {
    render(<ItemPlayer item={mc} submit={scoreInProcess(mc)} />);
    await renderersLoaded();
    await userEvent.click(screen.getByRole("radio", { name: /Document the weight/ }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await feedbackShown();
    expect(screen.getByText("Incorrect")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });
});

describe("ItemPlayer with multiple response", () => {
  it("toggles checkboxes and applies plus-minus scoring", async () => {
    render(<ItemPlayer item={sata} submit={scoreInProcess(sata)} />);
    await renderersLoaded();
    await userEvent.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Oxygen saturation 89%/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Temperature 37.2/ }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await feedbackShown();
    const score = screen.getByRole("complementary", { name: "Score" });
    expect(within(score).getByText("1")).toBeInTheDocument();
    expect(within(score).getByText("/ 3")).toBeInTheDocument();
    expect(screen.getAllByText("Correct")).toHaveLength(2);
    expect(screen.getAllByText("Incorrect")).toHaveLength(1);
    expect(screen.getAllByText("Missed")).toHaveLength(1);
  });

  it("Select N caps selections and requires exactly N to submit", async () => {
    render(<ItemPlayer item={selectN} submit={scoreInProcess(selectN)} />);
    await renderersLoaded();
    const submit = screen.getByRole("button", { name: "Submit" });
    await userEvent.click(screen.getByRole("checkbox", { name: /blood cultures/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /broad-spectrum antibiotics/ }));
    expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/2 of 3 selected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /fluid resuscitation/ }));
    expect(submit).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("checkbox", { name: /compression devices/ })).toBeDisabled();
    expect(screen.getByText(/Deselect an option/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /broad-spectrum antibiotics/ }));
    expect(screen.getByRole("checkbox", { name: /compression devices/ })).toBeEnabled();
    expect(submit).toHaveAttribute("aria-disabled", "true");
  });
});

describe("ItemPlayer with sample content", () => {
  it("labels an item tagged sample, so it is never shown as if it were real", async () => {
    render(<ItemPlayer item={mc} submit={scoreInProcess(mc)} />);
    await renderersLoaded();
    const question = screen.getByRole("region", { name: "Multiple Choice question" });
    expect(within(question).getByText("Sample")).toBeInTheDocument();
  });

  it("leaves an untagged item unlabelled", async () => {
    const untagged = { ...mc, tags: ["cardiac"] };
    render(<ItemPlayer item={untagged} submit={scoreInProcess(untagged)} />);
    await renderersLoaded();
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
  });
});

describe("ItemPlayer without a renderer", () => {
  it("shows a placeholder instead of crashing", async () => {
    // Every item type has a renderer now, so unregister one to exercise the fallback for new types.
    const saved = RENDERERS.bowtie;
    delete RENDERERS.bowtie;
    try {
      render(<ItemPlayer item={unbuilt} submit={scoreInProcess(unbuilt)} />);
      await renderersLoaded();
      expect(screen.getByText(/No renderer/)).toBeInTheDocument();
    } finally {
      RENDERERS.bowtie = saved;
    }
  });
});

describe("ItemPlayer reopening a step someone has already answered", () => {
  const chosen = { type: "multiple_choice", optionId: "opt_c" } as const;
  const scored = { points: 0, maxPoints: 1, model: "zero_one" as const, breakdown: [] };
  // What a previous submit sent back: the score and, with it, this step's key (#46).
  const reveal = {
    score: scored,
    answerKey: mc.answerKey,
    rationale: mc.rationale,
    scoring: mc.scoring,
  };

  it("opens in feedback with the given answer and score, without scoring again", async () => {
    const submit = vi.fn(scoreInProcess(mc));
    render(
      <ItemPlayer item={mc} submit={submit} initialResponse={chosen} initialReveal={reveal} />,
    );
    await renderersLoaded();
    expect(screen.getByRole("radio", { name: /Document the weight/ })).toBeChecked();
    const panel = screen.getByRole("complementary", { name: "Score" });
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it("marks the answer from the key it is handed back, not from the item it is playing", async () => {
    // The point of #46: a keyless step reopens with its marks because the reveal came back with it.
    const keyless = toKeylessItem(mc);
    render(
      <ItemPlayer
        item={keyless}
        submit={scoreInProcess(mc)}
        initialResponse={chosen}
        initialReveal={reveal}
      />,
    );
    await renderersLoaded();
    expect(screen.getByText("Incorrect")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });

  it("reports every change, so a caller that unmounts it can hand the answer back", async () => {
    const onResponseChange = vi.fn();
    render(
      <ItemPlayer item={mc} submit={scoreInProcess(mc)} onResponseChange={onResponseChange} />,
    );
    await renderersLoaded();
    await userEvent.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    expect(onResponseChange).toHaveBeenCalledWith({ type: "multiple_choice", optionId: "opt_a" });
  });
});
