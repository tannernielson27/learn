import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyMultipleResponseForm,
  toMultipleResponseForm,
  type MultipleResponseFormValues,
} from "@/lib/authoring/forms/multipleResponse";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseItemSchema } from "@/lib/ngn/schemas";
import { MultipleResponseEditor } from "./MultipleResponseEditor";

function setup(initialValues: MultipleResponseFormValues) {
  render(
    <MultipleResponseEditor
      initialValues={initialValues}
      onSaveDraft={vi.fn(async () => ({ ok: true }))}
      onPublish={vi.fn(async () => ({ ok: true }))}
    />,
  );
  return userEvent.setup();
}

// The canonical fixture is select-all-that-apply with A, B and D correct: worth 3 points.
const sata = () =>
  toMultipleResponseForm(multipleResponseItemSchema.parse(FIXTURES.multiple_response.canonical));

describe("scoring summary in the editor", () => {
  it("states the points and the rule for a valid item, without being a live region", () => {
    setup(sata());
    const scoring = screen.getByRole("region", { name: "Scoring" });
    expect(scoring).toHaveTextContent("Worth 3 points. +/- scoring.");
    expect(scoring).toHaveTextContent(
      "Each correct selection earns one point and each incorrect selection removes one",
    );
    expect(scoring).not.toHaveAttribute("aria-live");
    expect(scoring.querySelector("[aria-live]")).toBeNull();
  });

  it("updates as another correct answer is marked", async () => {
    const user = setup(sata());
    const scoring = screen.getByRole("region", { name: "Scoring" });
    await user.click(screen.getByRole("checkbox", { name: "Option C is correct" }));
    expect(scoring).toHaveTextContent("Worth 4 points. +/- scoring.");
  });

  it("asks the author to finish the item instead of a number while it is incomplete", () => {
    setup(emptyMultipleResponseForm("mr_new"));
    expect(screen.getByRole("region", { name: "Scoring" })).toHaveTextContent(
      "Finish the item to see its score.",
    );
    expect(screen.getByRole("region", { name: "Scoring" })).not.toHaveTextContent(/Worth/);
  });

  // The prompt must not tell an author to mark answers they have already marked.
  it("does not ask for answers when they are marked but something else is missing", () => {
    setup({ ...sata(), stem: "" });
    const scoring = screen.getByRole("region", { name: "Scoring" });
    expect(scoring).toHaveTextContent("Finish the item to see its score.");
    expect(scoring).not.toHaveTextContent(/Mark the correct answers/);
  });
});
