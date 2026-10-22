import { describe, expect, it } from "vitest";
import type { AttemptProgress } from "./assignments";
import { pickUp, type PickUpAssignment, type PickUpPractice } from "./pickUp";

const assignment = (id: string, maxAttempts = 1): PickUpAssignment => ({
  id,
  classId: "class",
  title: `Assignment ${id}`,
  closesAt: "2026-10-30T23:59:00Z",
  maxAttempts,
});

const bank = (bankId: string, answered: number, itemCount = 10): PickUpPractice => ({
  bankId,
  name: `Quiz ${bankId}`,
  answered,
  itemCount,
});

const progress = (entries: Record<string, AttemptProgress>) => new Map(Object.entries(entries));

describe("pickUp", () => {
  it("is nothing when nothing loaded", () => {
    expect(pickUp(null, undefined, null)).toBeNull();
  });

  it("is nothing when there is no assignment and no practice under way", () => {
    expect(pickUp([], undefined, [bank("a", 0), bank("b", 10)])).toBeNull();
  });

  it("resumes the attempt in progress, ahead of one due sooner that is not started", () => {
    const list = [assignment("soon"), assignment("later")];
    const result = pickUp(list, progress({ later: { submitted: 0, open: true } }), [bank("p", 3)]);
    expect(result).toEqual({ kind: "resume_assignment", assignment: list[1] });
  });

  it("takes the first in progress in the list's order, which is by closing time", () => {
    const list = [assignment("one"), assignment("two")];
    const result = pickUp(
      list,
      progress({ one: { submitted: 0, open: true }, two: { submitted: 0, open: true } }),
      null,
    );
    expect(result).toEqual({ kind: "resume_assignment", assignment: list[0] });
  });

  it("offers the next due assignment not yet started when none is in progress", () => {
    const list = [assignment("done"), assignment("next"), assignment("after")];
    const result = pickUp(list, progress({ done: { submitted: 1, open: false } }), [bank("p", 3)]);
    expect(result).toEqual({ kind: "next_assignment", assignment: list[1] });
  });

  it("does not offer an assignment already submitted once, even with attempts left", () => {
    const list = [assignment("retry", 3)];
    const result = pickUp(list, progress({ retry: { submitted: 1, open: false } }), null);
    expect(result).toBeNull();
  });

  it("falls back to practice under way when no assignment needs anything", () => {
    const practice = [bank("fresh", 0), bank("half", 4), bank("done", 10)];
    const result = pickUp([], undefined, practice);
    expect(result).toEqual({ kind: "resume_practice", bank: practice[1] });
  });

  it("still offers practice when the assignments did not load", () => {
    const practice = [bank("half", 4)];
    expect(pickUp(null, undefined, practice)).toEqual({
      kind: "resume_practice",
      bank: practice[0],
    });
  });

  it("treats a missing progress map as no attempts at all", () => {
    const list = [assignment("a")];
    expect(pickUp(list, undefined, null)).toEqual({
      kind: "next_assignment",
      assignment: list[0],
    });
  });
});
