import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog, type DialogSteps } from "./Dialog";

// jsdom has no `showModal` or `close`; vitest.setup.ts stands in for them and for Escape.

/** A page with an opener, the way a caller holds the dialog: `open` in state, cleared by onClose. */
function Harness({
  onClose = () => {},
  children,
  ...rest
}: {
  onClose?: () => void;
  children?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Archive class
      </button>
      <a href="#elsewhere">Elsewhere</a>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Archive this class?"
        {...rest}
      >
        {children}
      </Dialog>
    </>
  );
}

const openIt = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Archive class" }));
  return screen.getByRole("dialog");
};

afterEach(() => {
  document.documentElement.style.overflow = "";
});

describe("Dialog", () => {
  it("stays out of the way until it is opened", () => {
    render(<Harness>Body</Harness>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a modal, named by its title and described by its description", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Harness description="Students keep their results.">Body</Harness>);
    const dialog = await openIt();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleName("Archive this class?");
    expect(dialog).toHaveAccessibleDescription("Students keep their results.");
    expect(screen.getByRole("heading", { name: "Archive this class?" })).toBeVisible();
    showModal.mockRestore();
  });

  it("has no description when none is given", async () => {
    render(<Harness>Body</Harness>);
    expect(await openIt()).not.toHaveAttribute("aria-describedby");
  });

  it("moves focus into the dialog when it opens", async () => {
    render(<Harness>Body</Harness>);
    const dialog = await openIt();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("heading", { name: "Archive this class?" })).toHaveFocus();
  });

  it("closes from the close button and hands focus back to the opener", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose}>Body</Harness>);
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Archive class" })).toHaveFocus();
  });

  it("closes on Escape and hands focus back to the opener", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose}>Body</Harness>);
    await openIt();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Archive class" })).toHaveFocus();
  });

  it("leaves closing to the caller: Escape asks, it does not close by itself", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Saving">
        Body
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("tells the caller when the browser closes it, as a method=dialog form does", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose}>Body</Harness>);
    const dialog = (await openIt()) as HTMLDialogElement;
    act(() => dialog.close());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("can be walked by Tab: the close button and the caller's actions are all reachable", async () => {
    render(
      <Harness
        actions={
          <>
            <Button>Cancel</Button>
            <Button variant="primary">Archive</Button>
          </>
        }
      >
        Body
      </Harness>,
    );
    await openIt();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Archive" })).toHaveFocus();
    // Nothing in the dialog swallows Tab: focus is free to move on. In a browser the page behind
    // is inert, so the next stop is the browser's own chrome and then the dialog again.
    await userEvent.tab();
    expect(screen.getByRole("dialog")).not.toContainElement(document.activeElement as HTMLElement);
  });

  it("locks page scroll while open and puts back what was there", async () => {
    document.documentElement.style.overflow = "clip";
    render(<Harness>Body</Harness>);
    await openIt();
    expect(document.documentElement.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.documentElement.style.overflow).toBe("clip");
  });

  it("cleans up when it is unmounted while open, and says nothing more to the caller", () => {
    const onClose = vi.fn();
    function Page({ show }: { show: boolean }) {
      return (
        <>
          <button type="button">Opener</button>
          {show ? (
            <Dialog open onClose={onClose} title="Welcome">
              Body
            </Dialog>
          ) : null}
        </>
      );
    }
    const { rerender } = render(<Page show={false} />);
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();
    rerender(<Page show />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(document.documentElement.style.overflow).toBe("hidden");

    rerender(<Page show={false} />);
    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(opener).toHaveFocus();
    // The close this unmount caused is the component's own, not news for the caller.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens again after closing, and hands focus back each time", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose}>Body</Harness>);
    const opener = screen.getByRole("button", { name: "Archive class" });
    for (const round of [1, 2]) {
      await openIt();
      expect(screen.getByRole("heading", { name: "Archive this class?" })).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(opener).toHaveFocus();
      expect(onClose).toHaveBeenCalledTimes(round);
    }
  });

  it("survives StrictMode's doubled effects: one open dialog, one lock, no stray onClose", async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Harness onClose={onClose}>Body</Harness>
      </StrictMode>,
    );
    const dialog = await openIt();
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Archive this class?" })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Archive class" })).toHaveFocus();
  });

  it("asks once when the browser will not let Escape be prevented", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose}>Body</Harness>);
    const dialog = (await openIt()) as HTMLDialogElement;
    // Chromium's second Escape in a row: a cancel that cannot be prevented, then its own close.
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: false }));
      dialog.close();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("goes back up if the browser closes it and the caller keeps it open", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Saving">
        Body
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    act(() => dialog.close());
    expect(onClose).toHaveBeenCalledTimes(1);
    // `open` is still true, so the dialog must be too: modal, focused and holding the scroll lock.
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Saving" })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("keeps the page locked until the last of two stacked dialogs closes, in either order", () => {
    function Two({ first, second }: { first: boolean; second: boolean }) {
      return (
        <>
          <Dialog open={first} onClose={() => {}} title="First" />
          <Dialog open={second} onClose={() => {}} title="Second" />
        </>
      );
    }
    const { rerender } = render(<Two first second={false} />);
    rerender(<Two first second />);
    // The one that opened first closes first.
    rerender(<Two first={false} second />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    rerender(<Two first={false} second={false} />);
    expect(document.documentElement.style.overflow).toBe("");

    rerender(<Two first second={false} />);
    rerender(<Two first second />);
    rerender(<Two first second={false} />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    rerender(<Two first={false} second={false} />);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("has no footer and no step count when it is given neither actions nor steps", async () => {
    render(<Harness>Body</Harness>);
    const dialog = await openIt();
    expect(screen.queryByRole("status")).toBeNull();
    expect(dialog.querySelector("footer")).toBeNull();
    expect(screen.getAllByRole("button", { hidden: false })).toHaveLength(2); // opener and Close
  });
});

function steps(overrides: Partial<DialogSteps> = {}): DialogSteps {
  return {
    current: 2,
    total: 3,
    onNext: vi.fn(),
    onBack: vi.fn(),
    onFinish: vi.fn(),
    onSkip: vi.fn(),
    finishLabel: "Get started",
    ...overrides,
  };
}

describe("Dialog, stepped", () => {
  it("announces the step count and counts it in the description", () => {
    render(
      <Dialog open onClose={() => {}} title="Make a class" steps={steps()}>
        Body
      </Dialog>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
    expect(screen.getByRole("dialog", { name: "Make a class" })).toHaveAccessibleDescription(
      "Step 2 of 3",
    );
  });

  it("fires Next, Back and Skip, and nothing else", async () => {
    const s = steps();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Make a class" steps={s}>
        Body
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(s.onNext).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(s.onBack).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(s.onSkip).toHaveBeenCalledTimes(1);
    expect(s.onFinish).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has no Back on the first step", () => {
    render(
      <Dialog open onClose={() => {}} title="Welcome" steps={steps({ current: 1 })}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeVisible();
  });

  it("ends on the caller's own label, which finishes instead of going on", async () => {
    const s = steps({ current: 3 });
    render(
      <Dialog open onClose={() => {}} title="You are set" steps={s}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(s.onFinish).toHaveBeenCalledTimes(1);
    expect(s.onNext).not.toHaveBeenCalled();
  });

  it("offers no Skip when the caller gives it nothing to do", () => {
    render(
      <Dialog open onClose={() => {}} title="Welcome" steps={steps({ onSkip: undefined })}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("walks a three-step flow the way a welcome will, keeping focus inside throughout", async () => {
    const onFinish = vi.fn();
    function Welcome() {
      const [step, setStep] = useState(1);
      return (
        <Dialog
          open
          onClose={() => {}}
          title={`Welcome ${step}`}
          steps={{
            current: step,
            total: 3,
            onNext: () => setStep((n) => n + 1),
            onBack: () => setStep((n) => n - 1),
            onFinish,
            finishLabel: "Get started",
          }}
        >
          Step {step} content
        </Dialog>
      );
    }
    render(<Welcome />);
    const dialog = screen.getByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3");
    // The same button carries on being the way forward, so Enter can be pressed again.
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();

    // Back from step 2 lands on step 1, where there is no Back to keep the focus.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 3");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Welcome 3" })).toBeVisible();
    await userEvent.keyboard("{Enter}");
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
