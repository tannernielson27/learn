import { describe, expect, it } from "vitest";
import { REMOVED_REASON } from "./files/reasons";
import { POSITIONS_PER_FILE, placeOf, removedPlaces, withoutRemoved } from "./places";

const ready = { status: "ready", rejected_reason: null };
const removed = { status: "rejected", rejected_reason: REMOVED_REASON };
const refused = { status: "rejected", rejected_reason: "The file is empty." };

describe("places", () => {
  it("reads a position's file place", () => {
    expect(POSITIONS_PER_FILE).toBe(1000);
    expect(placeOf(0)).toBe(0);
    expect(placeOf(999)).toBe(0);
    expect(placeOf(1000)).toBe(1);
    expect(placeOf(2417)).toBe(2);
  });

  it("finds removed files by their place among every row, refused ones included", () => {
    expect([...removedPlaces([ready, removed, refused, removed])]).toEqual([1, 3]);
    expect(removedPlaces([ready, refused]).size).toBe(0);
    // A ready file is never read as removed, whatever its reason column holds.
    expect(removedPlaces([{ status: "ready", rejected_reason: REMOVED_REASON }]).size).toBe(0);
  });

  it("leaves out only the entries at a removed place", () => {
    const entries = [0, 999, 1000, 1999, 2000].map((position) => ({ position }));
    expect(withoutRemoved(entries, new Set([1])).map((entry) => entry.position)).toEqual([
      0, 999, 2000,
    ]);
    expect(withoutRemoved(entries, new Set())).toEqual(entries);
  });
});
