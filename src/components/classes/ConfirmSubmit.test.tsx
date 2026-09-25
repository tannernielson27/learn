import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmSubmit, type ConfirmOutcome } from "./ConfirmSubmit";

const FAILED: ConfirmOutcome = { ok: false, message: "Could not replace the link. Try again." };

function setup(action = vi.fn(async (): Promise<ConfirmOutcome | void> => {})) {
  render(
    <ConfirmSubmit
      action={action}
      label="New link"
      confirmLabel="Replace the link"
      warning="The old link stops working."
    />,
  );
  return { action, user: userEvent.setup() };
}

async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "New link" }));
  await user.click(screen.getByRole("button", { name: "Replace the link" }));
}

describe("ConfirmSubmit", () => {
  it("asks before doing anything", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "New link" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("The old link stops working.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("does it once confirmed", async () => {
    const { action, user } = setup();
    await confirm(user);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("can be called off, returning focus to the first button", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "New link" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New link" })).toHaveFocus();
  });

  it("closes on success and puts focus back on the first button", async () => {
    const { user } = setup(vi.fn(async () => ({ ok: true as const })));
    await confirm(user);
    expect(await screen.findByRole("button", { name: "New link" })).toHaveFocus();
    expect(screen.queryByText("The old link stops working.")).not.toBeInTheDocument();
  });

  it("moves focus to a named element on success, for a row that goes away (#272)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <h2 id="roster-heading" tabIndex={-1}>
          Roster
        </h2>
        <ConfirmSubmit
          action={vi.fn(async () => ({ ok: true as const }))}
          label="Remove"
          confirmLabel="Remove from class"
          warning="They lose this class."
          focusOnSuccess="roster-heading"
        />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Remove from class" }));
    await screen.findByRole("button", { name: "Remove" });
    expect(screen.getByRole("heading", { name: "Roster" })).toHaveFocus();
  });

  it("keeps focus on the first button after a cancel, even with a success target", async () => {
    const user = userEvent.setup();
    render(
      <>
        <h2 id="roster-heading" tabIndex={-1}>
          Roster
        </h2>
        <ConfirmSubmit
          action={vi.fn(async () => ({ ok: true as const }))}
          label="Remove"
          confirmLabel="Remove from class"
          warning="They lose this class."
          focusOnSuccess="roster-heading"
        />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Remove" })).toHaveFocus();
  });

  it("still closes for an action that returns nothing", async () => {
    const { user } = setup();
    await confirm(user);
    expect(await screen.findByRole("button", { name: "New link" })).toHaveFocus();
  });

  it("keeps the dialog open on a failure, says why, and keeps focus on the confirm button", async () => {
    const { user } = setup(vi.fn(async () => FAILED));
    await confirm(user);
    const message = await screen.findByText(FAILED.message);
    expect(message.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("The old link stops working.")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Replace the link" });
    expect(retry).toHaveFocus();
    expect(retry).toHaveAccessibleDescription(FAILED.message);
  });

  it("keeps the live region in place before anything fails, so the message is announced", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "New link" }));
    const region = document.querySelector("[aria-live='polite']");
    expect(region).not.toBeNull();
    expect(region).toBeEmptyDOMElement();
  });

  it("can be retried from the keyboard, and succeeds the second time", async () => {
    const action = vi
      .fn<() => Promise<ConfirmOutcome>>()
      .mockResolvedValueOnce(FAILED)
      .mockResolvedValueOnce({ ok: true });
    const { user } = setup(action);
    await confirm(user);
    await screen.findByText(FAILED.message);
    await user.keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "New link" })).toHaveFocus();
    expect(screen.queryByText(FAILED.message)).not.toBeInTheDocument();
  });

  it("drops a second press while the first is in flight, and says it is busy", async () => {
    let finish: (outcome: ConfirmOutcome) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<ConfirmOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    const { user } = setup(action);
    await confirm(user);
    const button = screen.getByRole("button", { name: "Replace the link" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
    expect(await screen.findByRole("button", { name: "New link" })).toHaveFocus();
  });

  it("says something plain when the action throws instead of answering", async () => {
    const { user } = setup(vi.fn(async () => Promise.reject(new Error("socket hang up"))));
    await confirm(user);
    expect(await screen.findByText("That did not work. Try again.")).toBeInTheDocument();
    expect(screen.queryByText(/socket/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace the link" })).toHaveFocus();
  });

  it("forgets an old failure when asked again after Cancel", async () => {
    const { user } = setup(vi.fn(async () => FAILED));
    await confirm(user);
    await screen.findByText(FAILED.message);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "New link" }));
    expect(screen.queryByText(FAILED.message)).not.toBeInTheDocument();
  });
});
