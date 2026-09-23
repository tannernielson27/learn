import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LiveSessionError,
  NO_TIMER,
  applyHostCommand,
  chooseTimer,
  type HostCommand,
  type HostSnapshot,
  type ItemAggregate,
  type LiveHostTransport,
  type LiveSessionState,
  type Participant,
  type SessionView,
  type TimerCommand,
} from "@/lib/live";
import { distributionFor, type Distribution } from "@/lib/live/results";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import type { Item } from "@/lib/ngn/schemas";
import { HostLobby } from "./HostLobby";

const SESSION_ID = "00000000-0000-4000-8000-0000000132aa";
const CODE = "AJ4K7P";

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "lobby",
  position: null,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

/** The session's clock in these tests (#182). */
const SERVER_NOW = 1_800_000_000_000;

const person = (id: string, name: string, joinedAt: number): Participant => ({
  participantId: id,
  displayName: name,
  joinedAt,
});

/**
 * A host transport a test drives by hand. It runs the same reducer the real adapter does, so a
 * command that the console should not have offered refuses here exactly as it would in a room.
 */
function fakeTransport(initial: LiveSessionState, refusal?: LiveSessionError) {
  let held = initial;
  let roster: Participant[] = [];
  let tally: ItemAggregate | null = null;
  let results: Distribution | null = null;
  let resultAsks = 0;
  const views = new Set<(view: SessionView<Item>) => void>();
  const presence = new Set<(roster: Participant[]) => void>();
  const ran: (HostCommand | TimerCommand | `set_timer:${string}`)[] = [];
  let asked = 0;
  let resolveOpen: (() => void) | null = null;
  const opened = new Promise<void>((resolve) => {
    resolveOpen = resolve;
  });

  const run = async (command: HostCommand | TimerCommand): Promise<LiveSessionState> => {
    ran.push(command);
    if (refusal) throw refusal;
    const result = applyHostCommand(held, command, SERVER_NOW);
    if (!result.ok) throw new LiveSessionError(result.refusal);
    held = result.state;
    for (const listener of [...views]) listener({ state: held, item: null });
    return held;
  };

  const transport: LiveHostTransport = {
    async open(): Promise<HostSnapshot> {
      await opened;
      return {
        sessionId: SESSION_ID,
        code: CODE,
        mode: "instructor_paced",
        roster,
        aggregate: null,
        state: held,
        item: null,
      };
    },
    close: vi.fn(async () => {}),
    onSessionState: (listener) => {
      views.add(listener);
      return () => views.delete(listener);
    },
    onPresence: (listener) => {
      presence.add(listener);
      return () => presence.delete(listener);
    },
    onAggregate: () => () => {},
    async aggregate(): Promise<ItemAggregate | null> {
      asked += 1;
      return tally;
    },
    async results(): Promise<Distribution | null> {
      resultAsks += 1;
      return results;
    },
    start: () => run("start"),
    advance: () => run("advance"),
    reveal: () => run("reveal"),
    pause: () => run("pause"),
    resume: () => run("resume"),
    end: () => run("end"),
    async setTimer(seconds) {
      ran.push(`set_timer:${String(seconds)}`);
      const result = chooseTimer(held, seconds);
      if (!result.ok) throw new LiveSessionError(result.refusal);
      held = result.state;
      return held;
    },
    extendTimer: () => run("extend_timer"),
    stopTimer: () => run("stop_timer"),
    serverNow: () => SERVER_NOW,
  };

  return {
    transport,
    ran,
    letOpen: () => resolveOpen?.(),
    asks: () => asked,
    resultAsks: () => resultAsks,
    /** What the next ask for the results will answer with. */
    resultsIn: (next: Distribution | null) => {
      results = next;
    },
    /** What the next ask for the tally will answer with. */
    answersIn: (next: ItemAggregate | null) => {
      tally = next;
    },
    sync: (people: Participant[]) => {
      roster = people;
      for (const listener of [...presence]) listener(people);
    },
  };
}

const tallyOf = (responded: number, present: number, position = 1): ItemAggregate => ({
  itemId: "mc_sample_1",
  position,
  present,
  responded,
  fullMarks: responded,
  partialMarks: 0,
  noMarks: 0,
  meanPoints: 1,
  maxPoints: 1,
});

function setup(initial: LiveSessionState = state(), refusal?: LiveSessionError) {
  const fake = fakeTransport(initial, refusal);
  render(
    <HostLobby
      sessionId={SESSION_ID}
      title="Cardiac basics"
      code={CODE}
      studentUrl={`https://learn.test/join/${CODE}`}
      initial={initial}
      connect={() => fake.transport}
      tallyIntervalMs={20}
    />,
  );
  fake.letOpen();
  return { ...fake, user: userEvent.setup() };
}

const button = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}$`) });

describe("HostLobby", () => {
  it("shows the code, the picture and the address a student types", () => {
    setup();
    expect(screen.getByTestId("join-code")).toHaveTextContent("AJ4 K7P");
    expect(screen.getByTestId("join-url")).toHaveTextContent(`https://learn.test/join/${CODE}`);
    expect(screen.getByRole("img", { name: /QR code/ })).toBeInTheDocument();
  });

  it("offers only the moves the room can make from the lobby", () => {
    setup();
    expect(button("Start session")).toBeEnabled();
    expect(button("End session")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Next item$/ })).toBeNull();
  });

  it("says the room is empty before anyone joins", () => {
    setup();
    expect(screen.getByText(/Nobody has joined yet\./)).toBeInTheDocument();
  });

  it("adds a name and counts the phones as people join, with no reload", async () => {
    const fake = setup();
    fake.sync([person("a", "Ava", 1)]);
    expect(await screen.findByText("Ava")).toBeInTheDocument();
    expect(screen.getByTestId("present-count")).toHaveTextContent("1 phone connected");

    fake.sync([person("a", "Ava", 1), person("b", "Ben", 2)]);
    await waitFor(() =>
      expect(screen.getByTestId("present-count")).toHaveTextContent("2 phones connected"),
    );
  });

  it("greys a phone out rather than dropping the name when it goes away", async () => {
    const fake = setup();
    fake.sync([person("a", "Ava", 1), person("b", "Ben", 2)]);
    expect(await screen.findByText("Ben")).toBeInTheDocument();

    fake.sync([person("a", "Ava", 1)]);
    await waitFor(() =>
      expect(screen.getByTestId("present-count")).toHaveTextContent("1 phone connected"),
    );
    // Still listed, and said in words rather than in colour alone.
    expect(screen.getByText("Ben")).toBeInTheDocument();
    expect(screen.getByText("Away")).toBeInTheDocument();
  });

  it("starts the room and then offers the moves a running room can make", async () => {
    const fake = setup();
    await fake.user.click(button("Start session"));
    expect(await screen.findByRole("button", { name: /^Next item$/ })).toBeEnabled();
    expect(fake.ran).toEqual(["start"]);
    expect(button("Show answer")).toBeEnabled();
    expect(button("Pause")).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Start session$/ })).toBeNull();
  });

  it("names the item the room is on", async () => {
    setup(state({ status: "running", position: 2 }));
    expect(await screen.findByText(/Item 2 of 3/)).toBeInTheDocument();
  });

  it("refuses to offer another item once the room is on the last one", () => {
    setup(state({ status: "running", position: 3 }));
    expect(button("Next item")).toBeDisabled();
  });

  it("will not show an answer twice", () => {
    setup(state({ status: "running", position: 1, reveal: true }));
    expect(button("Show answer")).toBeDisabled();
  });

  it("takes the room through the moves a running room has", async () => {
    const fake = setup(state({ status: "running", position: 1 }));
    await fake.user.click(button("Show answer"));
    await fake.user.click(button("Next item"));
    await fake.user.click(button("Pause"));
    expect(fake.ran).toEqual(["reveal", "advance", "pause"]);
    // Advancing puts the next question up, so whatever was showing is no longer its answer.
    expect(await screen.findByRole("button", { name: /^Resume$/ })).toBeInTheDocument();
    expect(button("Show answer")).toBeEnabled();
  });

  it("swaps pause for resume while the room is paused", async () => {
    const fake = setup(state({ status: "paused", position: 1 }));
    await fake.user.click(button("Resume"));
    expect(fake.ran).toEqual(["resume"]);
    expect(await screen.findByRole("button", { name: /^Pause$/ })).toBeInTheDocument();
  });

  it("ends the room, and then offers nothing and withdraws the code", async () => {
    const fake = setup();
    await fake.user.click(button("End session"));
    expect(await screen.findByText(/This session has ended\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^End session$/ })).toBeNull();
    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull();
  });

  it("points an ended room at its report", async () => {
    const fake = setup();
    await fake.user.click(button("End session"));
    expect(await screen.findByRole("link", { name: "Open the report" })).toHaveAttribute(
      "href",
      `/live/${SESSION_ID}/report`,
    );
  });

  it("shows the room's own sentence when a move is refused", async () => {
    const fake = setup(state(), new LiveSessionError("not_open"));
    await fake.user.click(button("Start session"));
    expect(await screen.findByRole("alert")).toHaveTextContent("This session has ended.");
  });

  it("says so when the console cannot reach the room at all", async () => {
    const broken: LiveHostTransport = {
      ...fakeTransport(state()).transport,
      open: async () => {
        throw new Error("no socket");
      },
    };
    render(
      <HostLobby
        sessionId={SESSION_ID}
        title="Cardiac basics"
        code={CODE}
        studentUrl={`https://learn.test/join/${CODE}`}
        initial={state()}
        connect={() => broken}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Live updates are not running");
  });

  it("closes the console when the screen goes away", () => {
    const fake = fakeTransport(state());
    const view = render(
      <HostLobby
        sessionId={SESSION_ID}
        title="Cardiac basics"
        code={CODE}
        studentUrl={`https://learn.test/join/${CODE}`}
        initial={state()}
        connect={() => fake.transport}
      />,
    );
    view.unmount();
    expect(fake.transport.close).toHaveBeenCalled();
  });
});

describe("HostLobby: how many have answered (#133)", () => {
  it("says nothing about answers while the room is still in the lobby", async () => {
    const fake = setup();
    fake.answersIn(tallyOf(0, 3));
    await waitFor(() => expect(screen.getByTestId("join-code")).toBeInTheDocument());
    expect(screen.queryByTestId("answer-count")).toBeNull();
    // Nothing is asked for either: a lobby has no item to have answers to.
    expect(fake.asks()).toBe(0);
  });

  it("counts the answers in for the item the room is on, and keeps counting", async () => {
    const fake = setup(state({ status: "running", position: 1 }));
    fake.answersIn(tallyOf(1, 3));
    await waitFor(() =>
      expect(screen.getByTestId("answer-count")).toHaveTextContent("1 of 3 answered"),
    );

    // ADR 0002 pushes nothing per submission, so the console asks again rather than waiting.
    fake.answersIn(tallyOf(3, 3));
    await waitFor(() =>
      expect(screen.getByTestId("answer-count")).toHaveTextContent("3 of 3 answered"),
    );
  });

  it("drops a count that is about the item the room has just left", async () => {
    const fake = setup(state({ status: "running", position: 1 }));
    fake.answersIn(tallyOf(3, 3, 1));
    await waitFor(() =>
      expect(screen.getByTestId("answer-count")).toHaveTextContent("3 of 3 answered"),
    );

    // "3 of 3 answered" over a question nobody has seen yet is worse than showing nothing.
    fake.answersIn(null);
    await fake.user.click(button("Next item"));
    await waitFor(() => expect(screen.queryByTestId("answer-count")).toBeNull());
  });

  it("stops asking once the session has ended", async () => {
    const fake = setup(state({ status: "running", position: 1 }));
    fake.answersIn(tallyOf(2, 2));
    await waitFor(() => expect(fake.asks()).toBeGreaterThan(0));
    await fake.user.click(button("End session"));
    await waitFor(() => expect(screen.queryByTestId("answer-count")).toBeNull());

    const settled = fake.asks();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fake.asks()).toBe(settled);
  });
});

describe("HostLobby: the item's results (#180)", () => {
  const sata = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item & {
    type: "multiple_response";
  };
  const [first] = sata.content.options;
  const twoAnswered = distributionFor(sata, [
    { type: "multiple_response", optionIds: [first?.id] },
    { type: "multiple_response", optionIds: [first?.id] },
  ]);

  it("asks for no results in the lobby, and shows no panel", async () => {
    const fake = setup();
    fake.resultsIn(twoAnswered);
    await waitFor(() => expect(screen.getByTestId("join-code")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Results" })).toBeNull();
    expect(fake.resultAsks()).toBe(0);
  });

  it("draws the item's results while the room is on it, marking nothing before the reveal", async () => {
    const fake = setup(state({ status: "running", position: 1 }));
    fake.resultsIn(twoAnswered);
    expect(await screen.findByText("2 answers counted")).toBeInTheDocument();
    expect(screen.queryAllByTestId("result-correct")).toHaveLength(0);

    await fake.user.click(button("Show answer"));
    await waitFor(() => expect(screen.getAllByTestId("result-correct").length).toBeGreaterThan(0));
  });
});

describe("HostLobby: the item timer (#182)", () => {
  const timed = (over: Partial<LiveSessionState> = {}) =>
    state({
      status: "running",
      position: 1,
      timer: { seconds: 30, endsAt: SERVER_NOW + 27_000, remainingMs: null },
      ...over,
    });

  it("offers a time per item from the lobby, and says what running out does", async () => {
    const fake = setup();
    const select = screen.getByRole("combobox", { name: "Time per item" });
    expect([...(select as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      "Off",
      "30 seconds",
      "1 minute",
      "90 seconds",
      "2 minutes",
    ]);
    expect(screen.getByText(/you still move the room on/)).toBeInTheDocument();

    await fake.user.selectOptions(select, "30 seconds");
    await waitFor(() => expect(fake.ran).toEqual(["set_timer:30"]));
    await waitFor(() => expect(select).toHaveValue("30"));

    await fake.user.selectOptions(select, "Off");
    await waitFor(() => expect(fake.ran).toEqual(["set_timer:30", "set_timer:null"]));
  });

  it("counts down on the session's clock while the room is on a timed item", async () => {
    setup(timed());
    // The first frame may be drawn before the console has connected, on this machine's clock; the
    // next is on the session's, which is what the console measures on opening.
    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent(/0:2[67]/));
  });

  it("adds fifteen seconds and stops the timer", async () => {
    const fake = setup(timed());
    await fake.user.click(button("Add 15 seconds"));
    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent("0:42"));
    await fake.user.click(button("Stop timer"));
    await waitFor(() => expect(screen.queryByRole("timer")).toBeNull());
    expect(fake.ran).toEqual(["extend_timer", "stop_timer"]);
    // With no clock left there is nothing to add to or stop.
    expect(button("Add 15 seconds")).toBeDisabled();
    expect(button("Stop timer")).toBeDisabled();
  });

  it("greys the timer buttons out on an item that has no clock", () => {
    setup(state({ status: "running", position: 1 }));
    expect(button("Add 15 seconds")).toBeDisabled();
    expect(button("Stop timer")).toBeDisabled();
  });

  it("puts the timer away once the session has ended", async () => {
    const fake = setup(timed());
    await fake.user.click(button("End session"));
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    expect(screen.queryByRole("timer")).toBeNull();
  });
});
