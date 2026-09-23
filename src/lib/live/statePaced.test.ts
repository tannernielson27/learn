import { describe, expect, it } from "vitest";
import {
  LIVE_REFUSALS,
  applyHostCommand,
  canGoTo,
  canRunHostCommand,
  canSubmit,
  chooseTimer,
  goToItem,
  initialSessionState,
  isStudentPaced,
  itemAt,
  pacedSet,
  type HostCommand,
  type LiveSessionState,
} from "@/lib/live";

/**
 * Student-paced mode (#185): the room is opened on the whole set and each phone works through it.
 * Every expectation here has a twin in `supabase/tests/database/live_student_paced.test.sql`,
 * which holds the trigger and the two submission functions to the same moves.
 */
const NOW = 1_800_000_000_000;
const IDS = ["a", "b", "c"] as const;

function drive(from: LiveSessionState, commands: readonly HostCommand[]): LiveSessionState {
  return commands.reduce((state, command) => {
    const result = applyHostCommand(state, command, NOW);
    if (!result.ok) throw new Error(`${command} was refused: ${result.refusal}`);
    return result.state;
  }, from);
}

const lobby = (): LiveSessionState => initialSessionState(3, null, "student_paced");
const running = () => drive(lobby(), ["start"]);

function refused(state: LiveSessionState, command: HostCommand | "extend_timer" | "stop_timer") {
  const result = applyHostCommand(state, command, NOW);
  return result.ok ? "accepted" : result.refusal;
}

describe("the mode a state carries", () => {
  it("is carried only by a student-paced room, so an instructor-paced state is unchanged", () => {
    expect(lobby().mode).toBe("student_paced");
    expect(isStudentPaced(lobby())).toBe(true);
    expect(initialSessionState(3)).not.toHaveProperty("mode");
    expect(initialSessionState(3, null, "instructor_paced")).not.toHaveProperty("mode");
    expect(isStudentPaced(initialSessionState(3))).toBe(false);
  });

  it("survives every move, including the end", () => {
    const ended = drive(lobby(), ["start", "pause", "resume", "reveal", "end"]);
    expect(ended.mode).toBe("student_paced");
  });
});

describe("the host's moves in a student-paced room", () => {
  it("starts, pauses, resumes, shows answers and ends, as an instructor-paced room does", () => {
    const started = running();
    expect(started).toMatchObject({ status: "running", position: 1, reveal: false });
    expect(drive(started, ["pause"]).status).toBe("paused");
    expect(drive(started, ["pause", "resume"]).status).toBe("running");
    expect(drive(started, ["reveal"]).reveal).toBe(true);
    // Showing answers while paused is allowed, as it is for one item.
    expect(drive(started, ["pause", "reveal"])).toMatchObject({ status: "paused", reveal: true });
    expect(drive(started, ["end"])).toMatchObject({ status: "ended", reveal: false });
  });

  it("refuses next item, a jump and both timer buttons: phones move themselves", () => {
    for (const state of [lobby(), running(), drive(running(), ["pause"])]) {
      expect(refused(state, "advance")).toBe("student_paced");
      expect(refused(state, "extend_timer")).toBe("student_paced");
      expect(refused(state, "stop_timer")).toBe("student_paced");
      const jumped = goToItem(state, 2, NOW);
      expect(jumped.ok ? "accepted" : jumped.refusal).toBe("student_paced");
      const timed = chooseTimer(state, 30);
      expect(timed.ok ? "accepted" : timed.refusal).toBe("student_paced");
    }
    expect(canRunHostCommand(running(), "advance")).toBe(false);
    expect(canGoTo(running(), 2)).toBe(false);
    expect(LIVE_REFUSALS.student_paced).toBe("Students work through this set at their own pace.");
  });

  it("says an ended room has ended before it says anything about pacing", () => {
    const ended = drive(running(), ["end"]);
    expect(refused(ended, "advance")).toBe("not_open");
    const jumped = goToItem(ended, 2, NOW);
    expect(jumped.ok ? "accepted" : jumped.refusal).toBe("not_open");
  });

  it("shows answers once: a second press is refused", () => {
    expect(refused(drive(running(), ["reveal"]), "reveal")).toBe("already_revealed");
  });
});

describe("answering in a student-paced room", () => {
  it("takes an answer to any item in the set while running, at that item's position", () => {
    const state = running();
    expect(canSubmit(state, "a", IDS, NOW)).toEqual({ ok: true, position: 1 });
    expect(canSubmit(state, "c", IDS, NOW)).toEqual({ ok: true, position: 3 });
    expect(canSubmit(state, "b", IDS, NOW)).toEqual({ ok: true, position: 2 });
  });

  it("refuses an item the set does not have", () => {
    const result = canSubmit(running(), "z", IDS, NOW);
    expect(result.ok ? "accepted" : result.refusal).toBe("wrong_item");
  });

  it("refuses in the lobby, while paused, once answers are showing and once ended", () => {
    const cases: [LiveSessionState, string][] = [
      [lobby(), "not_started"],
      [drive(lobby(), ["start", "pause"]), "paused"],
      [drive(lobby(), ["start", "reveal"]), "already_revealed"],
      [drive(lobby(), ["start", "end"]), "not_open"],
    ];
    for (const [state, refusal] of cases) {
      const result = canSubmit(state, "b", IDS, NOW);
      expect(result.ok ? "accepted" : result.refusal).toBe(refusal);
    }
  });
});

describe("what a student-paced room is on", () => {
  it("is on no single item: itemAt answers null however the room stands", () => {
    expect(itemAt(IDS, running())).toBeNull();
    expect(itemAt(IDS, drive(running(), ["reveal"]))).toBeNull();
  });

  it("is on the whole set while running or paused, and on nothing otherwise", () => {
    expect(pacedSet(IDS, running())).toEqual(IDS);
    expect(pacedSet(IDS, drive(running(), ["pause"]))).toEqual(IDS);
    expect(pacedSet(IDS, lobby())).toBeNull();
    expect(pacedSet(IDS, drive(running(), ["end"]))).toBeNull();
    // An instructor-paced room is never on a set.
    expect(pacedSet(IDS, drive(initialSessionState(3), ["start"]))).toBeNull();
  });
});
