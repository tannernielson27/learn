import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitUnavailableError, type RateLimitStore } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { BATCH, ON, teacher, fakeClient, type Reply } from "../upload/testing/fakeSupabase";
import { dropEntries, dropEntry, restoreEntry } from "./actions";
import { saveEntryFix } from "./fix";
import {
  AI_IMPORT_REVIEW_LIMIT,
  reviewAllowance,
  takeReviewAction,
  type ReviewAllowance,
} from "./limit";
import { splitCaseStudy } from "./split";

afterEach(() => vi.restoreAllMocks());

const ENTRY = "00000000-0000-4000-8000-0000000000e1";

describe("takeReviewAction (#593 review)", () => {
  it("allows a teacher's changes up to the limit in a minute, then refuses, per teacher", async () => {
    const store = createMemoryRateLimitStore();
    expect(AI_IMPORT_REVIEW_LIMIT).toEqual({ attempts: 120, windowMs: 60_000 });
    for (let i = 0; i < AI_IMPORT_REVIEW_LIMIT.attempts; i += 1) {
      expect(await takeReviewAction("teacher-a", store)).toBe("ok");
    }
    expect(await takeReviewAction("teacher-a", store)).toBe("review_limited");
    expect(await takeReviewAction("teacher-b", store)).toBe("ok");
  });

  it("fails closed when the store cannot answer", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store: RateLimitStore = {
      hit: async () => {
        throw new RateLimitUnavailableError("down");
      },
    };
    expect(await takeReviewAction("teacher-a", store)).toBe("unavailable");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("counts in a bucket of its own, by the account", async () => {
    const hit = vi.fn(async () => true);
    await takeReviewAction("teacher-a", { hit });
    expect(hit).toHaveBeenCalledWith("ai_import_review", "teacher-a", AI_IMPORT_REVIEW_LIMIT);
  });

  it("does not limit a caller that hands in no counter", async () => {
    expect(await reviewAllowance({}, "teacher-a")).toBe("ok");
  });
});

describe("every review change is counted before anything is read (#593 review)", () => {
  const one = { batchId: BATCH, entryId: ENTRY, version: 3 };
  const changes: [string, (deps: never) => Promise<unknown>][] = [
    ["drop", (deps) => dropEntry(deps, one)],
    ["restore", (deps) => restoreEntry(deps, one)],
    ["bulk drop", (deps) => dropEntries(deps, { batchId: BATCH, entries: [one] })],
    ["split", (deps) => splitCaseStudy(deps, one)],
    ["save", (deps) => saveEntryFix(deps, { ...one, values: {} })],
  ];

  it.each(changes)(
    "%s is refused over the limit, with nothing read or written",
    async (_n, run) => {
      for (const [answer, code] of [
        ["review_limited", "review_limited"],
        ["unavailable", "unavailable"],
      ] as [ReviewAllowance, string][]) {
        // No reply is scripted for any table but the workspace switch: a read would throw.
        const { author, session } = teacher(true, {});
        const service = fakeClient({});
        const allow = vi.fn(async () => answer);
        const deps = { author: async () => author, env: ON, service: () => service.client, allow };
        const result = (await run(deps as never)) as { ok: boolean; code: string; message: string };
        expect(result).toMatchObject({ ok: false, code });
        expect(allow).toHaveBeenCalledWith(author.status === "ok" ? author.userId : "");
        expect(session.from.mock.calls.every(([table]) => table === "orgs")).toBe(true);
        expect(service.from).not.toHaveBeenCalled();
      }
    },
  );

  it.each(changes)("%s says the limit in a teacher's words", async (_n, run) => {
    const { author } = teacher(true, {});
    const deps = {
      author: async () => author,
      env: ON,
      service: () => fakeClient({}).client,
      allow: async () => "review_limited" as const,
    };
    const result = (await run(deps as never)) as { message: string };
    expect(result.message).toBe("That is a lot of changes at once. Wait a minute, then try again.");
  });

  it("is not counted for a request that is malformed or not a teacher's", async () => {
    const allow = vi.fn(async () => "ok" as const);
    const { author } = teacher(true, {});
    await dropEntry({ author: async () => author, env: ON, allow }, { batchId: "x" });
    await dropEntry({ author: async () => ({ status: "forbidden" }), env: ON, allow }, one);
    expect(allow).not.toHaveBeenCalled();
  });
});

describe("dropEntries when a part fails (#593 review)", () => {
  const many = Array.from({ length: 65 }, (_, index) => ({
    entryId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    version: 1,
  }));
  const first: Reply = { data: [{ id: many[0]!.entryId, version: 2 }] };

  it("names what the earlier parts dropped alongside the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { author, session } = teacher(true, {
      ai_import_batches: [{ data: { status: "review" } }],
      // The second of three parts fails: the third is not sent.
      ai_import_entries: [first, { error: { code: "XX000" } }],
    });
    const result = await dropEntries(
      { author: async () => author, env: ON },
      { batchId: BATCH, entries: many },
    );
    expect(result).toEqual({
      ok: false,
      code: "unavailable",
      message: "Dropped 1, then it stopped working. Try again for the rest.",
      dropped: [{ id: many[0]!.entryId, version: 2 }],
    });
    expect(session.stepsOn("ai_import_entries", "or")).toHaveLength(2);
  });

  it("answers plainly when the first part fails and nothing was dropped", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { author } = teacher(true, {
      ai_import_batches: [{ data: { status: "review" } }],
      ai_import_entries: [{ error: { code: "XX000" } }],
    });
    const result = await dropEntries(
      { author: async () => author, env: ON },
      { batchId: BATCH, entries: many },
    );
    expect(result).toMatchObject({ ok: false, code: "unavailable", dropped: [] });
    expect((result as { message: string }).message).not.toMatch(/^Dropped/);
  });
});
