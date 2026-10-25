import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import { ClassLiveStartForm } from "./ClassLiveStartForm";

const QUIZZES = [
  { id: "00000000-0000-4000-8000-0000000000d1", name: "Cardiac week", itemCount: 12 },
  { id: "00000000-0000-4000-8000-0000000000d2", name: "Respiratory review", itemCount: 1 },
];
const action = async () => {};

describe("ClassLiveStartForm", () => {
  it("asks for a quiz and the pacing, and says who counts", () => {
    const { container } = render(
      <ClassLiveStartForm className="NUR 310" quizzes={QUIZZES} action={action} />,
    );
    const quiz = screen.getByRole("combobox", { name: "Quiz" });
    expect(quiz).toHaveAttribute("name", "bankId");
    expect(quiz).toBeRequired();
    expect(quiz).toHaveValue("");
    expect(screen.getByRole("option", { name: "Cardiac week (12 questions)" })).toHaveValue(
      QUIZZES[0]?.id,
    );
    expect(screen.getByRole("option", { name: "Respiratory review (1 question)" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Teacher-paced" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Student-paced" })).not.toBeChecked();
    expect(
      screen.getByText(
        "For NUR 310. Students signed in to the class count toward it. Anyone else joins as a guest.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Start a live session" })).toHaveAttribute(
      "type",
      "submit",
    );
    // The class is the page's, never a field of the form.
    expect(container.querySelector("[name='classId']")).toBeNull();
    expect(findRetiredTerms(container.innerHTML)).toEqual([]);
  });

  it("shows why the last start was refused", () => {
    render(
      <ClassLiveStartForm
        className="NUR 310"
        quizzes={QUIZZES}
        action={action}
        refusal="Choose a quiz to start."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a quiz to start.");
  });

  it("points a teacher with no quizzes at the library", () => {
    render(<ClassLiveStartForm className="NUR 310" quizzes={[]} action={action} />);
    expect(screen.getByRole("heading", { level: 2, name: "No quizzes yet" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to your quizzes" })).toHaveAttribute(
      "href",
      "/author",
    );
  });

  it("says the quizzes could not be loaded", () => {
    render(<ClassLiveStartForm className="NUR 310" quizzes={null} action={action} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your quizzes could not be loaded.");
  });
});
