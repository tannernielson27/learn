import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { localInputToIso } from "@/lib/assignments/assignments";
import {
  AssignmentForm,
  type AssignmentFormProps,
  type AssignmentFormState,
} from "./AssignmentForm";

const CLASSES = [
  { id: "00000000-0000-4000-8000-0000000000c1", name: "NUR 310" },
  { id: "00000000-0000-4000-8000-0000000000c2", name: "NUR 320" },
];

function setup(result: AssignmentFormState, props: Partial<AssignmentFormProps> = {}) {
  const action = vi.fn<AssignmentFormProps["action"]>(async () => result);
  render(<AssignmentForm action={action} submitLabel="Assign" {...props} />);
  return { action, user: userEvent.setup() };
}

function sent(action: ReturnType<typeof setup>["action"]): FormData {
  return action.mock.calls[0]![1];
}

describe("AssignmentForm", () => {
  it("assigns to the chosen class with the window as instants, one attempt and shuffling on", async () => {
    const { action, user } = setup({ status: "idle" }, { classes: CLASSES });
    await user.selectOptions(screen.getByRole("combobox", { name: "Class" }), "NUR 320");
    const opens = screen.getByLabelText("Opens");
    const closes = screen.getByLabelText("Closes");
    expect(screen.getByRole("combobox", { name: "Attempts" })).toHaveValue("1");
    expect(screen.getByRole("checkbox", { name: "Shuffle answer options" })).toBeChecked();

    await user.clear(closes);
    await user.type(closes, "2030-01-02T17:00");
    await user.click(screen.getByRole("button", { name: "Assign" }));

    const data = sent(action);
    expect(data.get("classId")).toBe(CLASSES[1]!.id);
    expect(data.get("opensAt")).toBe(localInputToIso((opens as HTMLInputElement).value));
    expect(data.get("closesAt")).toBe(localInputToIso("2030-01-02T17:00"));
    expect(data.get("maxAttempts")).toBe("1");
    expect(data.get("shuffleOptions")).toBe("on");
  });

  it("offers one to three attempts", async () => {
    const { action, user } = setup({ status: "idle" }, { classes: CLASSES });
    const attempts = screen.getByRole("combobox", { name: "Attempts" });
    expect([...(attempts as HTMLSelectElement).options].map((option) => option.value)).toEqual([
      "1",
      "2",
      "3",
    ]);
    await user.selectOptions(attempts, "3");
    await user.click(screen.getByRole("checkbox", { name: "Shuffle answer options" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(sent(action).get("maxAttempts")).toBe("3");
    expect(sent(action).get("shuffleOptions")).toBeNull();
  });

  it("starts an edit from the assignment's own values, shown in local time", () => {
    setup(
      { status: "idle" },
      {
        initial: {
          opensAt: localInputToIso("2030-03-04T08:30")!,
          closesAt: localInputToIso("2030-03-05T17:00")!,
          maxAttempts: 2,
          shuffleOptions: false,
        },
        submitLabel: "Save changes",
      },
    );
    expect(screen.queryByRole("combobox", { name: "Class" })).toBeNull();
    expect(screen.getByLabelText("Opens")).toHaveValue("2030-03-04T08:30");
    expect(screen.getByLabelText("Closes")).toHaveValue("2030-03-05T17:00");
    expect(screen.getByRole("combobox", { name: "Attempts" })).toHaveValue("2");
    expect(screen.getByRole("checkbox", { name: "Shuffle answer options" })).not.toBeChecked();
  });

  it("offers only the close time once the assignment has opened", async () => {
    const { action, user } = setup(
      { status: "saved" },
      {
        initial: {
          opensAt: localInputToIso("2020-03-04T08:30")!,
          closesAt: localInputToIso("2030-03-05T17:00")!,
          maxAttempts: 2,
          shuffleOptions: true,
        },
        closeOnly: true,
        submitLabel: "Save close time",
      },
    );
    expect(screen.queryByLabelText("Opens")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Attempts" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save close time" }));
    expect(sent(action).get("closesAt")).toBe(localInputToIso("2030-03-05T17:00"));
    expect(sent(action).get("opensAt")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("will not send a cleared time", async () => {
    const { action, user } = setup({ status: "idle" }, { classes: CLASSES });
    await user.clear(screen.getByLabelText("Closes"));
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and focuses the first field", async () => {
    const { user } = setup({ status: "error", error: "Choose a class." }, { classes: CLASSES });
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a class.");
    expect(screen.getByRole("combobox", { name: "Class" })).toHaveFocus();
  });
});
