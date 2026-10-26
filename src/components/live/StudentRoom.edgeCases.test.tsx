import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSessionState, ParticipantItem, SubmitAck } from "@/lib/live";
import { LiveSessionError, NO_TIMER } from "@/lib/live";
import type { RoomConnection, StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { LIVE_BUSY_LABEL } from "./liveSubmit";
import { StudentRoom } from "./StudentRoom";

/**
 * A live class's edge cases on one phone (the class of 2026-10-27): the teacher ending the session
 * in the middle of a question, an answer whose request dies on the way, and a phone that sleeps
 * through a move. Nothing here may leave a student on "Sending your answer" or on an error screen,
 * and a draft survives anything short of the room moving on.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical);
const KEYLESS = toKeylessItem(SATA) as ParticipantItem;
const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const MC_KEYLESS = toKeylessItem(MC) as ParticipantItem;
const ANSWER: AnyResponse = { type: "multiple_response", optionIds: ["opt_a"] };

const running = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

function setup() {
  let push: (view: StudentView) => void = () => {};
  let connection: (status: RoomConnection, rejoined: boolean) => void = () => {};
  const submit = vi.fn<(itemId: string, response: AnyResponse) => Promise<SubmitAck>>();
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
    wake: () => {},
    submit,
    serverNow: () => Date.now(),
  } as unknown as SupabaseParticipant;
  render(
    <StudentRoom
      sessionId="00000000-0000-4000-8000-00000000e001"
      title="Cardiac basics"
      displayName="Sam Okafor"
      participantId="00000000-0000-4000-8000-00000000e002"
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
    connection: (status: RoomConnection) => act(() => connection(status, false)),
  };
}

/** A promise the test settles by hand, for a request still in the air. */
function held<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const submitButton = () => screen.getByRole("button", { name: /^Submit$/ });
const box = () => screen.getByRole("checkbox", { name: /Respiratory rate 28/ });
const busy = () => screen.queryByRole("button", { name: LIVE_BUSY_LABEL });

async function onTheQuestion() {
  const room = setup();
  room.push({ state: running(), item: KEYLESS });
  await renderersLoaded();
  return room;
}

beforeEach(() => {
  window.sessionStorage.clear();
  refresh.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StudentRoom: the same member joins again on a second device (case 1)", () => {
  it("leaves the first device answerable, not stuck, when its token was replaced, then hands it to the server", async () => {
    const room = await onTheQuestion();
    // The laptop's join replaced the phone's secret: the submit route no longer knows this phone.
    room.submit.mockRejectedValueOnce(new LiveSessionError("not_joined"));
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));
    expect(screen.getByText("You have not joined this live session.")).toBeInTheDocument();
    expect(busy()).toBeNull();
    expect(box()).toBeChecked();

    // The next read of the room is refused (401) and the phone asks the server where it belongs.
    room.connection("refused");
    expect(screen.getByText(/no longer in this live session/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("StudentRoom: the teacher ends the session mid-question (case 3)", () => {
  it("moves a phone with a draft and a running clock to the ended screen", async () => {
    const room = await onTheQuestion();
    room.push({
      state: running({ timer: { seconds: 30, endsAt: Date.now() + 20_000, remainingMs: null } }),
      item: KEYLESS,
    });
    fireEvent.click(box());

    room.push({ state: running({ status: "ended" }), item: KEYLESS });
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("ends on the ended screen, not Sending, when the end lands while an answer is in the air and the server refuses it", async () => {
    const room = await onTheQuestion();
    const request = held<SubmitAck>();
    room.submit.mockReturnValueOnce(request.promise);
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));
    expect(busy()).not.toBeNull();

    room.push({ state: running({ status: "ended" }), item: KEYLESS });
    await act(async () => request.reject(new LiveSessionError("not_open")));
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
    expect(busy()).toBeNull();
  });

  it("says the session has ended under the question when the refusal lands before the end does", async () => {
    const room = await onTheQuestion();
    room.submit.mockRejectedValueOnce(new LiveSessionError("not_open"));
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));
    expect(screen.getByText("This live session has ended.")).toBeInTheDocument();
    expect(busy()).toBeNull();

    room.push({ state: running({ status: "ended" }), item: KEYLESS });
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
  });

  it("ends on the ended screen when an accepted answer's acknowledgement lands after the end", async () => {
    const room = await onTheQuestion();
    const request = held<SubmitAck>();
    room.submit.mockReturnValueOnce(request.promise);
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));

    room.push({ state: running({ status: "ended" }), item: KEYLESS });
    await act(async () => request.resolve({ itemId: SATA.id, submittedAt: Date.now() }));
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
    expect(busy()).toBeNull();
  });

  it("shows the ended screen, not the refused one, when the channel is refused after the end", async () => {
    const room = await onTheQuestion();
    room.push({ state: running({ status: "ended" }), item: KEYLESS });
    room.connection("refused");
    expect(screen.getByText("Live session ended")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("StudentRoom: the network drops during submit (case 4)", () => {
  it("offers Submit again, draft kept, when the request fails before anything is stored", async () => {
    const room = await onTheQuestion();
    room.submit.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));

    expect(screen.getByText("Your answer was not sent. Try again.")).toBeInTheDocument();
    expect(box()).toBeChecked();
    expect(submitButton()).toBeEnabled();

    room.submit.mockResolvedValueOnce({ itemId: SATA.id, submittedAt: Date.now() });
    await act(async () => fireEvent.click(submitButton()));
    expect(room.submit).toHaveBeenCalledTimes(2);
    expect(room.submit).toHaveBeenLastCalledWith(SATA.id, ANSWER);
    expect(screen.getByTestId("answer-sent")).toHaveTextContent("Answer sent");
  });

  it("treats a retry of an answer the server stored before the drop as sent", async () => {
    const room = await onTheQuestion();
    // The first request timed out after the server had written it (the abort is all the phone saw).
    room.submit.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));
    expect(screen.getByText("Your answer was not sent. Try again.")).toBeInTheDocument();

    room.submit.mockRejectedValueOnce(new LiveSessionError("already_answered"));
    await act(async () => fireEvent.click(submitButton()));
    expect(screen.getByTestId("answer-sent")).toHaveTextContent("Answer sent");
    expect(busy()).toBeNull();
  });

  it("shows an answer stored before the drop as sent when the next read of the room carries it", async () => {
    const room = await onTheQuestion();
    room.submit.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(box());
    room.connection("reconnecting");
    await act(async () => fireEvent.click(submitButton()));
    expect(screen.getByText("Your answer was not sent. Try again.")).toBeInTheDocument();

    // Back online: the transport re-reads the room, and the server says the answer is there.
    room.push({
      state: running(),
      item: KEYLESS,
      answered: { itemId: SATA.id, submittedAt: Date.now(), response: ANSWER },
    });
    expect(screen.getByTestId("answer-sent")).toHaveTextContent("Answer sent");
    expect(screen.queryByTestId("reconnecting")).toBeNull();
  });

  it("keeps the draft through a reconnect that brings the same question back", async () => {
    const room = await onTheQuestion();
    fireEvent.click(box());
    room.connection("reconnecting");
    room.push({ state: running(), item: KEYLESS });
    expect(box()).toBeChecked();
    expect(submitButton()).toBeEnabled();
  });

  it("wakes from sleep on the new question, without the old draft or a stuck Sending", async () => {
    const room = await onTheQuestion();
    const request = held<SubmitAck>();
    room.submit.mockReturnValueOnce(request.promise);
    fireEvent.click(box());
    await act(async () => fireEvent.click(submitButton()));

    // Asleep: the request dies with the radio, and the room moves on before the phone wakes.
    room.push({ state: running({ position: 2 }), item: MC_KEYLESS });
    await act(async () => request.reject(new TypeError("Failed to fetch")));
    await renderersLoaded();

    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Respiratory rate 28/ })).toBeNull();
    expect(busy()).toBeNull();
    expect(screen.queryByText("Your answer was not sent. Try again.")).toBeNull();
    expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
  });
});
