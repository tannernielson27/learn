import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createInMemoryRoom } from "@/lib/live/memoryRoom";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { HostLobby } from "./HostLobby";

/**
 * The teacher's control view (QuestionControl, LobbyControl mockups), driven through the
 * in-memory room: the connection it reports, who has not answered yet, and the one primary move.
 */

const SESSION_ID = "00000000-0000-4000-8000-00000000a002";
const CODE = "AJ4K7P";
const NOW = 1_800_000_000_000;
const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const SATA = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;

function setup() {
  const room = createInMemoryRoom({
    items: [MC, SATA],
    code: CODE,
    sessionId: SESSION_ID,
    now: () => NOW,
  });
  const host = room.host();
  render(
    <HostLobby
      sessionId={SESSION_ID}
      title="Cardiac basics"
      code={CODE}
      studentUrl={`https://learn.test/join/${CODE}`}
      qrCode={null}
      initial={room.currentState()}
      connect={() => host}
      tallyIntervalMs={20}
    />,
  );
  return {
    room,
    user: userEvent.setup(),
    join: async (name: string) => {
      const phone = room.participant();
      await act(async () => {
        await phone.join(CODE, { displayName: name });
      });
      return phone;
    },
  };
}

const primary = () =>
  within(screen.getByTestId("control-bar"))
    .getAllByRole("button")
    // The primary variant's own fill, not a ghost button's hover tint.
    .filter((button) => button.className.split(/\s+/).includes("bg-accent"));

describe("the control view: whether it can hear the room", () => {
  it("says Connected, and says so plainly when the channel drops and comes back", async () => {
    const fake = setup();
    expect(screen.getByText("Connected")).toBeInTheDocument();

    act(() => fake.room.setHostConnection("reconnecting"));
    await waitFor(() =>
      expect(document.querySelector("[data-status]")).toHaveAttribute(
        "data-status",
        "reconnecting",
      ),
    );
    expect(screen.getByText(/Live updates are paused on this screen/)).toBeInTheDocument();

    act(() => fake.room.setHostConnection("connected"));
    await waitFor(() =>
      expect(screen.queryByText(/Live updates are paused on this screen/)).toBeNull(),
    );
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
});

describe("the control view: one primary move at a time", () => {
  it("is Start in the lobby, Show answer while answers come in, then Next question", async () => {
    const fake = setup();
    await fake.join("Ada Brennan");
    expect(primary().map((button) => button.textContent)).toEqual(["Start"]);

    await fake.user.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(primary().map((b) => b.textContent)).toEqual(["Show answer"]));

    await fake.user.click(screen.getByRole("button", { name: "Show answer" }));
    await waitFor(() => expect(primary().map((b) => b.textContent)).toEqual(["Next question"]));
  });

  it("is End once the last question's answer is showing", async () => {
    const fake = setup();
    await fake.user.click(screen.getByRole("button", { name: "Start" }));
    await fake.user.click(await screen.findByRole("button", { name: "Next question" }));
    await fake.user.click(await screen.findByRole("button", { name: "Show answer" }));
    await waitFor(() => expect(primary().map((b) => b.textContent)).toEqual(["End live session"]));
  });
});

describe("the control view: who has not answered yet", () => {
  it("lists everyone without an answer to the question on now, and drops each who answers", async () => {
    const fake = setup();
    const ada = await fake.join("Ada Brennan");
    await fake.join("Ben Osei");
    await fake.user.click(screen.getByRole("button", { name: "Start" }));

    const list = await screen.findByTestId("not-answered-list");
    await waitFor(() => expect(list).toHaveTextContent("Ada Brennan"));
    expect(list).toHaveTextContent("Ben Osei");

    await act(async () => {
      await ada.submit(MC.id, { type: "multiple_choice", optionId: "opt_a" });
    });
    await waitFor(() => expect(list).not.toHaveTextContent("Ada Brennan"));
    expect(list).toHaveTextContent("Ben Osei");
    expect(screen.getByTestId("answer-count")).toHaveTextContent("1 of 2 answered");
  });

  it("puts the list away once the answer is showing", async () => {
    const fake = setup();
    await fake.join("Ada Brennan");
    await fake.user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByTestId("not-answered-list");
    await fake.user.click(screen.getByRole("button", { name: "Show answer" }));
    await waitFor(() => expect(screen.queryByTestId("not-answered-list")).toBeNull());
  });

  it("shows the question text on the control view", async () => {
    const fake = setup();
    await fake.user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText(/gained 2\.3 kg|weight/i)).toBeInTheDocument();
  });
});
