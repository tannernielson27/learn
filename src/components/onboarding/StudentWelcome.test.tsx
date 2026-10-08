import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { studentWelcomeSteps } from "@/lib/onboarding/studentWelcome";
import { StudentWelcome } from "./StudentWelcome";

const STEPS = studentWelcomeSteps("Kai Ortiz", ["NUR 310"]);

function setup() {
  const onDone = vi.fn(async () => {});
  render(
    <>
      <h1 id="student-home-heading" tabIndex={-1}>
        Your classes
      </h1>
      <StudentWelcome steps={STEPS} onDone={onDone} focusAfter="student-home-heading" />
    </>,
  );
  return { onDone, user: userEvent.setup() };
}

const dialog = () => screen.getByRole("dialog");
const button = (name: string) => screen.getByRole("button", { name });

describe("StudentWelcome (#365)", () => {
  it("opens on the first step, greeting the student by name and naming their class", () => {
    setup();
    expect(dialog()).toHaveAccessibleName("Welcome, Kai Ortiz");
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
    expect(dialog()).toHaveTextContent("You are in NUR 310.");
  });

  it("walks forward and back through the three steps", async () => {
    const { user, onDone } = setup();
    await user.click(button("Next"));
    expect(dialog()).toHaveAccessibleName("Assignments and practice");
    await user.click(button("Next"));
    expect(dialog()).toHaveAccessibleName("Results and live sessions");
    expect(screen.getByRole("status")).toHaveTextContent("Step 3 of 3");
    await user.click(button("Back"));
    expect(dialog()).toHaveAccessibleName("Assignments and practice");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("records it as seen on finishing, closes, and moves focus to the page's heading", async () => {
    const { user, onDone } = setup();
    await user.click(button("Next"));
    await user.click(button("Next"));
    await user.click(button("Go to my classes"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Your classes" })).toHaveFocus();
  });

  it.each(["Skip", "Close"])("records it as seen on %s", async (name) => {
    const { user, onDone } = setup();
    await user.click(button(name));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws a class name as text, never as markup", () => {
    render(
      <StudentWelcome
        steps={studentWelcomeSteps("Kai", ["<img src=x onerror=alert(1)>"])}
        onDone={async () => {}}
        focusAfter="nowhere"
      />,
    );
    expect(dialog()).toHaveTextContent("You are in <img src=x onerror=alert(1)>.");
    expect(document.querySelector("img")).toBeNull();
  });
});
