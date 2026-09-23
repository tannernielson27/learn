// #59: an unavailable Submit is aria-disabled rather than disabled, so a keyboard or screen reader
// user can reach it and hear why. aria-disabled is advisory only: the browser still fires click on
// Enter, Space and pointer presses, so every test here that finds the button blocked also presses
// it and proves nothing was sent.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { QuestionShell } from "./QuestionShell";

const REASON = "Complete the item to submit.";

function renderShell(props: Partial<ComponentProps<typeof QuestionShell>> = {}) {
  const onSubmit = vi.fn();
  render(
    <QuestionShell
      stem={{ kind: "markdown", value: "Which finding needs follow-up?" }}
      mode="answer"
      canSubmit={false}
      onSubmit={onSubmit}
      {...props}
    >
      <button type="button">An option</button>
    </QuestionShell>,
  );
  const submit = screen.getByRole("button", { name: /^(Submit|Checking your answer)$/ });
  return { onSubmit, submit };
}

describe("QuestionShell Submit while the item is incomplete", () => {
  it("is focusable, announced as unavailable, and described by the reason", async () => {
    const { submit } = renderShell();
    // Not natively disabled, or it could not take focus and the reason would never be read.
    expect(submit).not.toHaveAttribute("disabled");
    expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(submit).toHaveAccessibleDescription(REASON);
    // The description points at text that is actually on the page.
    const reasonId = submit.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent(REASON);
    expect(document.getElementById(reasonId!)).toBeVisible();

    // Keyboard order: the item's own control first, then Submit, which is no longer skipped.
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "An option" })).toHaveFocus();
    await userEvent.tab();
    expect(submit).toHaveFocus();
  });

  it("does not submit on click, Enter or Space", async () => {
    const { onSubmit, submit } = renderShell();
    await userEvent.click(submit);
    submit.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit a surrounding form either", async () => {
    const onFormSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    const onSubmit = vi.fn();
    render(
      <form onSubmit={(event) => onFormSubmit(event.nativeEvent as SubmitEvent)}>
        <QuestionShell
          stem={{ kind: "markdown", value: "Stem" }}
          mode="answer"
          canSubmit={false}
          onSubmit={onSubmit}
        >
          <input aria-label="Notes" />
        </QuestionShell>
      </form>,
    );
    const submit = screen.getByRole("button", { name: "Submit" });
    // A button, not a submit button, so pressing it is never an implicit form submission.
    expect(submit).toHaveAttribute("type", "button");
    submit.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(submit);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  it("keeps the disabled look, so nothing on the page moves", () => {
    const { submit } = renderShell();
    // Button's own disabled: classes no longer match, so these stand in for them.
    expect(submit.className).toContain("aria-disabled:opacity-50");
    expect(submit.className).toContain("aria-disabled:cursor-not-allowed");
  });
});

describe("QuestionShell Submit once the item is complete", () => {
  it("is available, has no reason, and submits once per press", async () => {
    const { onSubmit, submit } = renderShell({ canSubmit: true });
    expect(submit).not.toHaveAttribute("aria-disabled");
    expect(submit).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits from the keyboard", async () => {
    const { onSubmit, submit } = renderShell({ canSubmit: true });
    submit.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("ignores presses while the answer is being checked", async () => {
    const { onSubmit, submit } = renderShell({ canSubmit: true, submitting: true });
    expect(submit).toHaveAccessibleName("Checking your answer");
    expect(submit).toHaveAttribute("aria-disabled", "true");
    // Complete, so there is no reason to give.
    expect(submit).not.toHaveAttribute("aria-describedby");
    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("points at nothing when an error takes the reason's place", () => {
    const { submit } = renderShell({ canSubmit: true, submitError: "Could not check." });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not check.");
    expect(submit).not.toHaveAttribute("aria-describedby");
    expect(submit).not.toHaveAttribute("aria-disabled");
  });
});
