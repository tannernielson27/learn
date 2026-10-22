import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemReveal, LiveSessionState, ParticipantItem } from "@/lib/live";
import { NO_TIMER } from "@/lib/live";
import type { RoomConnection, StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { StudentRoom } from "./StudentRoom";

/**
 * The phone's named states (PLAN §5.6) that `StudentRoom.test.tsx` does not already walk: the
 * header on a question, refused, and the end of the session with what this phone saw.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const MC = itemSchema.parse({ ...FIXTURES.multiple_choice.canonical, cjmmStep: 4 });
const KEYLESS = toKeylessItem(MC) as ParticipantItem;
const NOW = 1_800_000_000_000;

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 5,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

const reveal = (points: number | null): ItemReveal => ({
  itemId: MC.id,
  position: 1,
  reveal: { answerKey: MC.answerKey, rationale: MC.rationale, scoring: MC.scoring },
  score: points === null ? null : { points, maxPoints: 1, model: "zero_one", breakdown: [] },
});

function setup(initial: LiveSessionState) {
  let push: (view: StudentView) => void = () => {};
  let connection: (status: RoomConnection, rejoined: boolean) => void = () => {};
  const transport = {
    resume: async () => ({ state: initial, item: null, answered: null, revealed: null }),
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
    submit: async () => ({ itemId: MC.id, submittedAt: NOW }),
    serverNow: () => NOW,
  } as unknown as SupabaseParticipant;
  const view = render(
    <StudentRoom
      sessionId="00000000-0000-4000-8000-00000000b001"
      title="Cardiac basics"
      displayName="Ana Reyes"
      participantId="00000000-0000-4000-8000-00000000b002"
      joinedAt={1000}
      initial={initial}
      channel={{ token: "channel-token", expiresAt: 0 }}
      connect={() => transport}
    />,
  );
  return {
    unmount: () => view.unmount(),
    push: (view: Partial<StudentView>) =>
      act(() => push({ state: initial, item: null, answered: null, revealed: null, ...view })),
    connection: (status: RoomConnection) => act(() => connection(status, false)),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the phone's header on a question", () => {
  it("says where the session is and that the phone can hear it, with the clock under it", async () => {
    const room = setup(state());
    room.push({
      state: state({ timer: { seconds: 30, endsAt: NOW + 8_000, remainingMs: null } }),
      item: KEYLESS,
    });
    await renderersLoaded();
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("Question 1 of 5");
    // Said once: the header carries the place, and the question below does not repeat it.
    expect(screen.getAllByText(/Question 1 of 5/)).toHaveLength(1);
    expect(within(header).getByText("Connected")).toBeInTheDocument();
    expect(within(header).getByRole("timer")).toHaveTextContent("0:08");
    expect(within(header).getByText("10 seconds left")).toBeInTheDocument();
  });

  it("names the session in the header between questions", () => {
    setup(state({ status: "lobby", position: null }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cardiac basics");
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  });

  it("says the answer is showing in a badge, and when the next question comes", async () => {
    const room = setup(state());
    room.push({ state: state({ reveal: true }), item: KEYLESS, revealed: reveal(null) });
    await renderersLoaded();
    expect(within(screen.getByRole("banner")).getByText("Answer showing")).toBeInTheDocument();
    expect(
      screen.getByText("The next question appears when your teacher moves on."),
    ).toBeInTheDocument();
  });
});

describe("refused", () => {
  it("says this phone is no longer in the session, with one way on", () => {
    const room = setup(state());
    room.connection("refused");
    expect(
      screen.getByRole("heading", { name: "You are no longer in this live session." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join a live session" })).toHaveAttribute(
      "href",
      "/join",
    );
    expect(screen.queryByText("Reconnecting")).toBeNull();
  });
});

describe("the end of the session on a phone", () => {
  it("counts what this phone answered and lists what is worth another look", async () => {
    const room = setup(state());
    room.push({ item: KEYLESS });
    room.push({
      state: state({ reveal: true }),
      item: KEYLESS,
      answered: { itemId: MC.id, submittedAt: NOW, response: { type: "multiple_choice" } },
      revealed: reveal(0),
    });
    await renderersLoaded();
    room.push({ state: state({ status: "ended" }), item: null });

    expect(screen.getByText("This live session has ended.")).toBeInTheDocument();
    expect(screen.getByText("answered").parentElement).toHaveTextContent("1/5");
    expect(screen.getByText("all correct").parentElement).toHaveTextContent("0/1");
    const worth = screen.getByRole("region", { name: "Worth another look" });
    expect(worth).toHaveTextContent("Question 1 · Generate Solutions");
    expect(worth).toHaveTextContent("Not correct");
    expect(screen.getByText("Your teacher has the full report.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join another live session" })).toHaveAttribute(
      "href",
      "/join",
    );
  });

  it("keeps what it saw across a reload of the page", async () => {
    const first = setup(state());
    first.push({
      state: state({ reveal: true }),
      item: KEYLESS,
      revealed: reveal(null),
    });
    await renderersLoaded();
    first.unmount();

    const again = setup(state({ status: "ended" }));
    again.push({ state: state({ status: "ended" }), item: null });
    expect(screen.getByRole("region", { name: "Worth another look" })).toHaveTextContent(
      "Not answered",
    );
  });

  it("says only that it has ended when this phone saw nothing to count", () => {
    setup(state({ status: "ended" }));
    expect(screen.getByText("This live session has ended.")).toBeInTheDocument();
    expect(screen.queryByText("Worth another look")).toBeNull();
    expect(screen.queryByText("answered")).toBeNull();
  });
});
