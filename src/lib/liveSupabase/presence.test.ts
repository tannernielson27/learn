import { describe, expect, it } from "vitest";
import { rosterFrom, type PresenceEntry } from "./presence";

const entry = (over: Partial<PresenceEntry> = {}): PresenceEntry => ({
  participantId: "p-1",
  displayName: "Ada Brennan",
  joinedAt: 1_000,
  ...over,
});

/** What `channel.presenceState()` hands back: one array per presence key. */
const tracked = (...entries: PresenceEntry[]): Record<string, PresenceEntry[]> =>
  Object.fromEntries(entries.map((held) => [held.participantId, [held]]));

/** A payload that could only have been tracked by hand. `presenceState<T>()` checks nothing. */
const forged = (over: Record<string, unknown>): PresenceEntry =>
  ({ ...entry(), ...over }) as unknown as PresenceEntry;

describe("rosterFrom", () => {
  it("reads a tracked entry as a person", () => {
    expect(rosterFrom(tracked(entry()))).toEqual([
      { participantId: "p-1", displayName: "Ada Brennan", joinedAt: 1_000 },
    ]);
  });

  it("orders by when each person arrived, then by id", () => {
    const roster = rosterFrom(
      tracked(
        entry({ participantId: "c", joinedAt: 3 }),
        entry({ participantId: "b", joinedAt: 1 }),
        entry({ participantId: "a", joinedAt: 1 }),
      ),
    );
    expect(roster.map((person) => person.participantId)).toEqual(["a", "b", "c"]);
  });

  it("folds this connection's own entry in when a sync has not carried it back yet", () => {
    const me = { participantId: "me", displayName: "Sam", joinedAt: 5 };
    expect(rosterFrom({}, me)).toEqual([me]);
  });

  it("does not fold it in twice once the sync does carry it", () => {
    const me = { participantId: "p-1", displayName: "Sam", joinedAt: 5 };
    expect(rosterFrom(tracked(entry()), me)).toEqual([
      { participantId: "p-1", displayName: "Ada Brennan", joinedAt: 1_000 },
    ]);
  });

  it("drops an entry whose name is not a string, rather than rendering it", () => {
    // The screen at the front of the class renders this string. An object here would throw
    // "Objects are not valid as a React child" and take the host's console down for the room.
    expect(rosterFrom(tracked(forged({ displayName: { toString: "no" } })))).toEqual([]);
    expect(rosterFrom(tracked(forged({ displayName: 7 })))).toEqual([]);
  });

  it("drops an entry with no usable id, name or arrival time", () => {
    expect(rosterFrom(tracked(forged({ participantId: 1 })))).toEqual([]);
    expect(rosterFrom({ "": [forged({ participantId: "" })] })).toEqual([]);
    expect(rosterFrom(tracked(forged({ displayName: "   " })))).toEqual([]);
    expect(rosterFrom(tracked(forged({ joinedAt: "soon" })))).toEqual([]);
    expect(rosterFrom(tracked(forged({ joinedAt: Number.NaN })))).toEqual([]);
  });

  it("drops a name longer than the one `join_session` would have stored", () => {
    expect(rosterFrom(tracked(entry({ displayName: "a".repeat(33) })))).toEqual([]);
    expect(rosterFrom(tracked(entry({ displayName: "a".repeat(32) })))).toHaveLength(1);
  });

  it("cleans a name the way the join form does, so a roster line cannot be rewritten", () => {
    // U+202E right-to-left override reorders the text printed beside it; escaping does not help,
    // because it is not markup. #129 strips it on the way in and this strips it on the way back.
    const roster = rosterFrom(tracked(entry({ displayName: "  Ada ‮  Brennan " })));
    expect(roster[0].displayName).toBe("Ada Brennan");
  });

  it("keeps the last entry when one person is tracked under two keys", () => {
    const roster = rosterFrom({
      one: [entry({ displayName: "First" })],
      two: [entry({ displayName: "Second" })],
    });
    expect(roster).toHaveLength(1);
    expect(roster[0].displayName).toBe("Second");
  });
});
