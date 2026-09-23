import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClassNameForm, type ClassFormState, type ClassNameFormProps } from "./ClassNameForm";

function setup(result: ClassFormState, props: Partial<ClassNameFormProps> = {}) {
  const action = vi.fn<ClassNameFormProps["action"]>(async () => result);
  render(<ClassNameForm action={action} {...props} />);
  return { action, user: userEvent.setup() };
}

describe("ClassNameForm", () => {
  it("names a new class", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.type(screen.getByRole("textbox", { name: "Class name" }), "NUR 310 — Fall");
    await user.click(screen.getByRole("button", { name: "Create class" }));
    expect(action.mock.calls[0]![1].get("name")).toBe("NUR 310 — Fall");
  });

  it("renames, starting from the current name", async () => {
    const { user } = setup({ status: "saved" }, { initialName: "NUR 310", submitLabel: "Rename" });
    expect(screen.getByRole("textbox", { name: "Class name" })).toHaveValue("NUR 310");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("ties an error to the field and focuses it", async () => {
    const { user } = setup({ status: "error", error: "Give the class a name." });
    await user.type(screen.getByRole("textbox", { name: "Class name" }), " ");
    await user.click(screen.getByRole("button", { name: "Create class" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the class a name.");
    expect(screen.getByRole("textbox", { name: "Class name" })).toHaveFocus();
  });
});
