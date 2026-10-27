import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { teacherWelcomeSteps } from "@/lib/onboarding/teacherWelcome";
import { TeacherWelcome } from "./TeacherWelcome";

const STEPS = teacherWelcomeSteps("Ada Lovelace");

function setup() {
  const onDone = vi.fn(async () => {});
  render(
    <>
      <h2 id="get-started-heading" tabIndex={-1}>
        Get started
      </h2>
      <TeacherWelcome steps={STEPS} onDone={onDone} focusAfter="get-started-heading" />
    </>,
  );
  return { onDone, user: userEvent.setup() };
}

const dialog = () => screen.getByRole("dialog");
const button = (name: string) => screen.getByRole("button", { name });

describe("TeacherWelcome (#364)", () => {
  // One step: a plain dialog with its one button, and none of a stepped dialog's chrome.
  it("greets the teacher by name in one step, with no step count, Skip or Next", () => {
    setup();
    expect(dialog()).toHaveAccessibleName("Welcome, Ada Lovelace");
    expect(dialog()).toHaveTextContent("No other teacher can see what you make in it.");
    expect(screen.queryByRole("status")).toBeNull();
    for (const name of ["Skip", "Next", "Back"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("records it as seen on Get started, closes, and moves focus to the checklist", async () => {
    const { user, onDone } = setup();
    await user.click(button("Get started"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Get started" })).toHaveFocus();
  });

  it("records it as seen on Close", async () => {
    const { user, onDone } = setup();
    await user.click(button("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Get started" })).toHaveFocus();
  });

  it("records it once, however many times it is told to end", async () => {
    const { user, onDone } = setup();
    await user.dblClick(button("Get started"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("still closes when recording fails", async () => {
    const onDone = vi.fn(async () => {
      throw new Error("network");
    });
    render(<TeacherWelcome steps={STEPS} onDone={onDone} focusAfter="nowhere" />);
    await userEvent.setup().click(button("Get started"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws nothing when it is given no steps", () => {
    render(<TeacherWelcome steps={[]} onDone={async () => {}} focusAfter="nowhere" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
