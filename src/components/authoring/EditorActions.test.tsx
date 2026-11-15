import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EDITOR_MORE_ID, EditorActions, type EditorActionsProps } from "./EditorActions";

const PROBLEMS = [
  { field: "stem", message: "Write the question stem." },
  { field: "options.0.text", message: "Write option A." },
  { field: "options.1.text", message: "Write option B." },
  { field: "rationale", message: "Write the rationale." },
];

function draw(over: Partial<EditorActionsProps> = {}) {
  const props: EditorActionsProps = {
    saveOnly: false,
    published: false,
    busy: false,
    canPublish: false,
    dirty: false,
    done: null,
    error: null,
    unpublishId: "q-unpublish",
    problems: PROBLEMS.slice(0, 2),
    focusProblem: vi.fn(),
    idPrefix: "q",
    onSave: vi.fn(),
    onSaveDraft: vi.fn(),
    onPublish: vi.fn(),
    ...over,
  };
  render(<EditorActions {...props} />);
  return props;
}

describe("EditorActions (#563)", () => {
  it("makes Publish the primary and Save draft the secondary, keeping their names", () => {
    draw();
    expect(screen.getByRole("button", { name: "Publish" })).toHaveClass("bg-accent");
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveClass("border-field-border");
  });

  it("says beside Publish how many problems stop it, and names them on Publish", () => {
    draw();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    expect(publish).toHaveAccessibleDescription("2 problems to fix");
    // The short list waits until it is asked for.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the summary as an alert and moves focus to it when Publish is pressed", async () => {
    const props = draw();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    expect(summary).toHaveTextContent("Fix these 2 problems to publish");
    expect(
      within(summary)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Write the question stem.", "Write option A."]);
    expect(screen.getByRole("button", { name: "2 problems to fix" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Publish is still told, and refuses as it always has.
    expect(props.onPublish).toHaveBeenCalledTimes(1);
  });

  it("takes the author to a problem's field from the summary", async () => {
    const props = draw();
    await userEvent.click(screen.getByRole("button", { name: "2 problems to fix" }));
    await userEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Write option A." }),
    );
    expect(props.focusProblem).toHaveBeenCalledWith("options.0.text");
  });

  it("lists a few and points at the full list for the rest", async () => {
    draw({ problems: PROBLEMS });
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const summary = screen.getByRole("alert");
    expect(within(summary).getAllByRole("button")).toHaveLength(3);
    expect(summary).toHaveTextContent("1 more in Problems to fix, under the fields.");
  });

  it("says one problem in the singular", async () => {
    draw({ problems: PROBLEMS.slice(0, 1) });
    await userEvent.click(screen.getByRole("button", { name: "1 problem to fix" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Fix this problem to publish");
  });

  it("offers no summary once there is nothing to fix", () => {
    draw({ problems: [], canPublish: true });
    expect(screen.queryByRole("button", { name: /problems? to fix/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("offers no summary on a host that only saves", () => {
    draw({ saveOnly: true });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /problems? to fix/ })).toBeNull();
  });

  it("puts the rarer actions behind More, a popover beside Publish", () => {
    draw({ more: <button type="button">Duplicate question</button> });
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "popovertarget",
      EDITOR_MORE_ID,
    );
    expect(
      within(document.getElementById(EDITOR_MORE_ID)!).getByRole("button", {
        name: "Duplicate question",
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it("offers no More on a host with nothing to put there", () => {
    draw();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
});
