import { describe, expect, it, vi } from "vitest";
import { sharedWarningCounts, type WarningCountStore } from "./sharedWarningCounts";

/** A whole-row read that counts `id.length` warnings for each id, and records what it was asked. */
function fakeRead() {
  return vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, id.length])));
}

describe("sharedWarningCounts", () => {
  it("reads every id once when nothing is known yet, keeping the ids' order", async () => {
    const store: WarningCountStore = new Map();
    const read = fakeRead();
    const counts = await sharedWarningCounts(store, ["ccc", "a", "bb"], read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(["ccc", "a", "bb"]);
    expect([...counts]).toEqual([
      ["ccc", 3],
      ["a", 1],
      ["bb", 2],
    ]);
  });

  it("reads nothing when every id is already known, as a page inside the scan", async () => {
    const store: WarningCountStore = new Map();
    const read = fakeRead();
    await sharedWarningCounts(store, ["a", "bb", "ccc", "dddd"], read);
    const page = await sharedWarningCounts(store, ["ccc", "a"], read);
    expect(read).toHaveBeenCalledTimes(1);
    expect([...page]).toEqual([
      ["ccc", 3],
      ["a", 1],
    ]);
  });

  it("reads exactly the ids that are not known yet, as a page outside the scan", async () => {
    const store: WarningCountStore = new Map();
    const read = fakeRead();
    await sharedWarningCounts(store, ["a", "bb"], read);
    const page = await sharedWarningCounts(store, ["zzzzz", "bb", "yyyy"], read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith(["zzzzz", "yyyy"]);
    expect([...page]).toEqual([
      ["zzzzz", 5],
      ["bb", 2],
      ["yyyy", 4],
    ]);
  });

  it("shares a read still in flight instead of starting a second one", async () => {
    const store: WarningCountStore = new Map();
    const read = fakeRead();
    const [scan, page] = await Promise.all([
      sharedWarningCounts(store, ["a", "bb", "ccc"], read),
      sharedWarningCounts(store, ["bb", "a"], read),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(scan.get("ccc")).toBe(3);
    expect([...page]).toEqual([
      ["bb", 2],
      ["a", 1],
    ]);
  });

  it("asks for an id listed twice once", async () => {
    const read = fakeRead();
    await sharedWarningCounts(new Map(), ["a", "a", "bb"], read);
    expect(read).toHaveBeenCalledWith(["a", "bb"]);
  });

  it("counts none for an id the read did not return, as a missing row did before", async () => {
    const read = vi.fn(async () => new Map([["a", 2]]));
    const counts = await sharedWarningCounts(new Map(), ["a", "gone"], read);
    expect([...counts]).toEqual([
      ["a", 2],
      ["gone", 0],
    ]);
  });

  it("reads nothing for an empty list, as an empty scan did before", async () => {
    const read = fakeRead();
    const counts = await sharedWarningCounts(new Map(), [], read);
    expect(read).not.toHaveBeenCalled();
    expect(counts.size).toBe(0);
  });

  it("fails every list waiting on a read that fails, with that read's error", async () => {
    const store: WarningCountStore = new Map();
    const failure = new Error("Items could not be loaded.");
    const read = vi.fn(async () => {
      throw failure;
    });
    const scan = sharedWarningCounts(store, ["a", "bb"], read);
    const page = sharedWarningCounts(store, ["bb"], read);
    await expect(scan).rejects.toBe(failure);
    await expect(page).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("fails the same way when the read throws before it returns a promise", async () => {
    const failure = new Error("Items could not be loaded.");
    const read = vi.fn((): Promise<Map<string, number>> => {
      throw failure;
    });
    await expect(sharedWarningCounts(new Map(), ["a"], read)).rejects.toBe(failure);
  });
});
