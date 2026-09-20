import { describe, expect, it } from "vitest";
import { ROSTER_LIMIT, countPresent, mergeRoster, type RosterEntry } from "./roster";
import type { Participant } from "./transport";

const ava: Participant = { participantId: "a", displayName: "Ava", joinedAt: 10 };
const ben: Participant = { participantId: "b", displayName: "Ben", joinedAt: 20 };
const cleo: Participant = { participantId: "c", displayName: "Cleo", joinedAt: 30 };

const present = (person: Participant): RosterEntry => ({ ...person, present: true });
const away = (person: Participant): RosterEntry => ({ ...person, present: false });

describe("mergeRoster", () => {
  it("takes the first presence sync as the roster", () => {
    expect(mergeRoster([], [ava, ben])).toEqual([present(ava), present(ben)]);
  });

  it("adds someone who has just joined", () => {
    expect(mergeRoster([present(ava)], [ava, ben])).toEqual([present(ava), present(ben)]);
  });

  it("greys someone out rather than dropping them when they leave", () => {
    expect(mergeRoster([present(ava), present(ben)], [ava])).toEqual([present(ava), away(ben)]);
  });

  it("brings a phone that came back to life back to present", () => {
    expect(mergeRoster([present(ava), away(ben)], [ava, ben])).toEqual([
      present(ava),
      present(ben),
    ]);
  });

  it("keeps the place someone had in the room when they reconnect", () => {
    // Presence is re-tracked from the reconnecting phone, and `joinedAt` on that entry is when
    // that page last rendered. The roster is a list of who is in the room, so the seat that was
    // held all along is the one they come back to.
    const later: Participant = { ...ben, joinedAt: 999 };
    expect(mergeRoster([present(ava), away(ben), present(cleo)], [ava, later, cleo])).toEqual([
      present(ava),
      present(ben),
      present(cleo),
    ]);
  });

  it("takes the latest name a present entry carries", () => {
    const renamed: Participant = { ...ben, displayName: "Ben O." };
    expect(mergeRoster([present(ben)], [renamed])).toEqual([{ ...renamed, present: true }]);
  });

  it("orders by when each person arrived, then by id so the order never flickers", () => {
    const tie: Participant = { participantId: "aa", displayName: "Tie", joinedAt: 10 };
    const merged = mergeRoster([], [cleo, tie, ava]);
    expect(merged.map((entry) => entry.participantId)).toEqual(["a", "aa", "c"]);
  });

  it("never mutates the roster it was given", () => {
    const known = [present(ava)];
    const frozen = Object.freeze([...known]);
    mergeRoster(frozen, [ben]);
    expect(known).toEqual([present(ava)]);
  });

  it("ignores a presence entry that names the same person twice", () => {
    expect(mergeRoster([], [ava, { ...ava, displayName: "Ava again" }])).toEqual([
      { ...ava, displayName: "Ava again", present: true },
    ]);
  });
});

describe("mergeRoster under flood", () => {
  const many = (count: number, from: number): Participant[] =>
    Array.from({ length: count }, (_, index) => ({
      participantId: `x-${from + index}`,
      displayName: `Name ${from + index}`,
      joinedAt: from + index,
    }));

  it("remembers no more than the cap", () => {
    const merged = mergeRoster([], many(ROSTER_LIMIT + 50, 0));
    expect(merged).toHaveLength(ROSTER_LIMIT);
  });

  it("forgets who has gone away before it forgets anyone still connected", () => {
    // The console has been open a while and holds a full roster of people who have left.
    const remembered = many(ROSTER_LIMIT, 0).map(away);
    // Then everyone real comes back at once, which is more than the cap between them.
    const connected = many(60, 1_000);
    const merged = mergeRoster(remembered, connected);

    expect(merged).toHaveLength(ROSTER_LIMIT);
    expect(merged.filter((entry) => entry.present)).toHaveLength(60);
    for (const person of connected) {
      expect(merged.some((entry) => entry.participantId === person.participantId)).toBe(true);
    }
  });

  it("keeps the people it has known longest when it has to forget someone", () => {
    const remembered = many(ROSTER_LIMIT + 10, 0).map(away);
    const merged = mergeRoster(remembered, []);
    expect(merged.map((entry) => entry.participantId)).toContain("x-0");
    expect(merged.map((entry) => entry.participantId)).not.toContain(`x-${ROSTER_LIMIT + 9}`);
  });
});

describe("countPresent", () => {
  it("counts the connected phones and not the empty seats", () => {
    expect(countPresent([present(ava), away(ben), present(cleo)])).toBe(2);
  });

  it("is nought for an empty room", () => {
    expect(countPresent([])).toBe(0);
  });
});
