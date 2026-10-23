import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CHANGEABLE, INCOMPLETE, SubmitBar } from "./SubmitBar";

function renderBar(props: Partial<Parameters<typeof SubmitBar>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <SubmitBar
      canSubmit
      onSubmit={onSubmit}
      submitting={false}
      busyLabel="Checking your answer"
      {...props}
    />,
  );
  return { onSubmit, button: screen.getByRole("button") };
}

describe("SubmitBar", () => {
  it("says the answer can still change, or what it holds, once it is complete", async () => {
    const { onSubmit, button } = renderBar();
    expect(screen.getByText(CHANGEABLE)).toBeInTheDocument();
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("puts the renderer's own status in that line", () => {
    renderBar({ status: "2 selected" });
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.queryByText(CHANGEABLE)).toBeNull();
  });

  it("says why it cannot submit yet, and the press sends nothing", async () => {
    const { onSubmit, button } = renderBar({ canSubmit: false, status: "0 selected" });
    expect(button).toHaveAccessibleDescription(INCOMPLETE);
    await userEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a failed check as an alert in place of the status", () => {
    renderBar({ submitError: "Your answer could not be checked. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be checked");
  });

  it("is a solid surface with a 56px Submit on a phone, and a right-hand column on its side", () => {
    renderBar();
    const bar = document.querySelector("[data-submit-bar]");
    expect(bar?.className).toContain("bg-surface-1");
    expect(bar?.className).not.toContain("backdrop-blur");
    expect(bar?.className).toContain("short:right-0");
    expect(screen.getByRole("button").className).toContain("min-h-(--button-height-lg)");
  });
});
