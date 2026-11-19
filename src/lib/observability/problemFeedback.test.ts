import { describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_SOURCE,
  createProblemFeedback,
  type ProblemFeedbackDeps,
} from "./problemFeedback";

const DSN = "https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0";
const PAYLOAD = {
  message: "It froze",
  url: "/author",
  associatedEventId: "0123456789abcdef0123456789abcdef",
};

function harness(overrides: Partial<ProblemFeedbackDeps> = {}) {
  const captureFeedback = vi.fn();
  const flush = vi.fn(async () => true);
  const load = vi.fn(async () => ({ captureFeedback, flush }));
  const deferred: (() => Promise<void>)[] = [];
  const send = createProblemFeedback({
    dsn: () => DSN,
    load,
    defer: (task) => {
      deferred.push(task);
    },
    ...overrides,
  });
  return {
    send,
    captureFeedback,
    flush,
    load,
    deferred,
    run: async () => {
      for (const task of deferred.splice(0)) await task();
    },
  };
}

describe("problem feedback to Sentry", () => {
  it("sends after the response, tagged with where it came from, then flushes", async () => {
    const h = harness();
    h.send(PAYLOAD);
    expect(h.captureFeedback).not.toHaveBeenCalled();
    await h.run();
    expect(h.captureFeedback).toHaveBeenCalledWith({ ...PAYLOAD, source: FEEDBACK_SOURCE });
    expect(h.flush).toHaveBeenCalledOnce();
  });

  it.each([undefined, "", "  "])("does nothing and loads nothing when the DSN is %j", (dsn) => {
    const h = harness({ dsn: () => dsn });
    h.send(PAYLOAD);
    expect(h.deferred).toHaveLength(0);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("swallows a failed load and a failed schedule", async () => {
    const blocked = harness({ load: async () => Promise.reject(new Error("blocked")) });
    blocked.send(PAYLOAD);
    await expect(blocked.run()).resolves.toBeUndefined();

    const noAfter = harness({
      defer: () => {
        throw new Error("no after");
      },
    });
    expect(() => noAfter.send(PAYLOAD)).not.toThrow();
  });
});
