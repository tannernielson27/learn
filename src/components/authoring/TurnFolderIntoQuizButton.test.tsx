import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import { TurnFolderIntoQuizButton } from "./TurnFolderIntoQuizButton";

type Turn = () => Promise<ConfirmOutcome | void>;
const KEPT = ["Its 2 live session reports keep their questions."];

function draw(action: Turn, hasSubfolders = true) {
  render(
    <TurnFolderIntoQuizButton
      action={action}
      folderName="Cardiac"
      quizName="Cardiac (2)"
      hasSubfolders={hasSubfolders}
      staysBehind={KEPT}
    />,
  );
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Turn into a quiz" }));
  return screen.getByRole("dialog", { name: 'Turn "Cardiac" into a quiz?' });
}

describe("TurnFolderIntoQuizButton", () => {
  it("says what will happen and what stays, and changes nothing until confirmed", async () => {
    const action = vi.fn<Turn>();
    draw(action);
    const dialog = await open();
    expect(dialog).toHaveAccessibleDescription(
      'A new quiz, "Cardiac (2)", goes beside this one in the library with everything in this folder and the folders inside it. The new quiz has no folders inside it.',
    );
    expect(
      within(dialog).getByRole("list", { name: "What stays with this quiz" }),
    ).toHaveTextContent(KEPT[0]!);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("leaves out the folders inside it when there are none", async () => {
    draw(vi.fn<Turn>(), false);
    expect(await open()).toHaveAccessibleDescription(
      'A new quiz, "Cardiac (2)", goes beside this one in the library with everything in this folder. The new quiz has no folders inside it.',
    );
  });

  it("keeps the dialog open with the reason when it is refused", async () => {
    const action = vi.fn<Turn>(async () => ({
      ok: false,
      message: "Turning a folder into a quiz is not ready yet. Try again later.",
    }));
    draw(action);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn into a quiz" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText(/not ready yet/)).toBeVisible();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says something went wrong when the action throws", async () => {
    draw(
      vi.fn<Turn>(async () => {
        throw new Error("network");
      }),
    );
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn into a quiz" }));
    expect(await within(dialog).findByText("That did not work. Try again.")).toBeVisible();
  });
});
