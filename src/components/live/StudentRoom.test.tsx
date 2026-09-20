import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LiveSessionState, Participant } from "@/lib/live";
import type { ParticipantRoom, RoomConnection } from "@/lib/liveSupabase";
import { StudentRoom, type RoomHandlers } from "./StudentRoom";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "lobby",
  position: null,
  itemCount: 12,
  reveal: false,
  ...over,
});

function setup(initial: LiveSessionState = state()) {
  refresh.mockClear();
  let handlers: RoomHandlers | null = null;
  const leave = vi.fn(async () => {});
  const connect = (given: RoomHandlers): ParticipantRoom => {
    handlers = given;
    return { leave };
  };

  const view = render(
    <StudentRoom
      sessionId="00000000-0000-4000-8000-0000000132aa"
      title="Cardiac basics"
      displayName="Sam Okafor"
      participantId="p-1"
      joinedAt={1000}
      initial={initial}
      connect={connect}
    />,
  );

  // Set synchronously by `connect` during the first render, so it is never null by the time a
  // test reaches for it. Asserted rather than checked so a miswired test fails loudly.
  const held = () => handlers as RoomHandlers;
  return {
    view,
    leave,
    push: (next: LiveSessionState) => act(() => held().onState(next)),
    roster: (people: Participant[]) => act(() => held().onRoster(people)),
    connection: (status: RoomConnection, rejoined = false) =>
      act(() => held().onConnection(status, rejoined)),
  };
}

describe("StudentRoom", () => {
  it("says who this phone joined as, and what the room is called", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cardiac basics");
    expect(screen.getByText(/Joined as/)).toHaveTextContent("Sam Okafor");
  });

  it("waits in the lobby with the sentence every other screen uses", () => {
    setup();
    expect(screen.getByText("You are in.")).toBeInTheDocument();
    expect(screen.getByText(/your instructor starts the session/)).toBeInTheDocument();
  });

  it("moves to the item the host went to, with no reload", async () => {
    const room = setup();
    room.push(state({ status: "running", position: 1 }));
    expect(await screen.findByText("Item 1 of 12")).toBeInTheDocument();
    expect(screen.getByText("The session is under way.")).toBeInTheDocument();

    room.push(state({ status: "running", position: 2 }));
    await waitFor(() => expect(screen.getByText("Item 2 of 12")).toBeInTheDocument());
  });

  it("says when the answer is showing at the front", () => {
    const room = setup();
    room.push(state({ status: "running", position: 2, reveal: true }));
    expect(screen.getByText("The answer is showing.")).toBeInTheDocument();
  });

  it("says when the room is paused, without losing the place", () => {
    const room = setup();
    room.push(state({ status: "paused", position: 4 }));
    expect(screen.getByText("The session is paused.")).toBeInTheDocument();
    expect(screen.getByText("Item 4 of 12")).toBeInTheDocument();
  });

  it("says when the session has ended", () => {
    const room = setup();
    room.push(state({ status: "ended", position: 4 }));
    expect(screen.getByText("This session has ended.")).toBeInTheDocument();
  });

  it("counts the phones in the room", () => {
    const room = setup();
    room.roster([
      { participantId: "p-1", displayName: "Sam Okafor", joinedAt: 1000 },
      { participantId: "p-2", displayName: "Ada", joinedAt: 1001 },
    ]);
    expect(screen.getByTestId("room-count")).toHaveTextContent("2 in the room");
  });

  it("says so while the connection is down, and stops saying so when it is back", () => {
    const room = setup();
    room.connection("reconnecting");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
    room.connection("live", true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("re-reads the room from the server when the socket comes back, and not on the first join", () => {
    const room = setup();
    room.connection("live", false);
    expect(refresh).not.toHaveBeenCalled();
    room.connection("reconnecting");
    room.connection("live", true);
    // Realtime replays nothing, so a phone that slept through a move has to ask again.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the room when the page goes away", () => {
    const room = setup();
    room.view.unmount();
    expect(room.leave).toHaveBeenCalled();
  });
});
