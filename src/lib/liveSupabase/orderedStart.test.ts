import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startingOrder, startingOrderSeed } from "@/lib/ngn/startingOrder";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import type { SessionMode } from "@/lib/live";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * #219 on the wire: an ordered-response item's steps reach a phone scrambled, never in the key's
 * order, in both live modes, and every phone in one room is handed the same order. Read off the
 * bytes the participant's process was sent, with the reveal as the control: the key's order is on
 * the wire then, so the reader below would have seen it before if it had been there.
 */

// The server's secret, as production has one: the seed is keyed with it (secretStartingOrderSeed).
beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_orderedStart_test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const ORDERED = itemSchema.parse(FIXTURES.ordered_response.canonical) as Item;
const KEY = (ORDERED.answerKey as { orderedIds: string[] }).orderedIds;

/** The steps in the order the bytes first list them, read off the `"id":"…"` of each. */
function stepOrder(bytes: string): string[] {
  return [...KEY].sort((a, b) => bytes.indexOf(`"id":"${a}"`) - bytes.indexOf(`"id":"${b}"`));
}

function roomFor(mode: SessionMode, sessionId: string): FakeRoom {
  return createFakeRoom({ items: [ORDERED], code: "LEARN7", sessionId, mode });
}

function wireSince(live: FakeRoom, from = 0): string {
  return live.stack.wire
    .slice(from)
    .map((entry) => entry.body)
    .join("\n");
}

async function joinedRoom(mode: SessionMode, sessionId: string) {
  const live = roomFor(mode, sessionId);
  const host = live.host();
  await host.open();
  await host.start();
  await live.settle();
  await live.participant().join(live.code, { displayName: "Ada" });
  await live.settle();
  return { live, host };
}

describe.each<SessionMode>(["instructor_paced", "student_paced"])(
  "an ordered-response item in a %s room",
  (mode) => {
    it("reaches a phone with its steps out of the key's order until the reveal", async () => {
      // The control on the reader: the item as stored lists its steps in the key's order.
      expect(stepOrder(JSON.stringify(ORDERED))).toEqual(KEY);

      const { live, host } = await joinedRoom(mode, "00000000-0000-0000-0000-0000000219a1");
      const before = wireSince(live);
      for (const id of KEY) expect(before).toContain(`"id":"${id}"`);
      expect(stepOrder(before)).not.toEqual(KEY);
      expect(before).not.toContain(JSON.stringify(KEY));

      // The control on the wire: after the reveal the key's order is there, in those bytes.
      const seen = live.stack.wire.length;
      await host.reveal();
      await live.settle();
      expect(wireSince(live, seen)).toContain(JSON.stringify(KEY));
    });

    it("hands every phone in one room the same order", async () => {
      const live = roomFor(mode, "00000000-0000-0000-0000-0000000219b2");
      const host = live.host();
      await host.open();
      await host.start();
      await live.settle();

      await live.participant().join(live.code, { displayName: "Ada" });
      await live.settle();
      const adaSaw = stepOrder(wireSince(live));
      const seen = live.stack.wire.length;
      await live.participant().join(live.code, { displayName: "Grace" });
      await live.settle();
      expect(stepOrder(wireSince(live, seen))).toEqual(adaSaw);
    });
  },
);

it("is not the order a student could compute from the ids they can see", async () => {
  // A student knows the session id and the item id, and the scramble is public. Replaying it with
  // those as the seed must not reproduce what they were sent, or undoing it would give the
  // authored order, which is the key. Over several rooms, the keyed seed parts from the public one.
  const differs: boolean[] = [];
  for (let s = 0; s < 6; s += 1) {
    const sessionId = `00000000-0000-0000-0000-0000000219d${s}`;
    const { live } = await joinedRoom("instructor_paced", sessionId);
    const replayed = startingOrder(KEY, KEY, startingOrderSeed(sessionId, ORDERED.id));
    differs.push(stepOrder(wireSince(live)).join() !== replayed.join());
  }
  expect(differs.filter(Boolean).length).toBeGreaterThan(3);
});

it("seeds the order by session, so another room may start from another order", async () => {
  const orders = new Set<string>();
  for (let s = 0; s < 6; s += 1) {
    const { live } = await joinedRoom(
      "instructor_paced",
      `00000000-0000-0000-0000-0000000219c${s}`,
    );
    const order = stepOrder(wireSince(live));
    expect(order).not.toEqual(KEY);
    orders.add(order.join());
  }
  expect(orders.size).toBeGreaterThan(1);
});
