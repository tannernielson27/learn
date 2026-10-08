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
  it("opens on the first step, greeting the teacher by name", () => {
    setup();
    expect(dialog()).toHaveAccessibleName("Welcome, Ada Lovelace");
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
    expect(dialog()).toHaveTextContent("no other teacher can see them");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("walks forward and back through the three steps", async () => {
    const { user, onDone } = setup();
    await user.click(button("Next"));
    expect(dialog()).toHaveAccessibleName("Start with a question bank");
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
    await user.click(button("Next"));
    expect(dialog()).toHaveAccessibleName("Then a class, and your first session");
    expect(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await user.click(button("Back"));
    expect(dialog()).toHaveAccessibleName("Start with a question bank");
    await user.click(button("Back"));
    expect(dialog()).toHaveAccessibleName("Welcome, Ada Lovelace");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("records it as seen on finishing, closes, and moves focus to the checklist", async () => {
    const { user, onDone } = setup();
    await user.click(button("Next"));
    await user.click(button("Next"));
    await user.click(button("Get started"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Get started" })).toHaveFocus();
  });

  it.each(["Skip", "Close"])("records it as seen on %s, from any step", async (name) => {
    const { user, onDone } = setup();
    await user.click(button("Next"));
    await user.click(button(name));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Get started" })).toHaveFocus();
  });

  it("records it once, however many times it is told to end", async () => {
    const { user, onDone } = setup();
    await user.dblClick(button("Skip"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("still closes when recording fails", async () => {
    const onDone = vi.fn(async () => {
      throw new Error("network");
    });
    render(<TeacherWelcome steps={STEPS} onDone={onDone} focusAfter="nowhere" />);
    await userEvent.setup().click(button("Skip"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws nothing when it is given no steps", () => {
    render(<TeacherWelcome steps={[]} onDone={async () => {}} focusAfter="nowhere" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
