import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { LiveSessionTransport } from "@/lib/live";
import { createInMemoryRoom } from "@/lib/live/memoryRoom";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { HostLobby } from "./HostLobby";

/**
 * The projector view (owner decision 3): one route, `?view=projector`, fed by the same room as the
 * control view. Driven end to end through the in-memory room, which keeps the keys on its own
 * side as the server does, so what the stage draws is what a real console would hand it.
 */

const SESSION_ID = "00000000-0000-4000-8000-00000000a001";
const CODE = "AJ4K7P";
const NOW = 1_800_000_000_000;
const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item & {
  type: "multiple_choice";
};
const MATRIX = itemSchema.parse(FIXTURES.matrix_multiple_choice.canonical) as Item;
const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item & {
  type: "multiple_response";
};
const RATIONALE = MC.rationale.general?.value ?? "";

function setup(view: "control" | "projector", items: readonly Item[] = [MC, MATRIX]) {
  const room = createInMemoryRoom({ items, code: CODE, sessionId: SESSION_ID, now: () => NOW });
  const host = room.host();
  render(
    <HostLobby
      sessionId={SESSION_ID}
      title="Cardiac basics"
      code={CODE}
      studentUrl={`https://learn.test/join/${CODE}`}
      qrCode={null}
      view={view}
      initial={room.currentState()}
      connect={() => host}
      tallyIntervalMs={20}
    />,
  );
  /** A second console on the same room: the teacher's other window, which moves it. */
  const control = room.host();
  const opened = control.open();
  return {
    room,
    user: userEvent.setup(),
    control: async () => {
      await opened;
      return control;
    },
    join: async (name: string): Promise<LiveSessionTransport> => {
      const phone = room.participant();
      await act(async () => {
        await phone.join(CODE, { displayName: name });
      });
      return phone;
    },
  };
}

const stage = () => screen.getByRole("region", { name: "Projector view" });

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("the projector view: lobby", () => {
  it("shows the join code, where to type it, and who has joined, with no controls", async () => {
    const fake = setup("projector");
    await fake.join("Ada Brennan");
    await fake.join("Ben Osei");
    expect(await within(stage()).findByText("Ben Osei")).toBeInTheDocument();
    expect(within(stage()).getByText("Ada Brennan")).toBeInTheDocument();
    expect(within(stage()).getByTestId("join-code")).toHaveTextContent("AJ4 K7P");
    expect(stage()).toHaveTextContent("learn.test/join");
    expect(stage()).toHaveTextContent("2in this session");
    // A projector window of its own has nothing to press: the way back is only for a teacher
    // presenting on the control view's screen (code review M2).
    expect(within(stage()).queryAllByRole("button")).toEqual([]);
  });
});

describe("the projector view: a question", () => {
  it("shows the question and its options lettered as the phones letter them, and no key", async () => {
    const fake = setup("projector");
    await fake.join("Ada Brennan");
    await (await fake.control()).start();
    const choices = await within(stage()).findByRole("list", { name: "Choices" });
    const rows = within(choices).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.slice(0, 1))).toEqual(["A", "B", "C", "D"]);
    expect(rows[0]).toHaveTextContent(MC.content.options[0]?.label ?? "");
    expect(stage()).toHaveTextContent("Question 1 of 2");
    expect(stage()).not.toHaveTextContent("Correct");
    expect(stage()).not.toHaveTextContent(RATIONALE);
    // Names are for the lobby only (owner decision 4).
    expect(within(stage()).queryByText("Ada Brennan")).toBeNull();
    // Late students can still join.
    expect(within(stage()).getByTestId("stage-join-strip")).toHaveTextContent("AJ4 K7P");
  });

  it("counts the answers in, never who sent them", async () => {
    const fake = setup("projector");
    const phone = await fake.join("Ada Brennan");
    await fake.join("Ben Osei");
    await (await fake.control()).start();
    await within(stage()).findByRole("list", { name: "Choices" });
    await act(async () => {
      await phone.submit(MC.id, { type: "multiple_choice", optionId: "opt_b" });
    });
    await waitFor(() =>
      expect(within(stage()).getByTestId("answer-count")).toHaveTextContent("1 of 2 answered"),
    );
    // No tallies by option while answers are coming in.
    expect(within(stage()).queryByText(/·\s*\d+%/)).toBeNull();
  });

  it("shows a select-all question's options without letters, as its phones show them", async () => {
    const fake = setup("projector", [SATA]);
    await (await fake.control()).start();
    const choices = await within(stage()).findByRole("list", { name: "Choices" });
    const rows = within(choices).getAllByRole("listitem");
    expect(rows).toHaveLength(SATA.content.options.length);
    expect(rows[0]?.textContent).toBe(SATA.content.options[0]?.label);
  });

  it("points a question it cannot letter at the phones", async () => {
    const fake = setup("projector", [MATRIX]);
    await (await fake.control()).start();
    expect(await within(stage()).findByText("Answer on your phone.")).toBeInTheDocument();
  });
});

describe("the projector view: the answer showing", () => {
  it("draws the chart with the key marked in words, and the rationale", async () => {
    const fake = setup("projector");
    const phone = await fake.join("Ada Brennan");
    const control = await fake.control();
    await control.start();
    await act(async () => {
      await phone.submit(MC.id, {
        type: "multiple_choice",
        optionId: MC.answerKey.correctOptionId,
      });
    });
    await control.reveal();
    expect(await within(stage()).findByText("Correct")).toBeInTheDocument();
    expect(stage().querySelectorAll("li[data-key]")).toHaveLength(1);
    expect(within(stage()).getAllByText("1 · 100%")).toHaveLength(1);
    expect(stage()).toHaveTextContent(RATIONALE.slice(0, 40));
  });
});

describe("the projector view: the end", () => {
  it("sums up the session in calm numbers", async () => {
    const fake = setup("projector");
    await fake.join("Ada Brennan");
    const control = await fake.control();
    await control.start();
    await control.end();
    expect(await within(stage()).findByText("Live session ended")).toBeInTheDocument();
    // Each number follows its words in the markup (a description list), and sits above them.
    expect(stage()).toHaveTextContent(/questions?\s*1/);
    expect(stage()).toHaveTextContent(/in this session\s*1/);
    // This screen heard the one question's count, nobody answered it: 0 of 1.
    expect(stage()).toHaveTextContent(/of answers sent\s*0%/);
  });
});

describe("switching between the two views on one screen", () => {
  it("presents on this screen, and comes back with Escape", async () => {
    const fake = setup("control");
    await fake.user.click(await screen.findByRole("button", { name: "Present on this screen" }));
    expect(stage()).toBeInTheDocument();
    expect(window.location.search).toBe("?view=projector");
    await fake.user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Projector view" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("comes back from the corner button too", async () => {
    const fake = setup("control");
    await fake.user.click(await screen.findByRole("button", { name: "Present on this screen" }));
    await fake.user.click(screen.getByRole("button", { name: "Press Esc for the control view" }));
    expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("ignores Escape in a projector window of its own", async () => {
    const fake = setup("projector");
    await fake.user.keyboard("{Escape}");
    expect(stage()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });
});

describe("presenting on one screen: the keyboard moves the session on", () => {
  /** The teacher's one window, switched to the projector view in place. */
  async function presenting(items?: readonly Item[]) {
    const fake = setup("control", items);
    await fake.user.click(await screen.findByRole("button", { name: "Present on this screen" }));
    expect(stage()).toBeInTheDocument();
    return fake;
  }

  it("runs the one primary move with Space or the right arrow, and says so quietly", async () => {
    const fake = await presenting();
    await fake.join("Ada Brennan");
    expect(screen.getByTestId("stage-keys")).toHaveTextContent("Space: Start");

    await fake.user.keyboard(" ");
    expect(await within(stage()).findByRole("list", { name: "Choices" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("stage-keys")).toHaveTextContent("Space: Show answer"),
    );

    await fake.user.keyboard("{ArrowRight}");
    expect(await within(stage()).findByText("Correct")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("stage-keys")).toHaveTextContent("Space: Next question"),
    );

    await fake.user.keyboard(" ");
    await waitFor(() => expect(stage()).toHaveTextContent("Question 2 of 2"));
    // Still the projector view: the keys moved the session, not the screen.
    expect(window.location.search).toBe("?view=projector");
  });

  it("never ends the session from a key: on the last answer Space does nothing", async () => {
    const fake = await presenting([MC]);
    await fake.user.keyboard(" ");
    await within(stage()).findByRole("list", { name: "Choices" });
    await fake.user.keyboard(" ");
    await within(stage()).findByText("Correct");
    // Ending is the next move, so no key is offered for it.
    await waitFor(() => expect(screen.queryByTestId("stage-keys")).toBeNull());

    await fake.user.keyboard(" ");
    await fake.user.keyboard("{ArrowRight}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(stage()).queryByText("Live session ended")).toBeNull();
    expect(within(stage()).getByText("Correct")).toBeInTheDocument();
  });

  it("never binds End: the key that ends is only ever behind the question", async () => {
    const fake = await presenting([MC]);
    await fake.user.keyboard("{End}");
    expect(within(stage()).queryByRole("list", { name: "Choices" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves nothing from a projector window of its own", async () => {
    const fake = setup("projector");
    await fake.user.keyboard(" ");
    await fake.user.keyboard("{ArrowRight}");
    expect(within(stage()).queryByRole("list", { name: "Choices" })).toBeNull();
    expect(screen.queryByTestId("stage-keys")).toBeNull();
  });
});

describe("the projector view: when it cannot hear the room", () => {
  it("says so in a corner, so a stale wall is plain, and says nothing while connected", async () => {
    const fake = setup("projector");
    await within(stage()).findByTestId("join-code");
    expect(within(stage()).queryByText("Reconnecting")).toBeNull();
    act(() => fake.room.setHostConnection("reconnecting"));
    expect(within(stage()).getByText("Reconnecting")).toBeInTheDocument();
    act(() => fake.room.setHostConnection("connected"));
    expect(within(stage()).queryByText("Reconnecting")).toBeNull();
  });
});
