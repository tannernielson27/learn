import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LiveSessionState, ParticipantItem, SubmitAck } from "@/lib/live";
import { LiveSessionError, NO_TIMER } from "@/lib/live";
import type { PacedItemPayload, StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { StudentPacedRoom } from "./StudentPacedRoom";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const FIRST = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const SECOND = itemSchema.parse(FIXTURES.multiple_choice.edge);
const CHANNEL = { token: "channel-token", expiresAt: 0 };
const PICK_A: AnyResponse = { type: "multiple_choice", optionId: "opt_a" };

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 2,
  reveal: false,
  timer: NO_TIMER,
  mode: "student_paced",
  ...over,
});

const keyless = (item: Item) => toKeylessItem(item) as ParticipantItem;

function entry(item: Item, position: number, over: Partial<PacedItemPayload> = {}) {
  return { position, item: keyless(item), answered: null, revealed: null, ...over };
}

const revealOf = (item: Item, position: number, points: number | null) => ({
  itemId: item.id,
  position,
  reveal: { answerKey: item.answerKey, rationale: item.rationale, scoring: item.scoring },
  score:
    points === null ? null : { points, maxPoints: 1, model: "zero_one" as const, breakdown: [] },
});

function fakeTransport(submit: (itemId: string, response: AnyResponse) => Promise<SubmitAck>) {
  const viewListeners = new Set<(view: StudentView) => void>();
  const transport = {
    resume: vi.fn(async () => ({ state: state(), item: null, answered: null, revealed: null })),
    join: vi.fn(),
    leave: vi.fn(async () => {}),
    onStudentView: (listener: (view: StudentView) => void) => {
      viewListeners.add(listener);
      return () => viewListeners.delete(listener);
    },
    onSessionState: () => () => {},
    onPresence: () => () => {},
    onReveal: () => () => {},
    onConnection: () => () => {},
    submit: vi.fn(submit),
    serverNow: () => Date.now(),
  } as unknown as SupabaseParticipant;
  return {
    transport,
    push: (view: Partial<StudentView>) =>
      act(() => {
        for (const listener of viewListeners) {
          listener({ state: state(), item: null, answered: null, revealed: null, ...view });
        }
      }),
  };
}

function setup(
  submit: (itemId: string, response: AnyResponse) => Promise<SubmitAck> = async (itemId) => ({
    itemId,
    submittedAt: 1_700_000_000_000,
  }),
) {
  const room = fakeTransport(submit);
  render(
    <StudentPacedRoom
      sessionId="00000000-0000-4000-8000-0000000185aa"
      title="Cardiac basics"
      displayName="Sam Okafor"
      participantId="00000000-0000-4000-8000-0000000185bb"
      joinedAt={1000}
      initial={state({ status: "lobby", position: null })}
      channel={CHANNEL}
      connect={() => room.transport}
    />,
  );
  return { ...room, user: userEvent.setup() };
}

const itemButton = (name: string) => screen.getByRole("button", { name });

describe("StudentPacedRoom (#185)", () => {
  it("waits in the lobby with the sentence every other screen uses", () => {
    setup();
    expect(screen.getByText("You are in.")).toBeInTheDocument();
  });

  it("lists every item, moves with Next and Previous, and answers any of them", async () => {
    const room = setup();
    room.push({ state: state(), paced: [entry(FIRST, 1), entry(SECOND, 2)] });
    await renderersLoaded();
    expect(itemButton("Item 1, not answered")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Previous item" })).toBeDisabled();

    // Straight to the second item, and answer it first.
    await room.user.click(screen.getByRole("button", { name: "Next item" }));
    expect(itemButton("Item 2, not answered")).toHaveAttribute("aria-current", "step");
    await room.user.click(screen.getByRole("radio", { name: /Diaphoresis and tremor/ }));
    await room.user.click(screen.getByRole("button", { name: /^Submit$/ }));
    expect(await screen.findByTestId("answer-sent")).toBeInTheDocument();
    expect(room.transport.submit).toHaveBeenCalledWith(SECOND.id, {
      type: "multiple_choice",
      optionId: "opt_b",
    });
    expect(itemButton("Item 2, answered")).toBeInTheDocument();
    expect(screen.getByTestId("paced-count")).toHaveTextContent("1 of 2 answered");

    // Back to the first, still open.
    await room.user.click(itemButton("Item 1, not answered"));
    expect(screen.getByRole("button", { name: /^Submit$/ })).toBeInTheDocument();
  });

  it("keeps a half-finished answer when moving away and back", async () => {
    const room = setup();
    room.push({ state: state(), paced: [entry(FIRST, 1), entry(SECOND, 2)] });
    await renderersLoaded();
    await room.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await room.user.click(screen.getByRole("button", { name: "Next item" }));
    await room.user.click(screen.getByRole("button", { name: "Previous item" }));
    expect(screen.getByRole("radio", { name: /Auscultate the lungs/ })).toBeChecked();
  });

  it("reads an item answered before a reload as answered, with no Submit", async () => {
    const room = setup();
    room.push({
      state: state(),
      paced: [
        entry(FIRST, 1, { answered: { itemId: FIRST.id, submittedAt: 1, response: PICK_A } }),
        entry(SECOND, 2),
      ],
    });
    await renderersLoaded();
    expect(screen.getByTestId("answer-sent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();
  });

  it("treats a second answer the server already has as sent, not as an error", async () => {
    const room = setup(async () => {
      throw new LiveSessionError("already_answered");
    });
    room.push({ state: state(), paced: [entry(FIRST, 1)] });
    await renderersLoaded();
    await room.user.click(screen.getByRole("radio", { name: /Auscultate the lungs/ }));
    await room.user.click(screen.getByRole("button", { name: /^Submit$/ }));
    expect(await screen.findByTestId("answer-sent")).toBeInTheDocument();
  });

  it("takes the set off the screen while paused, and says why", () => {
    const room = setup();
    room.push({ state: state({ status: "paused" }), paced: [entry(FIRST, 1)] });
    expect(screen.getByText("The session is paused.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Items" })).toBeNull();
    expect(screen.queryByText(/Item 1 of/)).toBeNull();
  });

  it("shows every item's key after Show answers, with marks where this phone answered", async () => {
    const room = setup();
    room.push({
      state: state({ reveal: true }),
      paced: [
        entry(FIRST, 1, {
          answered: { itemId: FIRST.id, submittedAt: 1, response: PICK_A },
          revealed: revealOf(FIRST, 1, 1),
        }),
        entry(SECOND, 2, { revealed: revealOf(SECOND, 2, null) }),
      ],
    });
    await renderersLoaded();
    expect(screen.getByTestId("paced-count")).toHaveTextContent(/answers are showing/);
    expect(screen.getByRole("complementary", { name: "Score" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull();

    await room.user.click(screen.getByRole("button", { name: "Next item" }));
    expect(screen.getByTestId("not-answered")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Answer key" })).toBeInTheDocument();
  });

  it("never renders a key before Show answers", async () => {
    const room = setup();
    room.push({ state: state(), paced: [entry(FIRST, 1), entry(SECOND, 2)] });
    await renderersLoaded();
    const nav = screen.getByRole("navigation", { name: "Items" });
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText(FIRST.rationale.general?.value ?? "")).toBeNull();
  });
});
