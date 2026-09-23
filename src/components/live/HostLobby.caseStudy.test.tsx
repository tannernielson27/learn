import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LiveSessionError,
  applyHostCommand,
  initialSessionState,
  type HostSnapshot,
  type LiveHostTransport,
  type LiveSessionState,
  type SessionView,
} from "@/lib/live";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, type Item } from "@/lib/ngn/schemas";
import { HostLobby } from "./HostLobby";

/**
 * The console running a case study (#184): each step is named with its position, in the words a
 * case study played alone uses. Kept apart from `HostLobby.test.tsx` so the two stay readable.
 */

const STEPS: readonly Item[] = caseStudySchema.parse(sampleCaseStudy).items;
const NOW = 1_800_000_000_000;

/** A host transport over the six steps, running the real reducer and sending the item with it. */
function caseStudyTransport(initial: LiveSessionState): LiveHostTransport {
  let held = initial;
  const views = new Set<(view: SessionView<Item>) => void>();
  const itemOf = (state: LiveSessionState) =>
    state.position === null ? null : (STEPS[state.position - 1] ?? null);
  const run = async (command: "start" | "advance" | "reveal"): Promise<LiveSessionState> => {
    const result = applyHostCommand(held, command, NOW);
    if (!result.ok) throw new LiveSessionError(result.refusal);
    held = result.state;
    for (const listener of [...views]) listener({ state: held, item: itemOf(held) });
    return held;
  };
  const refuse = async (): Promise<LiveSessionState> => {
    throw new LiveSessionError("not_open");
  };
  return {
    async open(): Promise<HostSnapshot> {
      return {
        sessionId: "00000000-0000-4000-8000-000000000184",
        code: "AJ4K7P",
        mode: "instructor_paced",
        roster: [],
        aggregate: null,
        state: held,
        item: itemOf(held),
      };
    },
    close: vi.fn(async () => {}),
    onSessionState: (listener) => {
      views.add(listener);
      return () => views.delete(listener);
    },
    onPresence: () => () => {},
    onAggregate: () => () => {},
    aggregate: async () => null,
    results: async () => null,
    start: () => run("start"),
    advance: () => run("advance"),
    reveal: () => run("reveal"),
    pause: refuse,
    resume: refuse,
    end: refuse,
    setTimer: refuse,
    extendTimer: refuse,
    stopTimer: refuse,
    serverNow: () => NOW,
  };
}

function setup(initial: LiveSessionState, caseStudy: boolean) {
  const transport = caseStudyTransport(initial);
  render(
    <HostLobby
      sessionId="00000000-0000-4000-8000-000000000184"
      title={sampleCaseStudy.title}
      code="AJ4K7P"
      studentUrl="https://learn.test/join/AJ4K7P"
      initial={initial}
      caseStudy={caseStudy}
      connect={() => transport}
      tallyIntervalMs={20}
    />,
  );
  return userEvent.setup();
}

describe("HostLobby running a case study (#184)", () => {
  it("names the CJMM step with the position, and moves with the room", async () => {
    const user = setup(initialSessionState(6), true);

    await user.click(screen.getByRole("button", { name: "Start session" }));
    expect(await screen.findByText(/Step 1 of 6: Recognize Cues/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: "Next item" }));
    expect(await screen.findByText(/Step 2 of 6: Analyze Cues/)).toBeInTheDocument();
    expect(screen.queryByText(/Item 2 of 6/)).toBeNull();
  });

  it("names the step the room is already on when the console opens", async () => {
    setup({ ...initialSessionState(6), status: "running", position: 4 }, true);
    expect(await screen.findByText(/Step 4 of 6: Generate Solutions/)).toBeInTheDocument();
  });

  it("keeps saying Item in a bank session, even for an item tagged with a step", async () => {
    setup({ ...initialSessionState(6), status: "running", position: 2 }, false);
    expect(await screen.findByText(/Item 2 of 6/)).toBeInTheDocument();
    expect(screen.queryByText(/Analyze Cues/)).toBeNull();
  });
});
