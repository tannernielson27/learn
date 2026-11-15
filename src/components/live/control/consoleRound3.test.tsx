import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostLobby } from "@/components/live/HostLobby";
import { TimerButtons } from "@/components/live/TimerControls";
import type { LiveHostTransport, LiveSessionState } from "@/lib/live";
import { createInMemoryRoom } from "@/lib/live/memoryRoom";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { CONSOLE_HEADING_CLASSES } from "./consoleHeading";

/**
 * Round 3 of #563 on the teacher's console: the timer buttons read as enabled, the answer count
 * says it once, one heading style, and connection trouble as a Notice.
 */

const SESSION_ID = "00000000-0000-4000-8000-00000000a563";
const CODE = "AJ4K7P";
const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;

function setup(wrap: (host: LiveHostTransport) => LiveHostTransport = (host) => host) {
  const room = createInMemoryRoom({ items: [MC, SATA], code: CODE, sessionId: SESSION_ID });
  const host = wrap(room.host());
  render(
    <HostLobby
      sessionId={SESSION_ID}
      title="Cardiac basics"
      code={CODE}
      studentUrl={`https://learn.test/join/${CODE}`}
      qrCode={null}
      initial={room.currentState()}
      connect={() => host}
      tallyIntervalMs={20}
    />,
  );
  return { room, user: userEvent.setup() };
}

const running = (timer: LiveSessionState["timer"]): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 2,
  reveal: false,
  timer,
});
const TIMED = running({ seconds: 60, endsAt: Date.now() + 30_000, remainingMs: null });
const UNTIMED = running({ seconds: null, endsAt: null, remainingMs: null });

const isDisabledLook = (button: HTMLElement) => button.matches(":disabled");

describe("TimerButtons", () => {
  it("are enabled secondary buttons on a timed question, with their names", () => {
    render(<TimerButtons state={TIMED} busy={false} onCommand={() => {}} />);
    for (const name of ["Add 15 seconds", "Stop timer"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled");
      // The secondary look: the field's 3:1 edge on the surface, not the disabled grey fill.
      expect(button.className).toContain("border-field-border");
      expect(isDisabledLook(button)).toBe(false);
    }
  });

  it("are disabled, in the disabled look, only on a question with no clock", () => {
    render(<TimerButtons state={UNTIMED} busy={false} onCommand={() => {}} />);
    expect(screen.getByRole("button", { name: "Add 15 seconds" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop timer" })).toBeDisabled();
  });

  it("stay enabled while another move is in flight, and take no second press", async () => {
    const onCommand = vi.fn();
    render(<TimerButtons state={TIMED} busy onCommand={onCommand} />);
    const add = screen.getByRole("button", { name: "Add 15 seconds" });
    expect(add).not.toBeDisabled();
    expect(add).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(add);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("shows which one is working, keeping its name", () => {
    render(<TimerButtons state={TIMED} busy pending="extend_timer" onCommand={() => {}} />);
    const add = screen.getByRole("button", { name: "Add 15 seconds" });
    expect(add).toHaveAttribute("aria-busy", "true");
    expect(add).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop timer" })).not.toHaveAttribute("aria-busy");
  });

  it("send the command when pressed", async () => {
    const onCommand = vi.fn();
    render(<TimerButtons state={TIMED} busy={false} onCommand={onCommand} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Stop timer" }));
    expect(onCommand).toHaveBeenCalledWith("stop_timer");
  });
});

describe("the console's answer card", () => {
  it("says how many answered once: no Answered heading above the count", async () => {
    const fake = setup();
    const phone = fake.room.participant();
    await act(async () => {
      await phone.join(CODE, { displayName: "Ada Brennan" });
    });
    await fake.user.click(screen.getByRole("button", { name: "Start" }));
    const card = await screen.findByRole("region", { name: "Answers and time" });
    await waitFor(() =>
      expect(within(card).getByTestId("answer-count")).toHaveTextContent("0 of 1 answered"),
    );
    expect(within(card).queryByRole("heading")).toBeNull();
    expect(card.textContent?.match(/answered/gi)).toHaveLength(1);
    // The bar keeps its own name for a screen reader.
    expect(within(card).getByRole("progressbar", { name: "Answered" })).toBeInTheDocument();
  });
});

describe("the console's section headings", () => {
  it("share one style in the lobby and on a question", async () => {
    const fake = setup();
    for (const name of ["Join code", "In this session"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toHaveClass(
        ...CONSOLE_HEADING_CLASSES.split(" "),
      );
    }
    await fake.user.click(screen.getByRole("button", { name: "Start" }));
    for (const name of ["Results", "Questions", "Not answered yet", "In this session"]) {
      const heading = await screen.findByRole("heading", { level: 2, name: new RegExp(name) });
      expect(heading).toHaveClass(...CONSOLE_HEADING_CLASSES.split(" "));
      expect(heading).not.toHaveClass("font-read");
    }
  });
});

describe("the console's connection notice", () => {
  it("is a status while the channel reconnects", async () => {
    const fake = setup();
    act(() => fake.room.setHostConnection("reconnecting"));
    const notice = await waitFor(() => {
      const found = document.querySelector("[data-notice]");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent("Reconnecting");
  });

  it("is one alert when the channel never came up, with no second alert under it", async () => {
    setup((host) => ({ ...host, open: () => Promise.reject(new Error("down")) }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Offline");
    expect(alert).toHaveTextContent("Live updates stopped. Reload to catch up.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("That did not go through")).toBeNull();
  });
});
