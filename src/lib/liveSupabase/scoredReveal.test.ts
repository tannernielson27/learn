import { describe, expect, it } from "vitest";
import type { SessionMode } from "@/lib/live";
import { CONFORMANCE_CORRECT, CONFORMANCE_ITEMS } from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";
import { isBeforeRevealMigration } from "./scoredReveal";
import type { RevealedPayload } from "./wire";

/**
 * An answer is marked against the key it was scored with (`session_responses.reveal`), not the
 * one an author has put on the item since. Driven through the real submit and view routes on the
 * fake stack, in both pacings, with the stored key and without it.
 */

const [FIRST] = CONFORMANCE_ITEMS as [Item, ...Item[]];
// CONFORMANCE_CORRECT picks opt_a, which is FIRST's key when the class answers.
const EDITED_KEY = { correctOptionId: "opt_c" };

async function answeredRoom(mode: SessionMode, options: { beforeMigration?: boolean } = {}) {
  const live = createFakeRoom({
    items: CONFORMANCE_ITEMS,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-0000000000b7",
    mode,
  });
  live.stack.beforeRevealMigration = options.beforeMigration ?? false;
  const host = live.host();
  await host.open();
  await host.start();
  await live.settle();
  const ada = live.participant();
  const grace = live.participant();
  await ada.join(live.code, { displayName: "Ada" });
  await grace.join(live.code, { displayName: "Grace" });
  await live.settle();
  await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
  return { live, host };
}

/** The author edits the first item under the running session: the key moves off opt_a. */
function editFirstItem(live: FakeRoom): void {
  const row = live.stack.items[0];
  if (!row) throw new Error("the room has no first item");
  row.answer_key = EDITED_KEY;
}

/** Every reveal of the first item handed to a phone since `from`. */
function revealsOfFirst(live: FakeRoom, from: number): RevealedPayload[] {
  return live.stack.wire
    .slice(from)
    .filter((entry) => entry.label === "POST /api/live/view")
    .flatMap((entry) => {
      const view = JSON.parse(entry.body) as {
        revealed?: RevealedPayload | null;
        set?: { revealed: RevealedPayload | null }[];
      };
      const all = view.set ? view.set.map((each) => each.revealed) : [view.revealed ?? null];
      return all.filter((each): each is RevealedPayload => each?.itemId === FIRST.id);
    });
}

async function revealAfterEdit(live: FakeRoom, host: ReturnType<FakeRoom["host"]>) {
  editFirstItem(live);
  const seen = live.stack.wire.length;
  await host.reveal();
  await live.settle();
  const reveals = revealsOfFirst(live, seen);
  const scored = reveals.filter((each) => each.score !== null);
  const unscored = reveals.filter((each) => each.score === null);
  return { scored, unscored };
}

const keyOf = (revealed: RevealedPayload) =>
  (revealed.reveal.answerKey as { correctOptionId: string }).correctOptionId;

describe.each<SessionMode>(["instructor_paced", "student_paced"])(
  "the reveal after an author edits the item (%s)",
  (mode) => {
    it("marks an answer against the key it was scored with", async () => {
      const { live, host } = await answeredRoom(mode);
      const { scored, unscored } = await revealAfterEdit(live, host);

      expect(scored.length).toBeGreaterThan(0);
      for (const revealed of scored) {
        expect(revealed.score?.points).toBe(1);
        // Points and marks from one key: the one Ada was scored against, not the edited one.
        expect(keyOf(revealed)).toBe("opt_a");
      }
      // Grace never answered, so there is no score to agree with: she sees the key as it is now.
      expect(unscored.length).toBeGreaterThan(0);
      for (const revealed of unscored) expect(keyOf(revealed)).toBe("opt_c");
    });

    it("falls back to the item as it is now for a row stored without a reveal", async () => {
      const { live, host } = await answeredRoom(mode);
      for (const row of live.stack.responses) row.reveal = null;
      const { scored } = await revealAfterEdit(live, host);

      expect(scored.length).toBeGreaterThan(0);
      for (const revealed of scored) {
        expect(revealed.score?.points).toBe(1);
        expect(keyOf(revealed)).toBe("opt_c");
      }
    });

    it("still takes and reveals answers on a database the migration has not reached", async () => {
      const { live, host } = await answeredRoom(mode, { beforeMigration: true });
      expect(live.stack.responses).toHaveLength(1);
      expect(live.stack.responses[0]?.reveal).toBeNull();

      const { scored } = await revealAfterEdit(live, host);
      expect(scored.length).toBeGreaterThan(0);
      for (const revealed of scored) {
        expect(revealed.score?.points).toBe(1);
        expect(keyOf(revealed)).toBe("opt_c");
      }
    });

    it("stores the key with the score, and none of it reaches a phone before the reveal", async () => {
      const { live, host } = await answeredRoom(mode);
      // The key really is in the row, so its absence from the wire below is not for want of it.
      expect(live.stack.responses[0]?.reveal).toMatchObject({
        answerKey: { correctOptionId: "opt_a" },
      });
      await host.pause();
      await host.resume();
      await live.settle();

      const before = live.stack.wire.map((entry) => entry.body).join("\n");
      expect(before).not.toContain("answerKey");
      expect(before).not.toContain("correctOptionId");
      expect(before).not.toContain("rationale");
      expect(before).not.toContain('"reveal":{');
      expect(before).not.toContain('"points"');

      // The control: the same wire, once the host shows answers.
      const seen = live.stack.wire.length;
      await host.reveal();
      await live.settle();
      const after = live.stack.wire
        .slice(seen)
        .map((entry) => entry.body)
        .join("\n");
      expect(after).toContain("answerKey");
      expect(after).toContain("correctOptionId");
      expect(after).toContain('"points"');
    });
  },
);

describe("isBeforeRevealMigration", () => {
  it("is true only for the errors a database without the migration answers with", () => {
    expect(isBeforeRevealMigration({ code: "PGRST202" })).toBe(true);
    expect(isBeforeRevealMigration({ code: "PGRST204" })).toBe(true);
    expect(isBeforeRevealMigration({ code: "42703" })).toBe(true);
    expect(isBeforeRevealMigration({ code: "42501" })).toBe(false);
    expect(isBeforeRevealMigration({ message: "connection refused" })).toBe(false);
    expect(isBeforeRevealMigration(null)).toBe(false);
    expect(isBeforeRevealMigration(undefined)).toBe(false);
  });
});
