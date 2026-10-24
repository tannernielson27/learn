import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSessionState, ParticipantItem, SubmitAck } from "@/lib/live";
import { NO_TIMER } from "@/lib/live";
import { SUBMIT_GRACE_MS } from "@/lib/live/timer";
import type { RoomConnection, StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { StudentRoom } from "./StudentRoom";

/**
 * The end of a timed question on a phone, and a Wi-Fi blip in the middle of one: when Submit is
 * there, when it is not, and what the phone says instead. Submit closes on the clock the server
 * refuses on (`timeIsUp`: the session's time, past `endsAt` and the grace), never on this phone's.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical);
const KEYLESS = toKeylessItem(SATA) as ParticipantItem;
/** The session's clock is two minutes ahead of this phone's, as in StudentRoom.test.tsx. */
const SKEW = 120_000;
const CLOSED = "Time is up. Wait for the answer.";

const running = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

/** A question whose time runs out `left` ms from now on the session's clock. */
const timedFor = (left: number): LiveSessionState =>
  running({ timer: { seconds: 30, endsAt: Date.now() + SKEW + left, remainingMs: null } });

function setup() {
  let push: (view: StudentView) => void = () => {};
  let connection: (status: RoomConnection, rejoined: boolean) => void = () => {};
  const submit = vi.fn<(itemId: string, response: AnyResponse) => Promise<SubmitAck>>(
    async (itemId) => ({
      itemId,
      submittedAt: Date.now() + SKEW,
    }),
  );
  const transport = {
    resume: async () => ({ state: running(), item: null, answered: null, revealed: null }),
    leave: async () => {},
    onStudentView: (listener: typeof push) => {
      push = listener;
      return () => {};
    },
    onCount: () => () => {},
    onConnection: (listener: typeof connection) => {
      connection = listener;
      return () => {};
    },
    submit,
    serverNow: () => Date.now() + SKEW,
  } as unknown as SupabaseParticipant;
  render(
    <StudentRoom
      sessionId="00000000-0000-4000-8000-00000000c001"
      title="Cardiac basics"
      displayName="Sam Okafor"
      participantId="00000000-0000-4000-8000-00000000c002"
      joinedAt={1000}
      initial={running()}
      channel={{ token: "channel-token", expiresAt: 0 }}
      connect={() => transport}
    />,
  );
  return {
    submit,
    push: (view: Partial<StudentView>) =>
      act(() => push({ state: running(), item: null, answered: null, revealed: null, ...view })),
    connection: (status: RoomConnection, rejoined = false) =>
      act(() => connection(status, rejoined)),
  };
}

const submitButton = () => screen.getByRole("button", { name: /^Submit$/ });
const box = () => screen.getByRole("checkbox", { name: /Respiratory rate 28/ });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/**
 * Clicks under fake timers go through `fireEvent`: user-event waits on real ones.
 *
 * The renderer loads with real timers (a dynamic import), then the clock is handed to the test.
 * Each test pushes its timed state after this, so the room's own timeout is a fake one.
 */
async function onTheQuestion() {
  const room = setup();
  room.push({ state: running(), item: KEYLESS });
  await renderersLoaded();
  vi.useFakeTimers({ now: Date.now() });
  return room;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StudentRoom: the end of a timed question", () => {
  it("keeps Submit through the grace after zero, then puts up Time is up with the draft read-only", async () => {
    const room = await onTheQuestion();
    room.push({ state: timedFor(5_000), item: KEYLESS });
    fireEvent.click(box());

    // Zero, and most of the grace: the server would still take it, so Submit stays.
    advance(5_000 + SUBMIT_GRACE_MS - 200);
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByText(CLOSED)).toBeNull();

    // Past the grace: the server would refuse it, so the phone says so before anyone presses.
    advance(400);
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAccessibleDescription(CLOSED);
    expect(screen.getAllByRole("button", { name: /^Submit$/ })).toHaveLength(1);
    // What the student had chosen is still on the screen, and can no longer be changed.
    expect(box()).toBeChecked();
    expect(box()).toBeDisabled();
    expect(room.submit).not.toHaveBeenCalled();
  });

  it("sends an answer pressed inside the grace window", async () => {
    const room = await onTheQuestion();
    room.push({ state: timedFor(2_000), item: KEYLESS });
    fireEvent.click(box());
    advance(2_000 + SUBMIT_GRACE_MS / 2);

    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(room.submit).toHaveBeenCalledWith(SATA.id, {
      type: "multiple_response",
      optionIds: ["opt_a"],
    });
  });

  it("leaves a phone that already sent on Answer sent", async () => {
    const room = await onTheQuestion();
    const state = timedFor(1_000);
    room.push({
      state,
      item: KEYLESS,
      answered: {
        itemId: SATA.id,
        submittedAt: Date.now() + SKEW,
        response: { type: "multiple_response", optionIds: ["opt_a"] },
      },
    });
    advance(1_000 + SUBMIT_GRACE_MS + 500);
    room.push({
      state,
      item: KEYLESS,
      answered: {
        itemId: SATA.id,
        submittedAt: Date.now() + SKEW,
        response: { type: "multiple_response", optionIds: ["opt_a"] },
      },
    });
    expect(screen.getByTestId("answer-sent")).toBeInTheDocument();
    expect(screen.queryByText(CLOSED)).toBeNull();
  });

  it("opens Submit again, draft and all, when the teacher adds time", async () => {
    const room = await onTheQuestion();
    room.push({ state: timedFor(1_000), item: KEYLESS });
    fireEvent.click(box());
    advance(1_000 + SUBMIT_GRACE_MS + 100);
    expect(screen.getByText(CLOSED)).toBeInTheDocument();

    room.push({ state: timedFor(15_000), item: KEYLESS });
    await act(async () => {});
    expect(screen.queryByText(CLOSED)).toBeNull();
    expect(submitButton()).toBeEnabled();
    expect(box()).toBeChecked();
  });

  it("never closes a question with no clock, or one held still by a pause", async () => {
    const room = await onTheQuestion();
    advance(10 * 60_000);
    expect(submitButton()).toBeEnabled();
    room.push({
      state: running({ status: "paused", timer: { seconds: 30, endsAt: null, remainingMs: 0 } }),
      item: KEYLESS,
    });
    expect(screen.queryByText(CLOSED)).toBeNull();
  });
});

describe("StudentRoom: Submit while reconnecting", () => {
  it("keeps Submit live under the banner, since sending an answer never needed the socket", async () => {
    const room = setup();
    room.push({ state: running(), item: KEYLESS });
    await renderersLoaded();
    const user = userEvent.setup();
    fireEvent.click(box());

    room.connection("reconnecting");
    expect(screen.getByTestId("reconnecting")).toBeInTheDocument();
    expect(box()).toBeChecked();
    expect(screen.getAllByRole("button", { name: /^Submit$/ })).toHaveLength(1);
    await user.click(submitButton());
    expect(room.submit).toHaveBeenCalledWith(SATA.id, {
      type: "multiple_response",
      optionIds: ["opt_a"],
    });
  });

  it("still closes Submit at the end of the time while reconnecting", async () => {
    const room = await onTheQuestion();
    room.push({ state: timedFor(1_000), item: KEYLESS });
    room.connection("reconnecting");
    advance(1_000 + SUBMIT_GRACE_MS + 100);
    expect(screen.getByTestId("reconnecting")).toBeInTheDocument();
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });
});
