import { describe, expect, it } from "vitest";
import { answerAll, joinSimulated } from "@/lib/live";
import {
  CONFORMANCE_CORRECT,
  CONFORMANCE_ITEMS,
  describeRoomConformance,
} from "@/lib/live/roomConformance";
import type { Item } from "@/lib/ngn/schemas";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * The Supabase adapter against the *same* suite the in-memory adapter runs (#131's first
 * acceptance criterion), plus the three things only this adapter can be asked: what actually goes
 * over the wire, how many Realtime messages a real class costs, and that sixty participants
 * answering twenty items still costs one message per item change.
 *
 * `createFakeRoom` stands Postgres and the Realtime server up in process. The transports, the two
 * route handlers, the token, the scoring and every `Request`/`Response` in between are the real
 * ones; the SQL the fake stands in for is covered by pgTAP in
 * `supabase/tests/database/live_aggregates.test.sql`.
 */

describeRoomConformance("the Supabase adapter", (options) => createFakeRoom(options));

const [FIRST] = CONFORMANCE_ITEMS as [Item];

function room(items: readonly Item[] = CONFORMANCE_ITEMS): FakeRoom {
  return createFakeRoom({
    items,
    code: "LEARN7",
    sessionId: "00000000-0000-0000-0000-00000000cafe",
  });
}

/** Everything the participant's process was handed, as the bytes it was handed them in. */
function wireText(live: FakeRoom): string {
  return live.stack.wire.map((entry) => entry.body).join("\n");
}

describe("what actually reaches a student's browser", () => {
  it("carries no answer key in any payload until the host reveals", async () => {
    const live = room();
    const host = live.host();
    await host.open();
    await host.start();
    await live.settle();

    const ada = live.participant();
    await ada.join(live.code, { displayName: "Ada" });
    await live.settle();
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();

    // Read the bytes, not the objects: every HTTP body and every channel payload this browser
    // has been sent since it opened the page (ADR 0003).
    const before = wireText(live);
    expect(before).not.toContain("answerKey");
    expect(before).not.toContain("correctOptionId");
    expect(before).not.toContain("rationale");
    // The item itself did arrive, so the check above is not passing for want of a payload.
    expect(before).toContain(FIRST.id);
    expect(live.stack.wire.some((entry) => entry.label === "POST /api/live/view")).toBe(true);
    // And the acknowledgement of an answer carries no marks either.
    const ack = live.stack.wire.filter((entry) => entry.label === "POST /api/live/submit").at(-1);
    expect(Object.keys(JSON.parse(ack?.body ?? "{}") as object).sort()).toEqual([
      "itemId",
      "submittedAt",
    ]);

    const seenBefore = live.stack.wire.length;
    await host.reveal();
    await live.settle();

    const after = live.stack.wire
      .slice(seenBefore)
      .map((entry) => entry.body)
      .join("\n");
    expect(after).toContain("answerKey");
    expect(after).toContain("correctOptionId");
  });

  it("sends the answer to the server and never the score back", async () => {
    const live = room();
    const host = live.host();
    await host.open();
    await host.start();
    await live.settle();
    const ada = live.participant();
    await ada.join(live.code, { displayName: "Ada" });
    await live.settle();
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();

    const bodies = wireText(live);
    expect(bodies).not.toContain('"points"');
    expect(bodies).not.toContain('"maxPoints"');
    // The marks were written down all the same, on the server, where the key is.
    expect(live.stack.responses).toHaveLength(1);
    expect(live.stack.responses[0]?.points).toBe(1);
  });

  it("never sends an aggregate to a participant's channel", async () => {
    const live = room();
    const host = live.host();
    await host.open();
    await host.start();
    await live.settle();
    const ada = live.participant();
    await ada.join(live.code, { displayName: "Ada" });
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await host.reveal();
    await live.settle();

    expect(live.stack.aggregates).toHaveLength(1);
    expect(live.stack.wire.every((entry) => !entry.body.includes("full_marks"))).toBe(true);
  });
});

describe("answering an item from a phone (#133)", () => {
  /** A started room with one phone in it, holding the phone's own participant id. */
  async function answering() {
    const live = room();
    const host = live.host();
    await host.open();
    await host.start();
    await live.settle();
    const ada = live.participant();
    const { participantId } = await ada.join(live.code, { displayName: "Ada" });
    await live.settle();
    return { live, host, ada, participantId };
  }

  it("refuses a second answer to the same item, and says which refusal it is", async () => {
    const { live, ada } = await answering();
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();

    await expect(ada.submit(FIRST.id, CONFORMANCE_CORRECT)).rejects.toMatchObject({
      code: "already_answered",
    });
    // One answer on record, whatever the phone did.
    expect(live.stack.responses).toHaveLength(1);
  });

  it("refuses an answer that arrives after the host has moved the room on", async () => {
    const { live, host, ada } = await answering();
    await host.advance();
    await live.settle();
    // The phone was still holding item one when the tap landed.
    await expect(ada.submit(FIRST.id, CONFORMANCE_CORRECT)).rejects.toMatchObject({
      code: "wrong_item",
    });
    expect(live.stack.responses).toHaveLength(0);
  });

  it("refuses an answer to an item whose key is already showing", async () => {
    const { live, host, ada } = await answering();
    await host.reveal();
    await live.settle();
    await expect(ada.submit(FIRST.id, CONFORMANCE_CORRECT)).rejects.toMatchObject({
      code: "already_revealed",
    });
  });

  it("gives a reloaded phone back the answer it sent, and no marks with it", async () => {
    const { live, ada, participantId } = await answering();
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();

    // The page is opened again: the same cookie, no code, and nothing kept in the old tab.
    const reloaded = live.resuming(participantId);
    const view = await reloaded.resume(live.identityOf(participantId));
    await live.settle();

    expect(view.answered).toMatchObject({
      itemId: FIRST.id,
      response: CONFORMANCE_CORRECT,
    });
    // Answered, and still not scored as far as this phone is concerned (ADR 0003).
    expect(view.revealed).toBeNull();
    expect(JSON.stringify(view)).not.toContain("answerKey");
    expect(JSON.stringify(view)).not.toContain("points");
    await reloaded.leave();
  });

  it("says nothing about an answer a phone has not given", async () => {
    const { live, ada, participantId } = await answering();
    const reloaded = live.resuming(participantId);
    expect((await reloaded.resume(live.identityOf(participantId))).answered).toBeNull();
    await reloaded.leave();
    await ada.leave();
  });

  it("hands the key, the rationale and this phone's own marks over at the reveal", async () => {
    const { live, host, ada } = await answering();
    const revealed: unknown[] = [];
    ada.onReveal((entry) => revealed.push(entry));
    await ada.submit(FIRST.id, CONFORMANCE_CORRECT);
    await live.settle();
    expect(revealed).toHaveLength(0);

    await host.reveal();
    await live.settle();
    expect(revealed).toHaveLength(1);
    expect(revealed[0]).toMatchObject({
      itemId: FIRST.id,
      position: 1,
      score: { points: 1, maxPoints: 1 },
    });
  });

  it("carries a keyless item to a phone that never answered, and the key at the reveal", async () => {
    const { live, host, ada, participantId } = await answering();
    const views: { item: unknown; answered: unknown }[] = [];
    // The same connection a student's screen holds: the item, their own answer, the reveal.
    const watcher = live.resuming(participantId);
    watcher.onStudentView((view) => views.push({ item: view.item, answered: view.answered }));
    const opened = await watcher.resume(live.identityOf(participantId));
    expect(opened.item).toMatchObject({ id: FIRST.id });
    expect(opened.item).not.toHaveProperty("answerKey");
    expect(opened.item).not.toHaveProperty("rationale");

    await host.reveal();
    await live.settle();
    expect(views.at(-1)?.item).not.toHaveProperty("answerKey");
    await watcher.leave();
    await ada.leave();
  });
});

describe("a connection whose caller changes its mind", () => {
  it("does not rejoin a room the caller has already left", async () => {
    const live = room();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A join that is still in flight when the component unmounts — a tab closing, a route change.
    const ada = live.participantWith((join) => async (code, identity) => {
      await gate;
      return join(code, identity);
    });

    const joining = ada.join(live.code, { displayName: "Ada" });
    await ada.leave();
    release();

    await expect(joining).rejects.toMatchObject({ code: "not_joined" });
    await live.settle();

    // The room is empty: no name was put back, and no channel was left open behind it.
    const host = live.host();
    expect((await host.open()).roster).toHaveLength(0);
  });

  it("stops listening the moment it leaves, even mid-flight", async () => {
    const live = room();
    const host = live.host();
    await host.open();
    const ada = live.participant();
    await ada.join(live.code, { displayName: "Ada" });
    await live.settle();

    const views: unknown[] = [];
    ada.onSessionState((view) => views.push(view));
    // The host moves the room and the participant leaves in the same turn, before the state
    // change has been fetched.
    const moved = host.start();
    await ada.leave();
    await moved;
    await live.settle();

    expect(views).toHaveLength(0);
  });
});

describe("the free-tier budget (ADR 0002)", () => {
  it("costs one message per item change for sixty participants and twenty items", async () => {
    const items: Item[] = Array.from({ length: 20 }, (_, index) => ({
      ...FIRST,
      id: `${FIRST.id}_${index + 1}`,
    })) as Item[];
    const live = room(items);
    const host = live.host();
    await host.open();

    const people = await joinSimulated(
      live,
      Array.from({ length: 60 }, (_, index) => `Student ${index + 1}`),
    );
    expect(people).toHaveLength(60);

    await host.start();
    await live.settle();
    const roomMessagesAfterStart = live.stack.messagesSent;
    expect(roomMessagesAfterStart).toBe(1);

    for (let position = 1; position <= items.length; position += 1) {
      const item = items[position - 1] as Item;
      const round = await answerAll(people, item.id, () => CONFORMANCE_CORRECT);
      expect(round.submitted).toBe(60);
      await host.reveal();
      if (position < items.length) await host.advance();
      await live.settle();
    }
    await host.end();
    await live.settle();

    expect(live.stack.responses).toHaveLength(1_200);
    // 1 start + 20 reveals + 19 advances + 1 end, each one state row and — except for the start,
    // which has no item behind it yet — one aggregate row. Twelve hundred answers added nothing.
    expect(live.stack.messagesSent).toBe(1 + 20 * 2 + 19 * 2 + 2);
    expect(live.stack.aggregates).toHaveLength(20);
  }, 120_000);
});
