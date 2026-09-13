import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportJsonForm, type ImportFormState } from "./ImportJsonForm";

function setup(result: ImportFormState) {
  const action = vi.fn<(state: ImportFormState, data: FormData) => Promise<ImportFormState>>(
    async () => result,
  );
  render(<ImportJsonForm action={action} />);
  return { action, user: userEvent.setup() };
}

describe("ImportJsonForm", () => {
  it("takes a JSON file, or JSON pasted in", () => {
    setup({ status: "idle" });
    expect(screen.getByLabelText("JSON file")).toHaveAttribute("type", "file");
    expect(screen.getByRole("textbox", { name: "Or paste JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("sends what was pasted", async () => {
    const { action, user } = setup({ status: "done", message: "Imported 1 item as a draft." });
    await user.click(screen.getByRole("textbox", { name: "Or paste JSON" }));
    await user.paste('{"format":"learn.v1","items":[]}');
    await user.click(screen.getByRole("button", { name: "Import" }));
    const sent = action.mock.calls[0]![1];
    expect(sent.get("json")).toBe('{"format":"learn.v1","items":[]}');
  });

  it("lists every problem when the import is refused, and says nothing was imported", async () => {
    const { user } = setup({
      status: "error",
      errors: ['Item 2: "stem.value" is not valid.', 'Item 3: "scoring" is not valid.'],
    });
    await user.click(screen.getByRole("button", { name: "Import" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nothing was imported.");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
  });

  it("clears the pasted JSON once it has been imported, so it cannot be imported twice", async () => {
    const { user } = setup({ status: "done", message: "Imported 1 item as a draft." });
    const box = screen.getByRole("textbox", { name: "Or paste JSON" });
    await user.click(box);
    await user.paste('{"format":"learn.v1","items":[]}');
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Imported 1 item as a draft.")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("keeps the pasted JSON when the import is refused, so it can be fixed", async () => {
    const { user } = setup({ status: "error", errors: ["This is not valid JSON."] });
    const box = screen.getByRole("textbox", { name: "Or paste JSON" });
    await user.click(box);
    await user.paste("{ not json");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(box).toHaveValue("{ not json");
  });

  it("says what was imported", async () => {
    const { user } = setup({ status: "done", message: "Imported 2 items as drafts." });
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Imported 2 items as drafts.")).toHaveAttribute(
      "role",
      "status",
    );
  });
});
