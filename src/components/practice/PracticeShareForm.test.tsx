import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  PracticeShareForm,
  type PracticeShareFormProps,
  type ShareFormState,
} from "./PracticeShareForm";

const CHOICES = [
  { id: "00000000-0000-4000-8000-0000000000c1", name: "NUR 310" },
  { id: "00000000-0000-4000-8000-0000000000c2", name: "NUR 320" },
];

function setup(result: ShareFormState, props: Partial<PracticeShareFormProps> = {}) {
  const action = vi.fn<PracticeShareFormProps["action"]>(async () => result);
  render(
    <PracticeShareForm
      action={action}
      choices={CHOICES}
      label="Class"
      emptyMessage="Shared with every class."
      {...props}
    />,
  );
  return { action, user: userEvent.setup() };
}

describe("PracticeShareForm", () => {
  it("offers every choice, the first selected", () => {
    setup({ status: "idle" });
    const select = screen.getByRole("combobox", { name: "Class" });
    expect(select).toHaveValue(CHOICES[0]!.id);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("shares the chosen one", async () => {
    const { action, user } = setup({ status: "shared" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Class" }), "NUR 320");
    await user.click(screen.getByRole("button", { name: "Share for practice" }));
    expect(action.mock.calls[0]![1].get("target")).toBe(CHOICES[1]!.id);
    expect(await screen.findByRole("status")).toHaveTextContent("Shared for practice.");
  });

  it("ties a refusal to the select and focuses it", async () => {
    const { user } = setup({ status: "error", error: "That bank or class no longer exists." });
    await user.click(screen.getByRole("button", { name: "Share for practice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer exists");
    const select = screen.getByRole("combobox", { name: "Class" });
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute("aria-invalid", "true");
  });

  it("says why there is nothing to choose", () => {
    setup({ status: "idle" }, { choices: [] });
    expect(screen.getByText("Shared with every class.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share for practice" })).toBeNull();
  });
});
