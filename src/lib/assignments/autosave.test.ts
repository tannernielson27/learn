import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveResult, type SaveStatus } from "./autosave";

type Answer = { choice: string };

function harness(results: SaveResult[] = []) {
  const sent: [string, string][] = [];
  const statuses: SaveStatus[] = [];
  const replies = [...results];
  const save = vi.fn(async (itemId: string, response: Answer): Promise<SaveResult> => {
    sent.push([itemId, response.choice]);
    return replies.shift() ?? { ok: true };
  });
  const saver = createAutosaver<Answer>({
    save,
    onStatus: (status) => statuses.push(status),
    debounceMs: 800,
    retryMs: [2000, 5000],
  });
  return { saver, save, sent, statuses };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosaver", () => {
  it("waits for a pause, then sends only the newest answer per item", async () => {
    const { saver, sent, statuses } = harness();
    saver.change("item-1", { choice: "a" });
    saver.change("item-1", { choice: "b" });
    saver.change("item-2", { choice: "x" });
    expect(sent).toEqual([]);
    expect(saver.hasUnsaved()).toBe(true);

    await vi.advanceTimersByTimeAsync(800);
    expect(sent).toEqual([
      ["item-1", "b"],
      ["item-2", "x"],
    ]);
    expect(statuses.at(-1)).toBe("saved");
    expect(saver.hasUnsaved()).toBe(false);
  });

  it("puts a failed save back and retries it after a growing pause, saying so", async () => {
    const { saver, sent, statuses } = harness([
      { ok: false, refusal: "failed", final: false },
      { ok: false, refusal: "rate_limited", final: false },
    ]);
    saver.change("item-1", { choice: "a" });
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe("retrying");

    await vi.advanceTimersByTimeAsync(1999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(2);
    expect(statuses.at(-1)).toBe("retrying");

    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([
      ["item-1", "a"],
      ["item-1", "a"],
      ["item-1", "a"],
    ]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("never re-sends an old answer over a newer one made while it was failing", async () => {
    const { saver, sent } = harness([{ ok: false, refusal: "failed", final: false }]);
    saver.change("item-1", { choice: "old" });
    await vi.advanceTimersByTimeAsync(800);
    saver.change("item-1", { choice: "new" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual([
      ["item-1", "old"],
      ["item-1", "new"],
    ]);
  });

  it("treats a thrown save like a failed one", async () => {
    const statuses: SaveStatus[] = [];
    const saver = createAutosaver<Answer>({
      save: async () => {
        throw new Error("offline");
      },
      onStatus: (status) => statuses.push(status),
    });
    saver.change("item-1", { choice: "a" });
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe("retrying");
    saver.dispose();
  });

  it("stops on a refusal no retry can fix and says why", async () => {
    const reasons: (string | undefined)[] = [];
    const { save } = harness();
    save.mockResolvedValueOnce({ ok: false, refusal: "closed", final: true });
    const saver = createAutosaver<Answer>({
      save,
      onStatus: (status, refusal) => reasons.push(`${status}:${refusal ?? ""}`),
    });
    saver.change("item-1", { choice: "a" });
    saver.change("item-2", { choice: "b" });
    await vi.advanceTimersByTimeAsync(800);
    expect(reasons.at(-1)).toBe("stopped:closed");
    expect(save).toHaveBeenCalledTimes(1);
    saver.change("item-3", { choice: "c" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(await saver.flush()).toBe(false);
  });

  it("flushes at once for a submit, and says whether everything reached the server", async () => {
    const { saver, sent } = harness();
    saver.change("item-1", { choice: "a" });
    expect(await saver.flush()).toBe(true);
    expect(sent).toEqual([["item-1", "a"]]);
    expect(await saver.flush()).toBe(true);

    const failing = harness([{ ok: false, refusal: "failed", final: false }]);
    failing.saver.change("item-1", { choice: "a" });
    expect(await failing.saver.flush()).toBe(false);
    expect(failing.saver.hasUnsaved()).toBe(true);
    failing.saver.dispose();
  });

  it("waits for a save already on its way before flushing", async () => {
    let release: (value: SaveResult) => void = () => {};
    const sent: string[] = [];
    const saver = createAutosaver<Answer>({
      save: (_itemId, response) => {
        sent.push(response.choice);
        return sent.length === 1
          ? new Promise<SaveResult>((resolve) => {
              release = resolve;
            })
          : Promise.resolve({ ok: true });
      },
      onStatus: () => {},
    });
    saver.change("item-1", { choice: "a" });
    await vi.advanceTimersByTimeAsync(800);
    saver.change("item-1", { choice: "b" });
    const flushed = saver.flush();
    release({ ok: true });
    expect(await flushed).toBe(true);
    expect(sent).toEqual(["a", "b"]);
  });

  it("sends nothing after it is disposed", async () => {
    const { saver, save } = harness();
    saver.change("item-1", { choice: "a" });
    saver.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    saver.change("item-1", { choice: "b" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
