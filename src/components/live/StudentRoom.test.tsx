import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";
import type {
  ItemReveal,
  LiveSessionState,
  Participant,
  ParticipantItem,
  SubmitAck,
} from "@/lib/live";
import { LiveSessionError, NO_TIMER } from "@/lib/live";
import type {
  AnsweredPayload,
  RoomConnection,
  StudentView,
  SupabaseParticipant,
} from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { StudentRoom } from "./StudentRoom";
import { renderersLoaded } from "@/components/question/testing/renderers";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical);
const KEYLESS = toKeylessItem(SATA) as ParticipantItem;
/** Never presented: these tests inject the transport, so no Realtime client is built. */
const CHANNEL = { token: "channel-token", expiresAt: 0 };
const CORRECT: AnyResponse = {
  type: "multiple_response",
  optionIds: ["opt_a", "opt_b", "opt_d"],
};

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "lobby",
  position: null,
  itemCount: 12,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

/** How far the session's clock is ahead of this phone's in these tests: two minutes (#182). */
const SKEW = 120_000;

const running = (over: Partial<LiveSessionState> = {}) =>
  state({ status: "running", position: 1, itemCount: 3, ...over });

const answeredWith = (response: AnyResponse = CORRECT): AnsweredPayload => ({
  itemId: SATA.id,
  submittedAt: 1_700_000_000_000,
  response,
});

const revealFor = (score: ItemReveal["score"]): ItemReveal => ({
  itemId: SATA.id,
  position: 1,
  reveal: { answerKey: SATA.answerKey, rationale: SATA.rationale, scoring: SATA.scoring },
  score,
});

/** A participant transport a test drives, with no socket and no server behind it. */
function fakeTransport(submit: (itemId: string, response: AnyResponse) => Promise<SubmitAck>) {
  const viewListeners = new Set<(view: StudentView) => void>();
  const presenceListeners = new Set<(roster: Participant[]) => void>();
  const connectionListeners = new Set<(status: RoomConnection, rejoined: boolean) => void>();
  const leave = vi.fn(async () => {});

  const transport = {
    resume: vi.fn(async () => ({ state: state(), item: null, answered: null, revealed: null })),
    join: vi.fn(),
    leave,
    onStudentView: (listener: (view: StudentView) => void) => {
      viewListeners.add(listener);
      return () => viewListeners.delete(listener);
    },
    onSessionState: () => () => {},
    onPresence: (listener: (roster: Participant[]) => void) => {
      presenceListeners.add(listener);
      return () => presenceListeners.delete(listener);
    },
    onReveal: () => () => {},
    onConnection: (listener: (status: RoomConnection, rejoined: boolean) => void) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    submit: vi.fn(submit),
    // A phone whose own clock is two minutes slow: the transport has measured the difference.
    serverNow: () => Date.now() + SKEW,
  } as unknown as SupabaseParticipant;

  return {
    transport,
    leave,
    push: (view: Partial<StudentView>) =>
      act(() => {
        for (const listener of viewListeners) {
          listener({ state: state(), item: null, answered: null, revealed: null, ...view });
        }
      }),
    roster: (people: Participant[]) =>
      act(() => {
        for (const listener of presenceListeners) listener(people);
      }),
    connection: (status: RoomConnection, rejoined = false) =>
      act(() => {
        for (const listener of connectionListeners) listener(status, rejoined);
      }),
  };
}

function setup(
  initial: LiveSessionState = state(),
  submit: (itemId: string, response: AnyResponse) => Promise<SubmitAck> = async (itemId) => ({
    itemId,
    submittedAt: 1_700_000_000_000,
  }),
) {
  refresh.mockClear();
  const room = fakeTransport(submit);
  const view = render(
    <StudentRoom
      sessionId="00000000-0000-4000-8000-0000000132aa"
      title="Cardiac basics"
      displayName="Sam Okafor"
      participantId="00000000-0000-4000-8000-0000000132bb"
      joinedAt={1000}
      initial={initial}
      channel={CHANNEL}
      connect={() => room.transport}
    />,
  );
  return { ...room, view };
}

describe("StudentRoom: waiting", () => {
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

  it("says when the session has ended, and shows no item", () => {
    const room = setup();
    room.push({ state: state({ status: "ended", position: 4 }), item: KEYLESS });
    expect(screen.getByText("This session has ended.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Options" })).toBeNull();
  });

  it("says when the room is paused, without losing the place", () => {
    const room = setup();
    room.push({ state: state({ status: "paused", position: 4 }), item: null });
    expect(screen.getByText("The session is paused.")).toBeInTheDocument();
    expect(screen.getByText("Item 4 of 12")).toBeInTheDocument();
  });

  it("takes the item off the screen while the room is paused, because no answer is taken", () => {
    const room = setup();
    room.push({ state: running({ status: "paused" }), item: KEYLESS });
    // A Submit that `canSubmit` is certain to refuse is worse than a screen that says why.
    expect(screen.getByText("The session is paused.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
  });

  it("keeps a half-finished answer across a pause and a resume", async () => {
    const user = userEvent.setup();
    const room = setup();
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();
    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));

    // The host pauses to talk through something, then picks up where they left off.
    room.push({ state: running({ status: "paused" }), item: KEYLESS });
    room.push({ state: running(), item: KEYLESS });

    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).toBeChecked();
  });

  it("offers no Submit in the moment between the key going up and this phone fetching it", () => {
    const room = setup();
    // The state message travels on its own; the reveal behind it takes a request.
    room.push({ state: running({ reveal: true }), item: KEYLESS, revealed: null });
    expect(screen.getByText("The answer is showing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
  });

  it("counts the phones in the room while there is nothing to answer", () => {
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

  it("re-reads the page from the server when the socket comes back, and not on the first join", () => {
    const room = setup();
    room.connection("live", false);
    expect(refresh).not.toHaveBeenCalled();
    room.connection("reconnecting");
    room.connection("live", true);
    // Realtime replays nothing, so a phone that slept through a move has to ask again.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks the server what to show when it has finished with this phone, without saying reconnecting (#149)", () => {
    const room = setup();
    room.connection("reconnecting");
    room.connection("refused");
    // The server render decides: a participant who is gone is redirected to the join form, and an
    // ended session renders its ended screen. Nothing is coming back, so no "stay on this page".
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Reconnecting/)).toBeNull();
  });

  it("lands on the ended screen when the server's answer to a refusal is an ended session", () => {
    const room = setup();
    room.connection("refused");
    room.view.rerender(
      <StudentRoom
        sessionId="00000000-0000-4000-8000-0000000132aa"
        title="Cardiac basics"
        displayName="Sam Okafor"
        participantId="00000000-0000-4000-8000-0000000132bb"
        joinedAt={1000}
        initial={state({ status: "ended" })}
        channel={CHANNEL}
        connect={() => room.transport}
      />,
    );
    expect(screen.getByRole("heading", { name: "This session has ended." })).toBeInTheDocument();
    expect(screen.queryByText(/Reconnecting/)).toBeNull();
  });

  it("says so when the room could not be opened, and stops saying so when a view lands", async () => {
    const room = fakeTransport(async (itemId) => ({ itemId, submittedAt: 0 }));
    (room.transport.resume as unknown as Mock).mockRejectedValueOnce(
      new Error("the channel could not be opened"),
    );
    render(
      <StudentRoom
        sessionId="00000000-0000-4000-8000-0000000132aa"
        title="Cardiac basics"
        displayName="Sam Okafor"
        participantId="00000000-0000-4000-8000-0000000132bb"
        joinedAt={1000}
        initial={state()}
        channel={CHANNEL}
        connect={() => room.transport}
      />,
    );

    // Not an error: Realtime retries by itself and the transport asks again when it gets through.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reconnecting"));
    room.push({ state: running(), item: KEYLESS });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("leaves the room when the page goes away", () => {
    const room = setup();
    room.view.unmount();
    expect(room.leave).toHaveBeenCalled();
  });
});

describe("StudentRoom: answering the item", () => {
  it("renders the item the room is on, with no answer key anywhere in the markup", async () => {
    const room = setup();
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();

    expect(screen.getByRole("group", { name: "Options" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeInTheDocument();
    // The key, the rationale and the per-option rationale are not on this phone at all.
    expect(document.body.textContent).not.toContain("Tachypnea, hypoxemia");
    expect(document.body.textContent).not.toContain("89% on room air is hypoxemia");
  });

  it("sends the answer once, and moves to the sent state without a score", async () => {
    const user = userEvent.setup();
    const room = setup();
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();

    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));

    await waitFor(() => expect(screen.getByTestId("answer-sent")).toBeInTheDocument());
    expect(room.transport.submit).toHaveBeenCalledWith(SATA.id, {
      type: "multiple_response",
      optionIds: ["opt_a"],
    });
    // No Submit to press a second time, and no marks: the host has not revealed.
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Score" })).toBeNull();
  });

  it("takes a double submit the server refused as the answer already being in", async () => {
    const user = userEvent.setup();
    const room = setup(state(), async () => {
      throw new LiveSessionError("already_answered");
    });
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();

    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));

    // Not an error on the screen: it means what the sent state means.
    await waitFor(() => expect(screen.getByTestId("answer-sent")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets the student try again when the room refused the answer for another reason", async () => {
    const user = userEvent.setup();
    const room = setup(state(), async () => {
      throw new LiveSessionError("rate_limited");
    });
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();

    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByTestId("answer-sent")).toBeNull();
    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeInTheDocument();
  });

  it("comes back to the answer it sent when the page is opened again mid-item", async () => {
    const room = setup();
    // What `/api/live/view` tells a reloaded phone: the item, and what this phone already sent.
    room.push({ state: running(), item: KEYLESS, answered: answeredWith() });
    await renderersLoaded();

    expect(screen.getByTestId("answer-sent")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
  });

  it("does not put a sent state on the next item when the room moves while a submit is in flight", async () => {
    const user = userEvent.setup();
    let land: (ack: SubmitAck) => void = () => {};
    const inFlight = new Promise<SubmitAck>((resolve) => {
      land = resolve;
    });
    const room = setup(state(), async () => inFlight);
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();

    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));

    // The host advances before the acknowledgement comes back, and only then does it come back.
    const next = { ...KEYLESS, id: "mr_sample_2" } as ParticipantItem;
    room.push({ state: running({ position: 2 }), item: next, answered: null });
    await act(async () => {
      land({ itemId: SATA.id, submittedAt: 1_700_000_000_000 });
      await inFlight;
    });

    // The acknowledgement was for item one; item two is open for answering, not marked as sent,
    // and nothing is selected on it yet.
    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeInTheDocument();
    expect(screen.queryByTestId("answer-sent")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).not.toBeChecked();
  });

  it("opens a fresh item when the room moves on, rather than keeping the last answer", () => {
    const room = setup();
    room.push({ state: running(), item: KEYLESS, answered: answeredWith() });
    expect(screen.getByTestId("answer-sent")).toBeInTheDocument();

    const next = { ...KEYLESS, id: "mr_sample_2" } as ParticipantItem;
    room.push({ state: running({ position: 2 }), item: next, answered: null });
    expect(screen.queryByTestId("answer-sent")).toBeNull();
    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeInTheDocument();
  });
});

describe("StudentRoom: the reveal", () => {
  it("shows the key, the rationale and this phone's own marks", async () => {
    const room = setup();
    room.push({
      state: running({ reveal: true }),
      item: KEYLESS,
      answered: answeredWith(),
      revealed: revealFor({ points: 3, maxPoints: 3, model: "plus_minus", breakdown: [] }),
    });
    await renderersLoaded();

    expect(screen.getByRole("complementary", { name: "Score" })).toHaveTextContent("3");
    expect(screen.getByText(/Tachypnea, hypoxemia/)).toBeInTheDocument();
    // The answer this phone gave, marked against the key that has just arrived.
    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
  });

  it("shows a phone that did not answer the key and the rationale, read-only, and says so", async () => {
    const room = setup();
    room.push({
      state: running({ reveal: true }),
      item: KEYLESS,
      answered: null,
      revealed: revealFor(null),
    });
    await renderersLoaded();

    expect(screen.getByTestId("not-answered")).toHaveTextContent("You did not answer this item.");
    expect(screen.getByRole("complementary", { name: "Rationale" })).toHaveTextContent(
      /Tachypnea, hypoxemia/,
    );
    // The key on the same renderer: nothing chosen, the right options marked missed.
    expect(screen.getAllByText("Missed").length).toBeGreaterThan(0);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
    // No marks, because there was no answer, and nothing to send.
    expect(screen.queryByRole("complementary", { name: "Score" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
    expect(screen.queryByText("The answer is showing.")).toBeNull();
  });

  it("shows the same phone no key before the reveal: the control", async () => {
    const room = setup();
    room.push({ state: running(), item: KEYLESS, answered: null, revealed: null });
    await renderersLoaded();

    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeInTheDocument();
    expect(screen.queryByTestId("not-answered")).toBeNull();
    expect(screen.queryByText("Missed")).toBeNull();
    expect(document.body.textContent).not.toContain("Tachypnea, hypoxemia");
  });

  it("says the answer is showing in the moment before the key has been fetched", () => {
    const room = setup();
    room.push({ state: running({ reveal: true }), item: KEYLESS, answered: null, revealed: null });
    expect(screen.getByText("The answer is showing.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Tachypnea, hypoxemia");
  });
});

describe("StudentRoom: the item timer (#182)", () => {
  /** An item whose time runs out `left` ms from now on the session's clock. */
  const timedFor = (left: number, over: Partial<LiveSessionState> = {}) =>
    running({
      timer: { seconds: 30, endsAt: Date.now() + SKEW + left, remainingMs: null },
      ...over,
    });

  it("shows the right time left on a phone whose own clock is two minutes off", async () => {
    const room = setup();
    room.push({ state: timedFor(25_000), item: KEYLESS });
    // On the phone's own clock this would read 2:25. The session's clock says 0:25 — or 0:24 once
    // the test has taken a moment.
    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent(/^0:2[45]$/));
  });

  it("holds the clock still while the room is paused", () => {
    const room = setup();
    room.push({
      state: running({
        status: "paused",
        timer: { seconds: 30, endsAt: null, remainingMs: 12_000 },
      }),
      item: KEYLESS,
    });
    expect(screen.getByRole("timer")).toHaveTextContent("0:12");
    expect(screen.getByTestId("countdown-state")).toHaveTextContent("Paused");
  });

  it("takes the clock away once the answer is showing", () => {
    const room = setup();
    room.push({ state: timedFor(10_000, { reveal: true }), item: KEYLESS });
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("says Time is up when the server refused the answer as late, and offers no retry", async () => {
    const user = userEvent.setup();
    const room = setup(state(), async () => {
      throw new LiveSessionError("time_up");
    });
    room.push({ state: timedFor(0), item: KEYLESS });
    await renderersLoaded();

    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));

    await waitFor(() => expect(screen.getByTestId("answer-late")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Time is up" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
  });

  it("gives the item back, answer and all, when the host adds time", async () => {
    const user = userEvent.setup();
    const room = setup(state(), async () => {
      throw new LiveSessionError("time_up");
    });
    const first = timedFor(0);
    room.push({ state: first, item: KEYLESS });
    await renderersLoaded();
    await user.click(screen.getByRole("checkbox", { name: /Respiratory rate 28/ }));
    await user.click(screen.getByRole("button", { name: /^Submit$/ }));
    await waitFor(() => expect(screen.getByTestId("answer-late")).toBeInTheDocument());

    room.push({
      state: { ...first, timer: { ...first.timer, endsAt: Date.now() + SKEW + 15_000 } },
      item: KEYLESS,
    });
    await renderersLoaded();
    expect(screen.queryByTestId("answer-late")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Respiratory rate 28/ })).toBeChecked();
  });
});
