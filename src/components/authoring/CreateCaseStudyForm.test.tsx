import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateCaseStudyForm, type CaseStudyFormState } from "./CreateCaseStudyForm";

type Action = (state: CaseStudyFormState, formData: FormData) => Promise<CaseStudyFormState>;

describe("CreateCaseStudyForm", () => {
  it("offers a title field limited to the table's 200 characters, and a New case study button", () => {
    render(<CreateCaseStudyForm action={vi.fn<Action>(async () => ({ status: "idle" }))} />);
    const title = screen.getByRole("textbox", { name: "Case study title" });
    expect(title).toHaveAttribute("name", "title");
    expect(title).toHaveAttribute("maxLength", "200");
    expect(screen.getByRole("button", { name: "New case study" })).toBeInTheDocument();
  });

  it("sends the title to the action", async () => {
    const action = vi.fn<Action>(async () => ({ status: "idle" }));
    render(<CreateCaseStudyForm action={action} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Case study title" }), "Sepsis");
    await userEvent.click(screen.getByRole("button", { name: "New case study" }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1].get("title")).toBe("Sepsis");
  });

  it("shows the action's error, keeps what was typed, and moves focus to the field", async () => {
    const action = vi.fn<Action>(async () => ({
      status: "error",
      error: "Give the case study a title.",
    }));
    render(<CreateCaseStudyForm action={action} />);
    const title = screen.getByRole("textbox", { name: "Case study title" });
    // Spaces, because `required` stops the browser sending an empty field; the server trims them.
    await userEvent.type(title, "   ");
    await userEvent.click(screen.getByRole("button", { name: "New case study" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the case study a title.");
    expect(title).toHaveValue("   ");
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute("aria-invalid", "true");
  });
});
