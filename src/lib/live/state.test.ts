import { describe, expect, it } from "vitest";
import {
  HOST_COMMANDS,
  LIVE_REFUSALS,
  LiveSessionError,
  SESSION_MODES,
  SESSION_STATUSES,
  applyHostCommand,
  canRunHostCommand,
  canSubmit,
  initialSessionState,
  isLiveSessionError,
  itemAt,
  type HostCommand,
  type LiveSessionState,
} from "@/lib/live";

const lobby = (itemCount = 3): LiveSessionState => initialSessionState(itemCount);

/** Runs a list of commands from the lobby, asserting each is accepted. */
function drive(from: LiveSessionState, commands: readonly HostCommand[]): LiveSessionState {
  return commands.reduce((state, command) => {
    const result = applyHostCommand(state, command);
    if (!result.ok) throw new Error(`${command} was refused: ${result.refusal}`);
    return result.state;
  }, from);
}

function refusalOf(state: LiveSessionState, command: HostCommand): string {
  const result = applyHostCommand(state, command);
  if (result.ok) throw new Error(`${command} was accepted`);
  return result.refusal;
}

describe("the vocabulary", () => {
  it("names the four statuses and two modes the database uses (#128)", () => {
    expect(SESSION_STATUSES).toEqual(["lobby", "running", "paused", "ended"]);
    expect(SESSION_MODES).toEqual(["instructor_paced", "student_paced"]);
  });

  it("closes the set of host commands", () => {
    expect(HOST_COMMANDS).toEqual(["start", "advance", "reveal", "pause", "resume", "end"]);
  });

  it("gives every refusal a sentence a person can read", () => {
    for (const [code, message] of Object.entries(LIVE_REFUSALS)) {
      expect(message.length, code).toBeGreaterThan(10);
      expect(message, code).toMatch(/[.!]$/);
    }
  });
});

describe("initialSessionState", () => {
  it("opens in the lobby, on no item, with nothing revealed", () => {
    expect(lobby(6)).toEqual({ status: "lobby", position: null, itemCount: 6, reveal: false });
  });
});

describe("starting", () => {
  it("puts the room on item one", () => {
    const started = drive(lobby(), ["start"]);
    expect(started).toMatchObject({ status: "running", position: 1, reveal: false });
  });

  it("refuses a second start", () => {
    expect(refusalOf(drive(lobby(), ["start"]), "start")).toBe("already_started");
  });

  it("refuses a session with nothing to run", () => {
    expect(refusalOf(lobby(0), "start")).toBe("empty_set");
  });

  it("does not mutate the state it was given", () => {
    const before = lobby();
    applyHostCommand(before, "start");
    expect(before).toEqual({ status: "lobby", position: null, itemCount: 3, reveal: false });
  });
});

describe("advancing", () => {
  it("moves one item at a time, counting from one like sessions.current_position", () => {
    expect(drive(lobby(), ["start", "advance"]).position).toBe(2);
    expect(drive(lobby(), ["start", "advance", "advance"]).position).toBe(3);
  });

  it("refuses to advance past the end of the set", () => {
    const onLast = drive(lobby(3), ["start", "advance", "advance"]);
    expect(refusalOf(onLast, "advance")).toBe("past_end");
  });

  it("refuses to advance before the session starts", () => {
    expect(refusalOf(lobby(), "advance")).toBe("not_started");
  });

  it("drops the reveal, because a new item is a new question", () => {
    const revealed = drive(lobby(), ["start", "reveal"]);
    expect(revealed.reveal).toBe(true);
    expect(drive(revealed, ["advance"]).reveal).toBe(false);
  });

  it("is allowed while paused, as the database allows it", () => {
    const paused = drive(lobby(), ["start", "pause"]);
    expect(drive(paused, ["advance"])).toMatchObject({ status: "paused", position: 2 });
  });
});

describe("revealing", () => {
  it("refuses a reveal before the session starts", () => {
    expect(refusalOf(lobby(), "reveal")).toBe("not_started");
  });

  it("refuses a second reveal of the same item", () => {
    expect(refusalOf(drive(lobby(), ["start", "reveal"]), "reveal")).toBe("already_revealed");
  });

  it("is allowed while paused, matching sessions_reveal_needs_running_item (#128)", () => {
    const paused = drive(lobby(), ["start", "pause"]);
    expect(drive(paused, ["reveal"])).toMatchObject({ status: "paused", reveal: true });
  });
});

describe("pausing and resuming", () => {
  it("pauses a running session and resumes it", () => {
    const paused = drive(lobby(), ["start", "pause"]);
    expect(paused.status).toBe("paused");
    expect(drive(paused, ["resume"]).status).toBe("running");
  });

  it("refuses to pause from the lobby", () => {
    expect(refusalOf(lobby(), "pause")).toBe("not_started");
  });

  it("refuses to pause a session that is already paused", () => {
    expect(refusalOf(drive(lobby(), ["start", "pause"]), "pause")).toBe("not_running");
  });

  it("refuses to resume a session that is not paused", () => {
    expect(refusalOf(drive(lobby(), ["start"]), "resume")).toBe("not_paused");
  });
});

describe("ending", () => {
  it("can end from the lobby, from running and from paused", () => {
    expect(drive(lobby(), ["end"]).status).toBe("ended");
    expect(drive(lobby(), ["start", "end"]).status).toBe("ended");
    expect(drive(lobby(), ["start", "pause", "end"]).status).toBe("ended");
  });

  it("drops the reveal flag with it, as #128's trigger does", () => {
    expect(drive(lobby(), ["start", "reveal", "end"]).reveal).toBe(false);
  });

  it("refuses every command afterwards, including end itself", () => {
    const ended = drive(lobby(), ["start", "end"]);
    for (const command of HOST_COMMANDS) {
      expect(refusalOf(ended, command), command).toBe("not_open");
    }
  });
});

describe("canRunHostCommand", () => {
  it("says which buttons a console may offer", () => {
    const inLobby = lobby();
    expect(canRunHostCommand(inLobby, "start")).toBe(true);
    expect(canRunHostCommand(inLobby, "reveal")).toBe(false);
    const running = drive(inLobby, ["start"]);
    expect(canRunHostCommand(running, "pause")).toBe(true);
    expect(canRunHostCommand(running, "resume")).toBe(false);
  });
});

describe("canSubmit", () => {
  const ids = ["a", "b", "c"];

  it("accepts an answer to the item the room is on", () => {
    expect(canSubmit(drive(lobby(), ["start"]), "a", ids)).toEqual({ ok: true });
  });

  it("refuses an answer after the session ends", () => {
    const ended = drive(lobby(), ["start", "end"]);
    expect(canSubmit(ended, "a", ids)).toMatchObject({ ok: false, refusal: "not_open" });
  });

  it("refuses an answer before the session starts", () => {
    expect(canSubmit(lobby(), "a", ids)).toMatchObject({ ok: false, refusal: "not_started" });
  });

  it("refuses an answer while the session is paused", () => {
    const paused = drive(lobby(), ["start", "pause"]);
    expect(canSubmit(paused, "a", ids)).toMatchObject({ ok: false, refusal: "paused" });
  });

  it("refuses an answer once the key is showing", () => {
    const revealed = drive(lobby(), ["start", "reveal"]);
    expect(canSubmit(revealed, "a", ids)).toMatchObject({ ok: false, refusal: "already_revealed" });
  });

  it("refuses an answer to an item the room has moved on from", () => {
    const second = drive(lobby(), ["start", "advance"]);
    expect(canSubmit(second, "a", ids)).toMatchObject({ ok: false, refusal: "wrong_item" });
  });

  it("carries the sentence to show beside the code", () => {
    const result = canSubmit(lobby(), "a", ids);
    expect(result).toMatchObject({ ok: false, message: LIVE_REFUSALS.not_started });
  });
});

describe("itemAt", () => {
  const items = ["one", "two", "three"];

  it("has no item in the lobby or once the session has ended", () => {
    expect(itemAt(items, lobby())).toBeNull();
    expect(itemAt(items, drive(lobby(), ["start", "end"]))).toBeNull();
  });

  it("reads the array from zero while position counts from one", () => {
    expect(itemAt(items, drive(lobby(), ["start"]))).toBe("one");
    expect(itemAt(items, drive(lobby(), ["start", "advance"]))).toBe("two");
  });

  it("is still the item while paused", () => {
    expect(itemAt(items, drive(lobby(), ["start", "pause"]))).toBe("one");
  });

  it("answers null when the set is shorter than the state claims", () => {
    expect(
      itemAt(["only"], { status: "running", position: 2, itemCount: 2, reveal: false }),
    ).toBeNull();
  });
});

describe("LiveSessionError", () => {
  it("carries the code and the sentence for that code", () => {
    const error = new LiveSessionError("past_end");
    expect(error.name).toBe("LiveSessionError");
    expect(error.code).toBe("past_end");
    expect(error.message).toBe(LIVE_REFUSALS.past_end);
  });

  it("takes a replacement message when one fits better", () => {
    expect(new LiveSessionError("malformed", "Nope.").message).toBe("Nope.");
  });

  it("narrows with isLiveSessionError", () => {
    expect(isLiveSessionError(new LiveSessionError("not_open"))).toBe(true);
    expect(isLiveSessionError(new Error("not_open"))).toBe(false);
    expect(isLiveSessionError("not_open")).toBe(false);
  });
});
