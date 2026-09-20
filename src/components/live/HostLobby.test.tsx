import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LiveSessionError,
  applyHostCommand,
  type HostCommand,
  type HostSnapshot,
  type LiveHostTransport,
  type LiveSessionState,
  type Participant,
  type SessionView,
} from "@/lib/live";
import type { Item } from "@/lib/ngn/schemas";
import { HostLobby } from "./HostLobby";

const SESSION_ID = "00000000-0000-4000-8000-0000000132aa";
const CODE = "AJ4K7P";

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "lobby",
  position: null,
  itemCount: 3,
  reveal: false,
  ...over,
});

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
  const views = new Set<(view: SessionView<Item>) => void>();
  const presence = new Set<(roster: Participant[]) => void>();
  const ran: HostCommand[] = [];
  let resolveOpen: (() => void) | null = null;
  const opened = new Promise<void>((resolve) => {
    resolveOpen = resolve;
  });

  const run = async (command: HostCommand): Promise<LiveSessionState> => {
    ran.push(command);
    if (refusal) throw refusal;
    const result = applyHostCommand(held, command);
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
    start: () => run("start"),
    advance: () => run("advance"),
    reveal: () => run("reveal"),
    pause: () => run("pause"),
    resume: () => run("resume"),
    end: () => run("end"),
  };

  return {
    transport,
    ran,
    letOpen: () => resolveOpen?.(),
    sync: (people: Participant[]) => {
      roster = people;
      for (const listener of [...presence]) listener(people);
    },
  };
}

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
