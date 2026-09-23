import { describe, expect, it } from "vitest";
import { answerAll, joinSimulated } from "@/lib/live";
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  CONFORMANCE_WRONG,
} from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * Student-paced mode (#185) on the Supabase adapter, read where it matters: the bytes a phone is
 * handed, and the Realtime messages a class costs. The conformance suite holds the behaviour; this
 * holds the two promises only a real wire can break — no key for any item before "Show answers",
 * and twelve hundred answers that send nothing at all.
 */

const [FIRST, SECOND, THIRD] = CONFORMANCE_ITEMS as [Item, Item, Item];

function pacedRoom(items: readonly Item[] = CONFORMANCE_ITEMS): FakeRoom {
  return createFakeRoom({
    items,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-0000000000a5",
    mode: "student_paced",
  });
}

/** Every payload the participants' processes were handed, since `from`, as bytes. */
function wireSince(live: FakeRoom, from = 0): string {
  return live.stack.wire
    .slice(from)
    .map((entry) => entry.body)
    .join("\n");
}

describe("what reaches a phone in a student-paced room", () => {
  it("carries every item and no key for any of them until Show answers", async () => {
    const live = pacedRoom();
    const host = live.host();
    await host.open();
    await host.start();
    await live.settle();

    const ada = live.participant();
    const grace = live.participant();
    await ada.join(live.code, { displayName: "Ada" });
    await grace.join(live.code, { displayName: "Grace" });
    await live.settle();
    // Different items, in different orders.
    await ada.submit(SECOND.id, CONFORMANCE_WRONG);
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await grace.submit(FIRST.id, CONFORMANCE_WRONG);
    await host.pause();
    await host.resume();
    await live.settle();

    const before = wireSince(live);
    // The whole set did arrive, so what is absent below is not absent for want of a payload.
    for (const item of CONFORMANCE_ITEMS) expect(before).toContain(item.id);
    expect(before).not.toContain("answerKey");
    expect(before).not.toContain("correctOptionId");
    expect(before).not.toContain("correctOptionIds");
    expect(before).not.toContain("rationale");
    expect(before).not.toContain('"points"');
    expect(before).not.toContain('"scoring"');

    // The control: the same phones, the same wire, after the host showed answers.
    const seen = live.stack.wire.length;
    await host.reveal();
    await live.settle();
    const after = wireSince(live, seen);
    expect(after).toContain("answerKey");
    expect(after).toContain("correctOptionId");
    expect(after).toContain("correctOptionIds");
    expect(after).toContain("rationale");
    expect(after).toContain('"points"');
    expect(after).toContain(THIRD.id);
  });

  it("hands a phone its own marks at Show answers, and never another phone's", async () => {
    const live = pacedRoom();
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

    const seen = live.stack.wire.length;
    await host.reveal();
    await live.settle();
    // Grace answered nothing, so no view read after the reveal may carry a mark for her. The
    // views are told apart by the one participant each was read for: the reads are in order, and
    // each phone reads once per state change, so a mark in Grace's is one read too many.
    const views = live.stack.wire
      .slice(seen)
      .filter((entry) => entry.label === "POST /api/live/view")
      .map((entry) => JSON.parse(entry.body) as { set?: { revealed: { score: unknown } }[] });
    const scored = views.map(
      (view) => (view.set ?? []).filter((entry) => entry.revealed.score !== null).length,
    );
    expect(scored.sort()).toEqual([0, 1]);
  });
});

describe("the free-tier budget in a student-paced room (ADR 0002)", () => {
  it("costs five messages for sixty participants answering twenty items", async () => {
    const items: Item[] = Array.from({ length: 20 }, (_, index) => ({
      ...FIRST,
      id: `${FIRST.id}_${index + 1}`,
    })) as Item[];
    const live = pacedRoom(items);
    const host = live.host();
    await host.open();
    const people = await joinSimulated(
      live,
      Array.from({ length: 60 }, (_, index) => `Student ${index + 1}`),
    );

    await host.start();
    await live.settle();
    expect(live.stack.messagesSent).toBe(1);

    // Every phone works through the set in its own order: the last item first, then the rest.
    for (const item of [...items].reverse()) {
      const round = await answerAll(people, item.id, () => CONFORMANCE_CORRECT);
      expect(round.submitted).toBe(60);
    }
    await live.settle();
    // Twelve hundred answers, and not one message.
    expect(live.stack.messagesSent).toBe(1);

    await host.reveal();
    await host.end();
    await live.settle();
    expect(live.stack.responses).toHaveLength(1_200);
    // 1 start + (1 state + 1 aggregate) for Show answers + (1 state + 1 aggregate) for the end.
    expect(live.stack.messagesSent).toBe(5);
  }, 120_000);
});
