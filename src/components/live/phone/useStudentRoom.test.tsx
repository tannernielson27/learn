import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LiveSessionError,
  NO_TIMER,
  type LiveSessionState,
  type ParticipantItem,
} from "@/lib/live";
import type { RoomConnection, StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import type { AnyResponse } from "@/lib/ngn/schemas";
import { REJOIN_REFRESH_SPREAD_MS, useStudentRoom } from "./useStudentRoom";

/**
 * The hook's own part of surviving a campus network (#407 follow-up): when it asks for the page
 * again, when it asks the transport to read the room, and what a send that timed out leaves on
 * the screen. What the screen draws from all this is `StudentRoom.test.tsx`'s.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const LOBBY: LiveSessionState = {
  status: "lobby",
  position: null,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
};
const RUNNING: LiveSessionState = { ...LOBBY, status: "running", position: 1 };
const ITEM = { id: "item-1", type: "multiple_choice" } as unknown as ParticipantItem;
const ANSWER: AnyResponse = { type: "multiple_choice", optionId: "a" };

function fakeTransport(submit: () => Promise<{ itemId: string; submittedAt: number }>) {
  const views = new Set<(view: StudentView) => void>();
  const connections = new Set<(status: RoomConnection, rejoined: boolean) => void>();
  const wake = vi.fn();
  const transport = {
    resume: vi.fn(async () => ({ state: LOBBY, item: null, answered: null, revealed: null })),
    leave: vi.fn(async () => {}),
    onStudentView: (listener: (view: StudentView) => void) => {
      views.add(listener);
      return () => views.delete(listener);
    },
    onCount: () => () => {},
    onConnection: (listener: (status: RoomConnection, rejoined: boolean) => void) => {
      connections.add(listener);
      return () => connections.delete(listener);
    },
    submit: vi.fn(submit),
    serverNow: () => Date.now(),
    wake,
  } as unknown as SupabaseParticipant;
  return {
    transport,
    wake,
    push: (view: Partial<StudentView>) =>
      act(() => {
        for (const listener of views) {
          listener({ state: LOBBY, item: null, answered: null, revealed: null, ...view });
        }
      }),
    connection: (status: RoomConnection, rejoined = false) =>
      act(() => {
        for (const listener of connections) listener(status, rejoined);
      }),
  };
}

function setup(submit = async () => ({ itemId: ITEM.id, submittedAt: 1_700_000_000_000 })) {
  refresh.mockClear();
  const room = fakeTransport(submit);
  // Made once: a new `connect` on every render would be a new connection on every render.
  const connect = () => room.transport;
  const hook = renderHook(() =>
    useStudentRoom({
      sessionId: "00000000-0000-4000-8000-0000000132aa",
      participantId: "00000000-0000-4000-8000-0000000132bb",
      displayName: "Sam Okafor",
      joinedAt: 1000,
      initial: LOBBY,
      channel: { token: "channel-token", expiresAt: 0 },
      connect,
    }),
  );
  return { ...room, hook };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("asking for the page again", () => {
  it("does not re-run the page when the socket rejoins: the transport has read the room already", async () => {
    // The page throws when the database is slow (#407), and its error screen unmounts the room
    // and drops the draft. A rejoin is not worth that: the transport re-reads the room over HTTP.
    vi.useFakeTimers();
    const room = setup();
    room.push({ state: RUNNING, item: ITEM });
    act(() => room.hook.result.current.setDraft(ITEM.id, ANSWER));
    room.connection("reconnecting");
    room.connection("live", true);
    room.connection("reconnecting");
    room.connection("live", true);
    await act(() => vi.advanceTimersByTimeAsync(REJOIN_REFRESH_SPREAD_MS * 10));
    expect(refresh).not.toHaveBeenCalled();
    expect(room.hook.result.current.draft).toEqual(ANSWER);
    expect(room.hook.result.current.connection).toBe("live");
  });

  it("asks at once when the server has finished with this phone", () => {
    const room = setup();
    room.connection("refused");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("coming back to the page", () => {
  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("reads the room when the page becomes visible, and not when it is hidden", () => {
    const room = setup();
    setVisibility("hidden");
    expect(room.wake).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(room.wake).toHaveBeenCalledTimes(1);
  });

  it("reads the room when the page is shown again from the back-forward cache", () => {
    const room = setup();
    window.dispatchEvent(new Event("pageshow"));
    expect(room.wake).toHaveBeenCalledTimes(1);
  });

  it("reads the room when the phone comes back online, spread like a rejoin", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const room = setup();
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    expect(room.wake).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(REJOIN_REFRESH_SPREAD_MS / 4));
    expect(room.wake).toHaveBeenCalledTimes(1);
  });

  it("stops listening once the page has gone", async () => {
    vi.useFakeTimers();
    const room = setup();
    window.dispatchEvent(new Event("online"));
    room.hook.unmount();
    setVisibility("visible");
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("online"));
    await act(() => vi.advanceTimersByTimeAsync(REJOIN_REFRESH_SPREAD_MS));
    expect(room.wake).not.toHaveBeenCalled();
  });
});

describe("an answer whose request timed out", () => {
  it("is a failure the student can retry, and a retry the server already has counts as sent", async () => {
    const timedOut = new DOMException("The operation timed out.", "TimeoutError");
    let tries = 0;
    const room = setup(async () => {
      tries += 1;
      if (tries === 1) throw timedOut;
      // The first one did land; the server says so.
      throw new LiveSessionError("already_answered");
    });
    room.push({ state: RUNNING, item: ITEM });

    // Rejected, so the screen shows its failure line and gives the Submit button back.
    await expect(act(() => room.hook.result.current.send(ANSWER))).rejects.toBe(timedOut);
    expect(room.hook.result.current.answered).toBeNull();

    // Sent again: `already_answered` means what the sent state means. The promise is left
    // unsettled on purpose, as for every send.
    void act(() => {
      void room.hook.result.current.send(ANSWER);
    });
    await vi.waitFor(() =>
      expect(room.hook.result.current.answered).toMatchObject({
        itemId: ITEM.id,
        response: ANSWER,
      }),
    );
  });
});
