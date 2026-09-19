import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TAG_LIMITS } from "@/lib/ngn/tags";
import type { CjmmStep } from "@/lib/ngn/types";
import { TagFields } from "./TagFields";

function Harness({
  initialTags = [],
  initialStep,
  stepFixed = false,
  onChange = () => {},
}: {
  initialTags?: string[];
  initialStep?: CjmmStep;
  stepFixed?: boolean;
  onChange?: (tags: string[], step: CjmmStep | undefined) => void;
}) {
  const [tags, setTags] = useState(initialTags);
  const [step, setStep] = useState(initialStep);
  return (
    <TagFields
      idPrefix="t"
      tags={tags}
      cjmmStep={step}
      onTagsChange={(next) => {
        setTags(next);
        onChange(next, step);
      }}
      onStepChange={
        stepFixed
          ? undefined
          : (next) => {
              setStep(next);
              onChange(tags, next);
            }
      }
    />
  );
}

const setup = (props: Parameters<typeof Harness>[0] = {}) => {
  const onChange = vi.fn();
  render(<Harness {...props} onChange={onChange} />);
  return { onChange, user: userEvent.setup({ delay: null }) };
};

const topicList = () => screen.queryByRole("list", { name: "Topic tags" });

describe("TagFields", () => {
  it("offers the eight client needs categories as checkboxes, checked when tagged", () => {
    setup({ initialTags: ["Physiological Adaptation"] });
    const needs = screen.getByRole("group", { name: "Client needs" });
    expect(within(needs).getAllByRole("checkbox")).toHaveLength(8);
    expect(within(needs).getByRole("checkbox", { name: "Physiological Adaptation" })).toBeChecked();
    expect(within(needs).getByRole("checkbox", { name: "Management of Care" })).not.toBeChecked();
  });

  it("adds and removes a client need", async () => {
    const { onChange, user } = setup({ initialTags: ["sepsis"] });
    await user.click(screen.getByRole("checkbox", { name: "Management of Care" }));
    expect(onChange).toHaveBeenLastCalledWith(["sepsis", "Management of Care"], undefined);
    await user.click(screen.getByRole("checkbox", { name: "Management of Care" }));
    expect(onChange).toHaveBeenLastCalledWith(["sepsis"], undefined);
  });

  it("adds topics typed with commas, trimmed, lower-cased and without repeats, on Enter", async () => {
    const { onChange, user } = setup({ initialTags: ["sepsis"] });
    const input = screen.getByRole("textbox", { name: "Add topic tags" });
    await user.type(input, "  Renal ,SEPSIS, fluid   balance{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["sepsis", "renal", "fluid balance"], undefined);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(
      within(topicList()!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["sepsis", "renal", "fluid balance"]);
  });

  it("files a typed client need under client needs, in its fixed spelling", async () => {
    const { onChange, user } = setup();
    await user.type(
      screen.getByRole("textbox", { name: "Add topic tags" }),
      "physiological adaptation",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenLastCalledWith(["Physiological Adaptation"], undefined);
    expect(screen.getByRole("checkbox", { name: "Physiological Adaptation" })).toBeChecked();
    expect(topicList()).not.toBeInTheDocument();
  });

  it("removes a topic and returns focus to the input", async () => {
    const { onChange, user } = setup({ initialTags: ["sepsis", "renal"] });
    await user.click(screen.getByRole("button", { name: "Remove tag sepsis" }));
    expect(onChange).toHaveBeenLastCalledWith(["renal"], undefined);
    expect(screen.getByRole("textbox", { name: "Add topic tags" })).toHaveFocus();
  });

  it("refuses a tag past the length limit or the count limit, and says why", async () => {
    const full = Array.from({ length: TAG_LIMITS.count }, (_, i) => `topic ${i}`);
    const { onChange, user } = setup({ initialTags: full });
    const input = screen.getByRole("textbox", { name: "Add topic tags" });
    await user.type(input, "one more{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      `An item can have at most ${TAG_LIMITS.count} tags.`,
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("one more");
    await user.click(screen.getByRole("checkbox", { name: "Management of Care" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses an over-long tag", async () => {
    const { onChange, user } = setup();
    await user.type(
      screen.getByRole("textbox", { name: "Add topic tags" }),
      `${"x".repeat(TAG_LIMITS.length + 1)}{Enter}`,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      `Keep each tag to ${TAG_LIMITS.length} characters or fewer.`,
    );
  });

  it("chooses a clinical judgment step, or none", async () => {
    const { onChange, user } = setup();
    const select = screen.getByRole("combobox", { name: "Clinical judgment step" });
    expect(select).toHaveValue("");
    await user.selectOptions(select, "Step 3: Prioritize Hypotheses");
    expect(onChange).toHaveBeenLastCalledWith([], 3);
    await user.selectOptions(select, "None");
    expect(onChange).toHaveBeenLastCalledWith([], undefined);
  });

  it("shows a fixed step as a tag, without a way to change it", () => {
    setup({ initialStep: 4, stepFixed: true });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Step 4: Generate Solutions")).toBeInTheDocument();
  });
});
