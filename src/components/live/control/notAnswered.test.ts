import { describe, expect, it } from "vitest";
import type { RosterEntry, SessionProgress } from "@/lib/live";
import { notAnswered } from "./notAnswered";

const entry = (id: string, name: string, present = true): RosterEntry => ({
  participantId: id,
  displayName: name,
  joinedAt: 1,
  present,
});

const roster = [entry("p1", "Ada"), entry("p2", "Ben"), entry("p3", "Cleo", false)];

const progress = (rows: [string, number[]][]): SessionProgress => ({
  answered: [],
  rows: rows.map(([participantId, positions]) => ({
    participantId,
    displayName: participantId,
    positions,
  })),
});

describe("notAnswered", () => {
  it("is everyone in the session with no answer to the question on now, in join order", () => {
    const left = notAnswered(roster, progress([["p2", [1, 2]]]), 2);
    expect(left?.map((person) => person.displayName)).toEqual(["Ada", "Cleo"]);
  });

  it("keeps whether each one is still connected, so the list can say Offline", () => {
    const left = notAnswered(roster, progress([]), 1);
    expect(left?.find((person) => person.displayName === "Cleo")?.present).toBe(false);
  });

  it("does not count an answer to another question", () => {
    expect(notAnswered(roster, progress([["p1", [1]]]), 2)).toHaveLength(3);
  });

  it("is unknown until the first read has come back, or off a question", () => {
    expect(notAnswered(roster, null, 1)).toBeNull();
    expect(notAnswered(roster, progress([]), null)).toBeNull();
  });
});
