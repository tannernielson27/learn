import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryRoom,
  initialSessionState,
  type ItemAggregate,
  type ParticipantItem,
  type SessionView,
} from "@/lib/live";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { describeRoomConformance, type ConformanceRoom } from "./roomConformance";

/**
 * The in-memory adapter (#130) against the shared conformance suite, plus the handful of rules
 * that are only about *this* adapter: its defaults, its injected clock, and the fact that it
 * copies the items it is handed. Everything an adapter owes the interface lives in
 * `roomConformance.ts` and runs here and in `src/lib/liveSupabase/supabaseRoom.test.ts` alike.
 */

let clock = 1_000;
const now = () => (clock += 1);

describeRoomConformance("the in-memory adapter", ({ items, code, sessionId, mode }) => {
  clock = 1_000;
  const room = createInMemoryRoom({ items, code, sessionId, mode, now });
  const conforming: ConformanceRoom = {
    sessionId: room.sessionId,
    code: room.code,
    mode: room.mode,
    currentState: async () => room.currentState(),
    participant: () => room.participant(),
    host: () => room.host(),
    // Nothing travels: a listener has already been called by the time the call that moved the
    // room resolves.
    settle: async () => {},
    tick: (ms) => {
      clock += ms;
    },
    clock: () => clock,
    dispose: async () => {},
  };
  return conforming;
});

const first = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const ITEMS: Item[] = [first];
const CORRECT: AnyResponse = { type: "multiple_choice", optionId: "opt_a" };

describe("the in-memory room itself", () => {
  it("names its participants in the order they arrived", async () => {
    const room = createInMemoryRoom({ items: ITEMS });
    const one = await room.participant().join(room.code, { displayName: "Ada" });
    const two = await room.participant().join(room.code, { displayName: "Grace" });
    expect([one.participantId, two.participantId]).toEqual(["p1", "p2"]);
  });

  it("takes a clock, so nothing depends on wall time", async () => {
    const tick = vi.fn(() => 42);
    const room = createInMemoryRoom({ items: ITEMS, now: tick });
    const host = room.host();
    await host.open();
    await host.start();
    const ada = room.participant();
    await ada.join(room.code, { displayName: "Ada" });
    expect((await ada.submit(first.id, CORRECT)).submittedAt).toBe(42);
    expect(tick).toHaveBeenCalled();
  });

  it("defaults its code, id and mode", () => {
    const room = createInMemoryRoom({ items: ITEMS });
    expect(room.code).toBe("LEARN7");
    expect(room.sessionId).toBe("in-memory-session");
    expect(room.mode).toBe("instructor_paced");
  });

  it("takes the mode it is given", () => {
    expect(createInMemoryRoom({ items: ITEMS, mode: "student_paced" }).mode).toBe("student_paced");
  });

  it("copies the items it is handed, so a later push does not change the set", () => {
    const items = [...ITEMS];
    const room = createInMemoryRoom({ items });
    items.push(first);
    expect(room.currentState().itemCount).toBe(1);
  });

  it("holds the aggregate for the item the room is on before anyone has answered", async () => {
    const room = createInMemoryRoom({ items: ITEMS });
    const host = room.host();
    await host.open();
    await host.start();
    const snapshot = await host.open();
    expect(snapshot.aggregate).toMatchObject<Partial<ItemAggregate>>({
      itemId: first.id,
      position: 1,
      responded: 0,
      maxPoints: 1,
    });
  });

  it("hands phones an ordered-response item's steps in one room-wide order, never the key's (#219)", async () => {
    const ordered = itemSchema.parse(FIXTURES.ordered_response.canonical);
    if (ordered.type !== "ordered_response") throw new Error("fixture type");
    const shownIn = async (sessionId: string) => {
      const room = createInMemoryRoom({ items: [ordered], sessionId });
      const host = room.host();
      await host.open();
      await host.start();
      const ada = await room.participant().join(room.code, { displayName: "Ada" });
      const grace = await room.participant().join(room.code, { displayName: "Grace" });
      const steps = (view: SessionView<ParticipantItem>) =>
        view.item?.type === "ordered_response" ? view.item.content.items.map((s) => s.id) : [];
      expect(steps(grace)).toEqual(steps(ada));
      return steps(ada);
    };
    const orders = new Set<string>();
    for (let s = 0; s < 8; s += 1) {
      const order = await shownIn(`session-${s}`);
      expect(order).toHaveLength(ordered.answerKey.orderedIds.length);
      expect(order).not.toEqual(ordered.answerKey.orderedIds);
      orders.add(order.join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("will not compile if a host's view is put on a participant's channel", () => {
    const participantListener = (view: SessionView<ParticipantItem>) => view.item;
    const hostView: SessionView<Item> = { state: initialSessionState(1), item: first };
    // @ts-expect-error an item that still has an answerKey is not a ParticipantItem (ADR 0003).
    participantListener(hostView);
    // The keyless one is, so the branding refuses only what it should.
    const accepted = participantListener({
      state: initialSessionState(1),
      item: toKeylessItem(first),
    });
    expect(accepted).toMatchObject({ id: first.id });
  });
});
