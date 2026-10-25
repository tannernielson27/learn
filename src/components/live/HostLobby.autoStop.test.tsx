import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveHostTransport, LiveSessionTransport } from "@/lib/live";
import { createInMemoryRoom } from "@/lib/live/memoryRoom";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { useHostRoom } from "./host/useHostRoom";
import { HostLobby } from "./HostLobby";

/**
 * Ending the timer once everyone has answered, through the in-memory room with a control window
 * and a projector window open on it together: only the control window sends `stop_timer`, it
 * sends it once, it never shows the answer, and it says so quietly.
 */

const SESSION_ID = "00000000-0000-4000-8000-00000000a003";
const CODE = "AJ4K7P";
const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const ANSWER = { type: "multiple_choice", optionId: "opt_a" } as const;
const KEY = "learn.live.autoStopTimer";

afterEach(() => {
  window.localStorage.clear();
});

function spied(host: LiveHostTransport) {
  const stopTimer = vi.fn(() => host.stopTimer());
  return { host: { ...host, stopTimer }, stopTimer };
}

function lobby(view: "control" | "projector", host: LiveHostTransport, initial: never) {
  return (
    <HostLobby
      sessionId={SESSION_ID}
      title="Cardiac basics"
      code={CODE}
      studentUrl={`https://learn.test/join/${CODE}`}
      qrCode={null}
      view={view}
      initial={initial}
      connect={() => host}
      tallyIntervalMs={20}
    />
  );
}

async function setup(windows: ("control" | "projector")[]) {
  // The session's clock is wall time here, so the settle window really passes.
  const room = createInMemoryRoom({
    items: [MC, SATA],
    code: CODE,
    sessionId: SESSION_ID,
    now: () => Date.now(),
  });
  const consoles = windows.map((view) => ({ view, ...spied(room.host()) }));
  for (const { view, host } of consoles) {
    render(lobby(view, host, room.currentState() as never), {
      container: document.body.appendChild(document.createElement("div")),
    });
  }
  const control = room.host();
  await control.open();
  await control.setTimer(60);
  const phones: LiveSessionTransport[] = [];
  for (const name of ["Ada", "Grace"]) {
    const phone = room.participant();
    await act(async () => {
      await phone.join(CODE, { displayName: name });
    });
    phones.push(phone);
  }
  await act(async () => {
    await control.start();
  });
  return { room, consoles, phones };
}

describe("ending the timer once everyone has answered", () => {
  it("is sent once, by the control window only, and the answer stays hidden", async () => {
    const { room, consoles, phones } = await setup(["control", "projector"]);
    await waitFor(() => expect(room.currentState().timer.endsAt).not.toBeNull());

    await act(async () => {
      await phones[0]!.submit(MC.id, ANSWER);
    });
    // One of two: nothing happens however long it waits.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 1_800));
    });
    expect(room.currentState().timer.endsAt).not.toBeNull();

    await act(async () => {
      await phones[1]!.submit(MC.id, ANSWER);
    });
    await waitFor(() => expect(room.currentState().timer.endsAt).toBeNull(), { timeout: 4_000 });
    expect(await screen.findByText("Everyone answered. Timer ended.")).toBeInTheDocument();

    const [control, projector] = consoles;
    expect(control!.stopTimer).toHaveBeenCalledTimes(1);
    expect(projector!.stopTimer).not.toHaveBeenCalled();
    expect(room.currentState().reveal).toBe(false);
    expect(room.currentState().status).toBe("running");
    expect(screen.queryByRole("alert")).toBeNull();
  }, 10_000);

  it("two control windows: the stop lands once and neither shows an error", async () => {
    const { room, consoles, phones } = await setup(["control", "control"]);
    await waitFor(() => expect(room.currentState().timer.endsAt).not.toBeNull());
    for (const phone of phones) {
      await act(async () => {
        await phone.submit(MC.id, ANSWER);
      });
    }
    await waitFor(() => expect(room.currentState().timer.endsAt).toBeNull(), { timeout: 4_000 });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 300));
    });
    // Both windows settle on the same tick, so both may send; the one that lands second is
    // refused `no_timer`, which the next test shows is taken as done.
    const sends = consoles.reduce((n, { stopTimer }) => n + stopTimer.mock.calls.length, 0);
    expect(sends).toBeGreaterThanOrEqual(1);
    expect(sends).toBeLessThanOrEqual(2);
    expect(screen.queryByText(/did not go through/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  }, 10_000);

  it("a stop that finds the timer already stopped counts as done, with no error", async () => {
    const room = createInMemoryRoom({ items: [MC, SATA], code: CODE, sessionId: SESSION_ID });
    const other = room.host();
    await other.open();
    await other.setTimer(60);
    await other.start();
    const late = room.host();
    const connect = () => late;
    // Another window stops the timer first; this one's stop is then refused `no_timer`.
    const { result, unmount } = renderHook(() =>
      useHostRoom({
        sessionId: SESSION_ID,
        initial: room.currentState(),
        connect,
        tallyIntervalMs: 1_000,
      }),
    );
    await other.stopTimer();
    let stopped = false;
    await act(async () => {
      stopped = await result.current.stopQuietly();
    });
    expect(stopped).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBeNull();
    expect(room.currentState().timer.endsAt).toBeNull();
    unmount();
  });

  it("does nothing once the teacher turns the setting off, and remembers it on this device", async () => {
    const { room, phones } = await setup(["control"]);
    const user = userEvent.setup();
    const box = await screen.findByRole("checkbox", {
      name: "End the timer when everyone has answered",
    });
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(window.localStorage.getItem(KEY)).toBe("0");

    for (const phone of phones) {
      await act(async () => {
        await phone.submit(MC.id, ANSWER);
      });
    }
    await act(async () => {
      await new Promise((done) => setTimeout(done, 2_000));
    });
    expect(room.currentState().timer.endsAt).not.toBeNull();
    expect(within(document.body).queryByText("Everyone answered. Timer ended.")).toBeNull();
  }, 10_000);
});
