import { describe, expect, it } from "vitest";
import { asksFirst, commandLabel, controlCommands, offeredCommands } from "./controls";
import { initialSessionState, type LiveSessionState } from "./state";
import { NO_TIMER } from "./timer";

const at = (over: Partial<LiveSessionState>): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

describe("offeredCommands", () => {
  it("offers Start and End in the lobby, nothing once ended", () => {
    expect(offeredCommands(initialSessionState(3))).toEqual(["start", "end"]);
    expect(offeredCommands(at({ status: "ended" }))).toEqual([]);
  });

  it("offers Pause while running and Resume while paused", () => {
    expect(offeredCommands(at({}))).toEqual(["reveal", "advance", "pause", "end"]);
    expect(offeredCommands(at({ status: "paused" }))).toEqual([
      "reveal",
      "advance",
      "resume",
      "end",
    ]);
  });

  it("has no Next question in a student-paced room", () => {
    expect(offeredCommands(at({ mode: "student_paced" }))).toEqual(["reveal", "pause", "end"]);
  });
});

describe("commandLabel and asksFirst", () => {
  it("says Show answers, and asks first, for a student-paced reveal", () => {
    const paced = at({ mode: "student_paced" });
    expect(commandLabel("reveal", paced)).toBe("Show answers");
    expect(asksFirst("reveal", paced)).toBe(true);
    expect(commandLabel("reveal", at({}))).toBe("Show answer");
    expect(asksFirst("reveal", at({}))).toBe(false);
    expect(asksFirst("end", at({}))).toBe(true);
    expect(asksFirst("pause", at({}))).toBe(false);
  });
});

describe("controlCommands", () => {
  it("greys out what the reducer refuses", () => {
    const last = at({ position: 3, itemCount: 3 });
    const advance = controlCommands(last).find((entry) => entry.command === "advance");
    expect(advance).toEqual({
      command: "advance",
      label: "Next question",
      enabled: false,
      confirm: false,
    });
    const end = controlCommands(last).find((entry) => entry.command === "end");
    expect(end).toMatchObject({ enabled: true, confirm: true, label: "End live session" });
  });
});
